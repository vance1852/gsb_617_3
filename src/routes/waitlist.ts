import { Router } from "express";
import { z } from "zod";

import { authMiddleware } from "../auth";
import { prisma } from "../prisma";

const router = Router();
router.use(authMiddleware);

const waitlistStatusEnum = z.enum(["waiting", "confirmed", "cancelled"]);

const cancelSchema = z.object({
  status: z.literal("cancelled"),
});

router.get("/", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.query.museumId) where.museumId = Number(req.query.museumId);
  if (req.query.visitDate) where.visitDate = String(req.query.visitDate);
  if (req.query.status) {
    const parsed = waitlistStatusEnum.safeParse(req.query.status);
    if (parsed.success) where.status = parsed.data;
  }

  const list = await prisma.waitlist.findMany({
    where,
    orderBy: { id: "asc" },
    include: { museum: { select: { name: true } } },
  });

  const waitingMap = new Map<string, number>();
  for (const item of list) {
    if (item.status !== "waiting") continue;
    const key = `${item.museumId}-${item.visitDate}`;
    const prev = waitingMap.get(key) || 0;
    waitingMap.set(key, prev + 1);
  }

  const positionCache = new Map<number, number>();
  if (list.some((i) => i.status === "waiting")) {
    const waitingItems = list.filter((i) => i.status === "waiting");
    const groups = new Map<string, typeof waitingItems>();
    for (const item of waitingItems) {
      const key = `${item.museumId}-${item.visitDate}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    for (const [, items] of groups) {
      items.sort((a, b) => a.id - b.id);
      items.forEach((item, idx) => {
        positionCache.set(item.id, idx + 1);
      });
    }
  }

  res.json(
    list.map((w) => ({
      id: w.id,
      museum_id: w.museumId,
      museum_name: w.museum?.name ?? null,
      visitor_name: w.visitorName,
      phone: w.phone,
      visit_date: w.visitDate,
      time_slot: w.timeSlot,
      pass_type: w.passType,
      status: w.status,
      position: positionCache.get(w.id) ?? null,
      created_at: w.createdAt,
      confirmed_at: w.confirmedAt,
    })),
  );
});

router.patch("/:id/status", async (req, res) => {
  const parsed = cancelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ detail: "状态不合法" });
  }
  const id = Number(req.params.id);
  const exists = await prisma.waitlist.findUnique({ where: { id } });
  if (!exists) return res.status(404).json({ detail: "候补记录不存在" });
  if (exists.status !== "waiting") {
    return res.status(422).json({ detail: "当前状态下无法取消候补" });
  }
  const updated = await prisma.waitlist.update({
    where: { id },
    data: { status: "cancelled" },
  });
  res.json({ id: updated.id, status: updated.status });
});

export default router;
