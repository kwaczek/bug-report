import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import type { RequestHandler } from "express";

// Lazily initialised so the module can be imported without GITHUB_WEBHOOK_SECRET
// set (e.g. during local dev or test runs).  The actual Webhooks instance is
// created on first use, not at module-load time.
let _webhooks: Webhooks | null = null;
let _middlewareFn: RequestHandler | null = null;

function getWebhooks(): Webhooks {
  if (!_webhooks) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error(
        "[webhook] GITHUB_WEBHOOK_SECRET env var is not set — webhook endpoint disabled",
      );
    }
    _webhooks = new Webhooks({ secret });
  }
  return _webhooks;
}

/**
 * Express middleware that handles GitHub webhook delivery at /webhook/github.
 *
 * MUST be mounted BEFORE express.json() — createNodeMiddleware buffers the
 * raw body internally for HMAC-SHA256 signature verification. If express.json()
 * reads the body stream first, the raw bytes are lost and HMAC verification fails.
 *
 * Lazily initialised: if GITHUB_WEBHOOK_SECRET is missing at startup the server
 * still starts, but webhook requests will receive a 500 error instead of silently
 * failing with a bad HMAC.
 */
export const webhookMiddleware: RequestHandler = (req, res, next) => {
  if (!_middlewareFn) {
    try {
      const wh = getWebhooks();
      // Phase 3/4 will register event callbacks here:
      // wh.on("issues.labeled", async ({ payload }) => { ... });
      _middlewareFn = createNodeMiddleware(wh, {
        path: "/webhook/github",
      }) as unknown as RequestHandler;
    } catch (err) {
      if (req.path === "/webhook/github") {
        console.error(err);
        res.status(500).json({ error: "Webhook endpoint not configured" });
        return;
      }
      // Not a webhook path — pass through normally
      next();
      return;
    }
  }
  _middlewareFn(req, res, next);
};

/** Exposed for Phase 3/4 to register event callbacks (e.g. issues.labeled). */
export function getWebhooksInstance(): Webhooks {
  return getWebhooks();
}
