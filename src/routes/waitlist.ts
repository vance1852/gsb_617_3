import { Router } from "express";
import { z } from "zod";

import { authMiddleware } from "../auth";
import { prisma } from "../prisma";

const router = Router();
router.use(authMiddleware);

const querySchema = z.object({
  museumId: z
    .string()
    .refine((v) => /^\d+$/.test(v), "museumId 应为整数")
    .transform(Number),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
});

router.get("/", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(422)
      .json({ detail: "请求参数不合法", errors: parsed.error.flatten() });
  }
  const { museumId, date } = parsed.data;

  const museum = await prisma.museum.findUnique({ where: { id: museumId } });
  if (!museum) return res.status(404).json({ detail: "场馆不存在" });

  const entries = await prisma.waitlistEntry.findMany({
    where: { museumId, visitDate: date, status: "waiting" },
    orderBy: { id: "asc" },
  });

  res.json(
    entries.map((e, idx) => ({
      id: e.id,
      museum_id: e.museumId,
      visitor_name: e.visitorName,
      phone: e.phone,
      visit_date: e.visitDate,
      time_slot: e.timeSlot,
      pass_type: e.passType,
      status: e.status,
      queue_position: idx + 1,
      created_at: e.createdAt,
    })),
  );
});

export default router;
