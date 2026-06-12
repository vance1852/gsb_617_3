import { Router } from "express";
import { z } from "zod";

import {
  AuthRequest,
  authMiddleware,
  createToken,
  verifyPassword,
} from "../auth";
import { prisma } from "../prisma";

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ detail: "请求参数不合法" });
  }
  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ detail: "用户名或密码错误" });
  }
  const token = createToken({ id: user.id, username: user.username });
  return res.json({ access_token: token, token_type: "bearer" });
});

router.get("/me", authMiddleware, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    return res.status(404).json({ detail: "用户不存在" });
  }
  return res.json({
    id: user.id,
    username: user.username,
    display_name: user.displayName,
  });
});

export default router;
