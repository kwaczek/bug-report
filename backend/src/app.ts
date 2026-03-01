import express from "express";
import { healthRouter } from "./routes/health.js";
import { reportRouter } from "./routes/report.js";
import { reportLimiter } from "./middleware/rateLimit.js";
import { webhookMiddleware } from "./middleware/webhook.js";

export function createApp() {
  const app = express();

  // Trust Railway's reverse proxy so express-rate-limit sees the real client IP
  app.set("trust proxy", 1);

  // 1. Health check — always available, no middleware dependencies
  app.use("/health", healthRouter);

  // 2. Webhook HMAC middleware — MUST be before express.json()
  //    createNodeMiddleware buffers the raw body for HMAC-SHA256 verification.
  //    Body stream can only be consumed once; if express.json() reads it first
  //    the raw bytes are lost and every webhook signature check fails.
  app.use(webhookMiddleware);

  // 3. CORS headers for widget cross-origin POST
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // 4. JSON body parser for non-multipart routes (comes after webhook middleware)
  app.use(express.json());

  // 5. Report route with rate limiter applied before multer processes the body.
  //    reportRouter has router.post("/", upload.array(...), handler) internally,
  //    so app.use mounts the router and multer only runs on /report requests.
  app.use("/report", reportLimiter, reportRouter);

  return app;
}
