import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";

const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
});

// Phase 3/4 will register event callbacks here:
// webhooks.on("issues.labeled", async ({ payload }) => { ... });

export { webhooks };

/**
 * Middleware that handles GitHub webhook delivery at /webhook/github.
 *
 * MUST be mounted BEFORE express.json() — createNodeMiddleware buffers the
 * raw body internally for HMAC-SHA256 signature verification. If express.json()
 * reads the body stream first, the raw bytes are lost and HMAC verification fails.
 */
export const webhookMiddleware = createNodeMiddleware(webhooks, {
  path: "/webhook/github",
});
