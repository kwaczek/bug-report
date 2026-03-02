import { Octokit } from "@octokit/rest";

/**
 * Relabels a GitHub issue by removing one label and adding another.
 * Used after relay retry exhaustion to change `auto-fix` → `needs-review`.
 *
 * Never throws — errors are logged so that relabeling failure cannot crash
 * the retry loop or any other caller.
 */
export async function relabelIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  removeLabel: string,
  addLabel: string,
): Promise<void> {
  try {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    // Remove old label — may already be gone, so swallow 404/422
    try {
      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: removeLabel,
      });
    } catch {
      // Label may already be removed — not an error
    }

    // Add new label
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: [addLabel],
    });

    console.log(
      `[issue-relabel] ${owner}/${repo}#${issueNumber}: ${removeLabel} → ${addLabel}`,
    );
  } catch (err) {
    console.error(
      `[issue-relabel] failed to relabel ${owner}/${repo}#${issueNumber}: ${err}`,
    );
  }
}
