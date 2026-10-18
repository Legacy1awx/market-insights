import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo.ts";
import { emailRouter } from "./routes/email.ts";
import { adminRouter, publicAdminDataRouter } from "./routes/admin.ts";
import { depositRouter } from "./routes/deposits.ts";
import { investmentsRouter } from "./routes/investments.ts";
import { withdrawalRouter } from "./routes/withdrawals.ts";

export function createServer() {
  const app = express();
  app.disable("x-powered-by");
  // Behind Netlify/Vercel proxies, trust one hop so request.ip is the client.
  if (process.env.NETLIFY || process.env.VERCEL) app.set("trust proxy", 1);

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);
  app.use("/api", publicAdminDataRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/deposits", depositRouter);
  app.use("/api/investments", investmentsRouter);
  app.use("/api/withdrawals", withdrawalRouter);
  app.use("/api/email", emailRouter);

  return app;
}
