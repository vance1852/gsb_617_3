import { Router } from "express";

import { authMiddleware } from "../auth";
import { prisma } from "../prisma";

const router = Router();
router.use(authMiddleware);

router.get("/stats", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const [museumTotal, museumOpen, reservationTotal, bookedToday, visitedToday] =
    await Promise.all([
      prisma.museum.count(),
      prisma.museum.count({ where: { status: "open" } }),
      prisma.reservation.count(),
      prisma.reservation.count({
        where: { visitDate: today, status: "booked" },
      }),
      prisma.reservation.count({
        where: { visitDate: today, status: "visited" },
      }),
    ]);
  res.json({
    museum_total: museumTotal,
    museum_open: museumOpen,
    reservation_total: reservationTotal,
    booked_today: bookedToday,
    visited_today: visitedToday,
  });
});

export default router;
