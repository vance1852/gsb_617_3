import express from "express";

import authRouter from "./routes/auth";
import museumRouter from "./routes/museums";
import reservationRouter from "./routes/reservations";
import dashboardRouter from "./routes/dashboard";
import waitlistRouter from "./routes/waitlist";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "museum-pass-admin" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/museums", museumRouter);
  app.use("/api/reservations", reservationRouter);
  app.use("/api/waitlist", waitlistRouter);
  app.use("/api/dashboard", dashboardRouter);

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("Unhandled error:", err);
      res.status(500).json({ detail: "服务器内部错误" });
    },
  );

  return app;
}
