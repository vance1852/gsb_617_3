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
  waitIfFull: z.boolean().optional().default(false),
});

const statusSchema = z.object({
  status: z.enum(["booked", "visited", "cancelled"]),
});

router.get("/", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.query.museumId) where.museumId = Number(req.query.museumId);
  if (req.query.date) where.visitDate = String(req.query.date);
  if (req.query.status) where.status = String(req.query.status);
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

router.get("/waitlist", async (req, res) => {
  const museumId = req.query.museumId ? Number(req.query.museumId) : null;
  const visitDate = req.query.visitDate ? String(req.query.visitDate) : null;
  if (!museumId || !visitDate) {
    return res.status(422).json({ detail: "请提供场馆 ID 和日期" });
  }
  const list = await prisma.reservation.findMany({
    where: {
      museumId,
      visitDate,
      status: "waitlist",
    },
    orderBy: { id: "asc" },
  });
  res.json(
    list.map((r, idx) => ({
      id: r.id,
      position: idx + 1,
      visitor_name: r.visitorName,
      phone: r.phone,
      time_slot: r.timeSlot,
      pass_type: r.passType,
      created_at: r.createdAt,
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

  const result = await prisma.$transaction(async (tx) => {
    const museum = await tx.$queryRaw<Array<{ id: number; status: string; daily_capacity: number; name: string }>>`
      SELECT id, status, daily_capacity, name FROM museums WHERE id = ${data.museumId} FOR UPDATE
    `;
    if (museum.length === 0) return { type: "museum_not_found" as const };
    const m = museum[0];
    if (m.status !== "open") return { type: "museum_closed" as const };

    const used = await tx.reservation.count({
      where: {
        museumId: data.museumId,
        visitDate: data.visitDate,
        status: { in: ["booked", "visited"] },
      },
    });

    if (used < m.daily_capacity) {
      const created = await tx.reservation.create({
        data: {
          museumId: data.museumId,
          visitorName: data.visitorName,
          phone: data.phone,
          visitDate: data.visitDate,
          timeSlot: data.timeSlot,
          passType: data.passType,
          status: "booked",
        },
      });
      return { type: "booked" as const, reservation: created };
    }

    if (!data.waitIfFull) {
      return { type: "full" as const };
    }

    const waitlisted = await tx.reservation.create({
      data: {
        museumId: data.museumId,
        visitorName: data.visitorName,
        phone: data.phone,
        visitDate: data.visitDate,
        timeSlot: data.timeSlot,
        passType: data.passType,
        status: "waitlist",
      },
    });

    const waitlistCount = await tx.reservation.count({
      where: {
        museumId: data.museumId,
        visitDate: data.visitDate,
        status: "waitlist",
        id: { lte: waitlisted.id },
      },
    });

    return { type: "waitlist" as const, reservation: waitlisted, position: waitlistCount };
  });

  switch (result.type) {
    case "museum_not_found":
      return res.status(404).json({ detail: "场馆不存在" });
    case "museum_closed":
      return res.status(422).json({ detail: "该场馆当前不可预约" });
    case "full":
      return res.status(409).json({ detail: "该场馆当日预约已满" });
    case "booked":
      return res.status(201).json({
        id: result.reservation.id,
        museum_id: result.reservation.museumId,
        visitor_name: result.reservation.visitorName,
        visit_date: result.reservation.visitDate,
        time_slot: result.reservation.timeSlot,
        pass_type: result.reservation.passType,
        status: result.reservation.status,
      });
    case "waitlist":
      return res.status(202).json({
        id: result.reservation.id,
        museum_id: result.reservation.museumId,
        visitor_name: result.reservation.visitorName,
        visit_date: result.reservation.visitDate,
        time_slot: result.reservation.timeSlot,
        pass_type: result.reservation.passType,
        status: result.reservation.status,
        waitlist_position: result.position,
      });
  }
});

router.patch("/:id/status", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ detail: "状态不合法" });
  }
  const id = Number(req.params.id);
  const targetStatus = parsed.data.status;

  const result = await prisma.$transaction(async (tx) => {
    const exists = await tx.reservation.findUnique({ where: { id } });
    if (!exists) return { type: "not_found" as const };

    const updated = await tx.reservation.update({
      where: { id },
      data: { status: targetStatus },
    });

    let promoted: { id: number; visitorName: string } | null = null;

    if (
      exists.status !== "cancelled" &&
      exists.status !== "waitlist" &&
      targetStatus === "cancelled"
    ) {
      await tx.$queryRaw`
        SELECT id FROM museums WHERE id = ${exists.museumId} FOR UPDATE
      `;

      const used = await tx.reservation.count({
        where: {
          museumId: exists.museumId,
          visitDate: exists.visitDate,
          status: { in: ["booked", "visited"] },
        },
      });

      const museum = await tx.museum.findUnique({
        where: { id: exists.museumId },
      });

      if (museum && used < museum.dailyCapacity) {
        const firstWaitlist = await tx.reservation.findFirst({
          where: {
            museumId: exists.museumId,
            visitDate: exists.visitDate,
            status: "waitlist",
          },
          orderBy: { id: "asc" },
        });
        if (firstWaitlist) {
          const promotedRecord = await tx.reservation.update({
            where: { id: firstWaitlist.id },
            data: { status: "booked" },
          });
          promoted = { id: promotedRecord.id, visitorName: promotedRecord.visitorName };
        }
      }
    }

    return { type: "ok" as const, updated, promoted };
  });

  if (result.type === "not_found") {
    return res.status(404).json({ detail: "预约不存在" });
  }

  res.json({
    id: result.updated.id,
    status: result.updated.status,
    promoted_waitlist: result.promoted
      ? {
          id: result.promoted.id,
          visitor_name: result.promoted.visitorName,
        }
      : null,
  });
});

export default router;
