import express from "express";
import { healthRouter } from "./routes/health.js";

export function createApp() {
  const app = express();

  // Trust Railway's reverse proxy for correct client IP (BACK-03 prep)
  app.set("trust proxy", 1);

  // Health check — must be available before any middleware
  app.use("/health", healthRouter);

  // NOTE: Additional routes and middleware are mounted here in Plans 02-03:
  // - POST /report (report route + multer + rate limiter)
  // - /webhook/github (octokit webhooks middleware — MUST be before express.json())
  // - express.json() for non-webhook routes

  return app;
}
