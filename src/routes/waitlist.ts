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
});

const statusSchema = z.object({
  status: z.enum(["waiting", "confirmed", "cancelled"]),
});

router.get("/", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.query.museumId) where.museumId = Number(req.query.museumId);
  if (req.query.date) where.visitDate = String(req.query.date);
  if (req.query.status) where.status = String(req.query.status);
  const list = await prisma.waitlist.findMany({
    where,
    orderBy: { id: "asc" },
    include: { museum: { select: { name: true } } },
  });
  res.json(
    list.map((w, idx) => ({
      id: w.id,
      museum_id: w.museumId,
      museum_name: w.museum?.name ?? null,
      visitor_name: w.visitorName,
      phone: w.phone,
      visit_date: w.visitDate,
      time_slot: w.timeSlot,
      pass_type: w.passType,
      status: w.status,
      position: idx + 1,
      reservation_id: w.reservationId ?? null,
      created_at: w.createdAt.toISOString(),
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
  if (used < museum.dailyCapacity) {
    return res
      .status(422)
      .json({ detail: "该场馆当日仍有名额，请直接预约" });
  }

  const created = await prisma.waitlist.create({
    data: {
      museumId: data.museumId,
      visitorName: data.visitorName,
      phone: data.phone,
      visitDate: data.visitDate,
      timeSlot: data.timeSlot,
      passType: data.passType,
    },
  });

  const waitingCount = await prisma.waitlist.count({
    where: {
      museumId: data.museumId,
      visitDate: data.visitDate,
      status: "waiting",
      id: { lte: created.id },
    },
  });

  res.status(201).json({
    id: created.id,
    museum_id: created.museumId,
    visitor_name: created.visitorName,
    visit_date: created.visitDate,
    time_slot: created.timeSlot,
    pass_type: created.passType,
    status: created.status,
    position: waitingCount,
  });
});

router.patch("/:id/status", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ detail: "状态不合法" });
  }
  const id = Number(req.params.id);
  const exists = await prisma.waitlist.findUnique({ where: { id } });
  if (!exists) return res.status(404).json({ detail: "候补记录不存在" });
  const updated = await prisma.waitlist.update({
    where: { id },
    data: { status: parsed.data.status },
  });
  res.json({ id: updated.id, status: updated.status });
});

export default router;
