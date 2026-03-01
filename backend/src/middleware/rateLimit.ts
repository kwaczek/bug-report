import { rateLimit } from "express-rate-limit";

/**
 * IP-based rate limiter for the /report endpoint.
 * Allows 10 submissions per IP per hour (BACK-03).
 */
export const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,                 // 10 requests per IP per hour
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many reports, please try again later" },
});
