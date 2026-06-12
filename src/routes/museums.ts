import { Router } from "express";
import { z } from "zod";

import { authMiddleware } from "../auth";
import { prisma } from "../prisma";

const router = Router();
router.use(authMiddleware);

const statusEnum = z.enum(["open", "closed", "maintenance"]);

const createSchema = z.object({
  name: z.string().min(1).max(128),
  address: z.string().max(255).optional().default(""),
  dailyCapacity: z.number().int().min(0).optional().default(0),
  status: statusEnum.optional().default("open"),
});

const updateSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  address: z.string().max(255).optional(),
  dailyCapacity: z.number().int().min(0).optional(),
  status: statusEnum.optional(),
});

router.get("/", async (_req, res) => {
  const museums = await prisma.museum.findMany({ orderBy: { id: "asc" } });
  res.json(museums);
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(422)
      .json({ detail: "请求参数不合法", errors: parsed.error.flatten() });
  }
  const museum = await prisma.museum.create({ data: parsed.data });
  res.status(201).json(museum);
});

router.get("/:id", async (req, res) => {
  const museum = await prisma.museum.findUnique({
    where: { id: Number(req.params.id) },
  });
  if (!museum) return res.status(404).json({ detail: "场馆不存在" });
  res.json(museum);
});

router.put("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ detail: "请求参数不合法" });
  }
  const id = Number(req.params.id);
  const exists = await prisma.museum.findUnique({ where: { id } });
  if (!exists) return res.status(404).json({ detail: "场馆不存在" });
  const museum = await prisma.museum.update({
    where: { id },
    data: parsed.data,
  });
  res.json(museum);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const exists = await prisma.museum.findUnique({ where: { id } });
  if (!exists) return res.status(404).json({ detail: "场馆不存在" });
  await prisma.museum.delete({ where: { id } });
  res.status(204).send();
});

export default router;
