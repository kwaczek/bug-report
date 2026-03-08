import { getWebhooksInstance } from "../middleware/webhook.js";
import { relabelIssue } from "./issue-relabel.js";

export interface RelayFixPayload {
  issueId: number;
  issueUrl: string;
  issueTitle: string;
  owner: string;
  repo: string;
  mode: 'ralph' | 'gsd';
  triageResult: {
    verdict: "auto-fix";
    confidence: number;
    reasoning: string;
  };
  reportData: {
    subject: string;
    description: string;
    screenshotUrls: string[];
  };
}

// Retry delays: 1, 5, 15, 30, 60 minutes
const RETRY_DELAYS_MS = [
  1 * 60_000,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
];

async function retryRelayDelivery(payload: RelayFixPayload): Promise<void> {
  for (const delay of RETRY_DELAYS_MS) {
    console.log(
      `[relay] retrying in ${delay / 60_000}min for ${payload.owner}/${payload.repo}#${payload.issueId}`,
    );
    await new Promise<void>((r) => setTimeout(r, delay));
    try {
      const res = await fetch(process.env.RELAY_URL!, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RELAY_SECRET}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        console.log(
          `[relay] retry succeeded for ${payload.owner}/${payload.repo}#${payload.issueId}`,
        );
        return;
      }
    } catch {
      // Network error — continue to next retry
    }
  }

  // All retries exhausted — relabel issue from auto-fix to needs-review
  console.error(
    `[relay] all retries exhausted for ${payload.owner}/${payload.repo}#${payload.issueId} — relabeling to needs-review`,
  );
  await relabelIssue(
    payload.owner,
    payload.repo,
    payload.issueId,
    "auto-fix",
    "needs-review",
  );
}

/**
 * POSTs an auto-fix payload to RELAY_URL.
 *
 * - Missing RELAY_URL: logs a warning and returns (no crash)
 * - First delivery failure: spawns background retry loop (fire-and-forget)
 * - After all retries exhausted: relabels GitHub issue auto-fix → needs-review
 * - Never throws — relay failure must not crash the bug report pipeline
 */
export async function notifyRelay(payload: RelayFixPayload): Promise<void> {
  const relayUrl = process.env.RELAY_URL;
  if (!relayUrl) {
    console.warn("[relay] RELAY_URL not set — skipping relay notification");
    return;
  }

  try {
    const res = await fetch(relayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RELAY_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      console.log(
        `[relay] notified relay for ${payload.owner}/${payload.repo}#${payload.issueId}`,
      );
      return;
    }

    // Non-2xx response — start background retry
    console.warn(
      `[relay] delivery failed (status ${res.status}) for ${payload.owner}/${payload.repo}#${payload.issueId} — starting retry loop`,
    );
  } catch (err) {
    // Network error — start background retry
    console.warn(
      `[relay] delivery error for ${payload.owner}/${payload.repo}#${payload.issueId}: ${err} — starting retry loop`,
    );
  }

  // Fire-and-forget retry loop — never awaited so pipeline returns immediately
  retryRelayDelivery(payload).catch((err) => {
    console.error(`[relay] retry loop crashed for ${payload.owner}/${payload.repo}#${payload.issueId}: ${err}`);
  });
}

/**
 * Registers the issues.labeled webhook handler that fires notifyRelay()
 * when a GitHub issue is labeled `auto-fix`.
 *
 * Must be called once at startup (after loadProjectsFromEnv()).
 */
export function registerRelayWebhook(): void {
  getWebhooksInstance().on("issues.labeled", async ({ payload }) => {
    try {
      // Only handle the auto-fix label
      if (payload.label?.name !== "auto-fix") {
        return;
      }

      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      const issueId = payload.issue.number;
      const issueUrl = payload.issue.html_url;
      const issueTitle = payload.issue.title;

      const relayPayload: RelayFixPayload = {
        issueId,
        issueUrl,
        issueTitle,
        owner,
        repo,
        mode: 'ralph',
        triageResult: {
          verdict: "auto-fix",
          confidence: 1.0,
          reasoning: "Labeled auto-fix via GitHub",
        },
        reportData: {
          subject: issueTitle,
          description: "See issue body",
          screenshotUrls: [],
        },
      };

      await notifyRelay(relayPayload);
      console.log(`[relay] notified relay for ${owner}/${repo}#${issueId}`);
    } catch (err) {
      console.error(`[relay] issues.labeled handler error: ${err}`);
    }
  });
}
