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

  // 容量校验：当天该场馆有效预约（非取消）不得超过每日上限
  const used = await prisma.reservation.count({
    where: {
      museumId: data.museumId,
      visitDate: data.visitDate,
      status: { not: "cancelled" },
    },
  });
  if (used >= museum.dailyCapacity) {
    return res.status(409).json({ detail: "该场馆当日预约已满" });
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
  const exists = await prisma.reservation.findUnique({ where: { id } });
  if (!exists) return res.status(404).json({ detail: "预约不存在" });
  const updated = await prisma.reservation.update({
    where: { id },
    data: { status: parsed.data.status },
  });
  res.json({ id: updated.id, status: updated.status });
});

export default router;
