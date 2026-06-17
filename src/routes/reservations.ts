import { Router } from "express";
import { z } from "zod";

import { authMiddleware } from "../auth";
import { prisma } from "../prisma";

const router = Router();
router.use(authMiddleware);

const createSchema = z.object({
  museumId: z.number().int(),
  visitorName: z.string().min(1).max(64),
  phone: z.string().max(32).optional().default(""),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
  timeSlot: z.enum(["am", "pm"]),
  passType: z.enum(["single", "annual"]).optional().default("single"),
  waitlist: z.boolean().optional().default(false),
});

const statusSchema = z.object({
  status: z.enum(["booked", "visited", "cancelled"]),
});

router.get("/", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.query.museumId) where.museumId = Number(req.query.museumId);
  if (req.query.date) where.visitDate = String(req.query.date);
  const list = await prisma.reservation.findMany({
    where,
    orderBy: { id: "desc" },
    include: { museum: { select: { name: true } } },
  });
  res.json(
    list.map((r) => ({
      id: r.id,
      museum_id: r.museumId,
      museum_name: r.museum?.name ?? null,
      visitor_name: r.visitorName,
      phone: r.phone,
      visit_date: r.visitDate,
      time_slot: r.timeSlot,
      pass_type: r.passType,
      status: r.status,
    })),
  );
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(422)
      .json({ detail: "请求参数不合法", errors: parsed.error.flatten() });
  }
  const data = parsed.data;
  const museum = await prisma.museum.findUnique({
    where: { id: data.museumId },
  });
  if (!museum) return res.status(404).json({ detail: "场馆不存在" });
  if (museum.status !== "open") {
    return res.status(422).json({ detail: "该场馆当前不可预约" });
  }

  const used = await prisma.reservation.count({
    where: {
      museumId: data.museumId,
      visitDate: data.visitDate,
      status: { not: "cancelled" },
    },
  });

  if (used >= museum.dailyCapacity) {
    if (!data.waitlist) {
      return res.status(409).json({ detail: "该场馆当日预约已满" });
    }
    const entry = await prisma.waitlistEntry.create({
      data: {
        museumId: data.museumId,
        visitorName: data.visitorName,
        phone: data.phone,
        visitDate: data.visitDate,
        timeSlot: data.timeSlot,
        passType: data.passType,
      },
    });
    const position = await prisma.waitlistEntry.count({
      where: {
        museumId: data.museumId,
        visitDate: data.visitDate,
        status: "waiting",
        id: { lte: entry.id },
      },
    });
    return res.status(202).json({
      id: entry.id,
      museum_id: entry.museumId,
      visitor_name: entry.visitorName,
      phone: entry.phone,
      visit_date: entry.visitDate,
      time_slot: entry.timeSlot,
      pass_type: entry.passType,
      status: "waiting",
      queue_position: position,
    });
  }

  const created = await prisma.reservation.create({ data });
  res.status(201).json({
    id: created.id,
    museum_id: created.museumId,
    visitor_name: created.visitorName,
    visit_date: created.visitDate,
    time_slot: created.timeSlot,
    pass_type: created.passType,
    status: created.status,
  });
});

router.patch("/:id/status", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ detail: "状态不合法" });
  }
  const id = Number(req.params.id);
  const targetStatus = parsed.data.status;

  if (targetStatus === "cancelled") {
    const result = await prisma.$transaction(async (tx) => {
      const exists = await tx.reservation.findUnique({ where: { id } });
      if (!exists) return { error: true, status: 404, detail: "预约不存在" };
      if (exists.status === "cancelled") {
        return { error: true, status: 422, detail: "预约已取消，不可重复操作" };
      }

      const updated = await tx.reservation.update({
        where: { id },
        data: { status: "cancelled" },
      });

      const museum = await tx.museum.findUnique({
        where: { id: exists.museumId },
      });
      if (!museum) return { error: false, result: updated };

      const currentUsed = await tx.reservation.count({
        where: {
          museumId: exists.museumId,
          visitDate: exists.visitDate,
          status: { not: "cancelled" },
        },
      });

      if (currentUsed >= museum.dailyCapacity) {
        return { error: false, result: updated };
      }

      const nextWaiting = await tx.waitlistEntry.findFirst({
        where: {
          museumId: exists.museumId,
          visitDate: exists.visitDate,
          status: "waiting",
        },
        orderBy: { id: "asc" },
      });

      if (!nextWaiting) {
        return { error: false, result: updated };
      }

      const promoted = await tx.waitlistEntry.updateMany({
        where: { id: nextWaiting.id, status: "waiting" },
        data: { status: "promoted" },
      });

      if (promoted.count === 0) {
        return { error: false, result: updated };
      }

      await tx.reservation.create({
        data: {
          museumId: nextWaiting.museumId,
          visitorName: nextWaiting.visitorName,
          phone: nextWaiting.phone,
          visitDate: nextWaiting.visitDate,
          timeSlot: nextWaiting.timeSlot,
          passType: nextWaiting.passType,
          status: "booked",
        },
      });

      return { error: false, result: updated };
    });

    if (result.error) {
      return res.status(result.status!).json({ detail: result.detail });
    }
    return res.json({ id: result.result!.id, status: result.result!.status });
  }

  const exists = await prisma.reservation.findUnique({ where: { id } });
  if (!exists) return res.status(404).json({ detail: "预约不存在" });
  const updated = await prisma.reservation.update({
    where: { id },
    data: { status: targetStatus },
  });
  res.json({ id: updated.id, status: updated.status });
});

export default router;
