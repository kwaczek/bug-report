import { Octokit } from "@octokit/rest";
import type { BugMetadata, TriageResult } from "../types.js";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// ---------------------------------------------------------------------------
// Issue body builder
// ---------------------------------------------------------------------------

/**
 * Build the markdown body for a GitHub issue.
 */
export function buildIssueBody(args: {
  description: string;
  screenshotUrls: string[];
  metadata: BugMetadata;
  triageResult: TriageResult;
}): string {
  const { description, screenshotUrls, metadata, triageResult } = args;

  const screenshotsSection =
    screenshotUrls.length > 0
      ? screenshotUrls
          .map((url, i) => `![Screenshot ${i + 1}](${url})`)
          .join("\n")
      : "_No screenshots attached_";

  return [
    `## Bug Report`,
    ``,
    description,
    ``,
    `## Screenshots`,
    ``,
    screenshotsSection,
    ``,
    `## Environment`,
    ``,
    `| Field | Value |`,
    `| ----- | ----- |`,
    `| URL | ${metadata.url} |`,
    `| Browser | ${metadata.userAgent} |`,
    `| Screen | ${metadata.screenWidth}x${metadata.screenHeight} |`,
    `| Language | ${metadata.language} |`,
    `| Timestamp | ${metadata.timestamp} |`,
    ``,
    `## Triage`,
    ``,
    `| Field | Value |`,
    `| ----- | ----- |`,
    `| Verdict | ${triageResult.verdict} |`,
    `| Confidence | ${triageResult.confidence.toFixed(2)} |`,
    `| Reasoning | ${triageResult.reasoning} |`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Issue creation
// ---------------------------------------------------------------------------

/**
 * Create a GitHub issue for the bug report.
 *
 * Applies "bug-report" label plus a verdict-specific label:
 * - "auto-fix"    when verdict === "auto-fix"
 * - "needs-review" otherwise
 */
export async function createGitHubIssue(args: {
  owner: string;
  repo: string;
  subject: string;
  description: string;
  screenshotUrls: string[];
  metadata: BugMetadata;
  triageResult: TriageResult;
}): Promise<{ issueId: number; issueUrl: string }> {
  const {
    owner,
    repo,
    subject,
    description,
    screenshotUrls,
    metadata,
    triageResult,
  } = args;

  const verdictLabel =
    triageResult.verdict === "auto-fix" ? "auto-fix" : "needs-review";

  const body = buildIssueBody({ description, screenshotUrls, metadata, triageResult });

  const { data } = await octokit.rest.issues.create({
    owner,
    repo,
    title: subject,
    body,
    labels: ["bug-report", verdictLabel],
  });

  return { issueId: data.number, issueUrl: data.html_url };
}

// ---------------------------------------------------------------------------
// Label management
// ---------------------------------------------------------------------------

const REQUIRED_LABELS: { name: string; color: string; description: string }[] =
  [
    {
      name: "bug-report",
      color: "d73a4a",
      description: "Submitted via bug report widget",
    },
    {
      name: "auto-fix",
      color: "0e8a16",
      description: "Triage: clear bug, suitable for automated fix",
    },
    {
      name: "needs-review",
      color: "fbca04",
      description: "Triage: ambiguous or requires human review",
    },
  ];

/**
 * Idempotently ensure the three required labels exist in the repo.
 *
 * Safe to call at every server startup — 422 (already exists) is silently
 * swallowed so repeated calls never fail.
 */
export async function ensureLabelsExist(
  owner: string,
  repo: string,
): Promise<void> {
  await Promise.all(
    REQUIRED_LABELS.map(async (label) => {
      try {
        await octokit.rest.issues.createLabel({
          owner,
          repo,
          name: label.name,
          color: label.color,
          description: label.description,
        });
      } catch (err: unknown) {
        // 422 = label already exists — that's fine
        if (
          typeof err === "object" &&
          err !== null &&
          "status" in err &&
          (err as { status: number }).status === 422
        ) {
          return;
        }
        throw err;
      }
    }),
  );

  console.log(`[github] labels ensured for ${owner}/${repo}`);
}
