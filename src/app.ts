import express from "express";

import authRouter from "./routes/auth";
import museumRouter from "./routes/museums";
import reservationRouter from "./routes/reservations";
import dashboardRouter from "./routes/dashboard";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "museum-pass-admin" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/museums", museumRouter);
  app.use("/api/reservations", reservationRouter);
  app.use("/api/dashboard", dashboardRouter);

  return app;
}
