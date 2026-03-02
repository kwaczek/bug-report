import { Octokit } from '@octokit/rest';
import { isProjectBusy } from './fixplan.js';

const watchers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Starts a timeout monitor for a Ralph fix job. If the fix_plan.md still
 * has uncompleted items after FIX_TIMEOUT_MS, the GitHub issue is relabeled
 * from 'auto-fix' to 'needs-review'.
 */
export function watchFix(
  owner: string,
  repo: string,
  issueId: number,
  repoName: string
): void {
  const watchKey = `${owner}/${repo}#${issueId}`;
  const timeoutMs = parseInt(process.env.FIX_TIMEOUT_MS ?? '3600000', 10);

  const handle = setTimeout(async () => {
    watchers.delete(watchKey);

    const busy = await isProjectBusy(repoName);
    if (busy) {
      // Ralph has stalled — relabel the issue
      console.warn(`[fix-watcher] ${watchKey} timed out — relabeling to needs-review`);
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      try {
        await octokit.rest.issues.removeLabel({
          owner,
          repo,
          issue_number: issueId,
          name: 'auto-fix',
        });
      } catch {
        // Label may already have been removed — that's fine
      }
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: issueId,
        labels: ['needs-review'],
      });
      console.log(`[fix-watcher] ${owner}/${repo}#${issueId} timed out — relabeled to needs-review`);
    } else {
      // Ralph completed (or fix_plan.md was removed) — nothing to do
      console.log(`[fix-watcher] ${watchKey} completed successfully`);
    }
  }, timeoutMs);

  watchers.set(watchKey, handle);
  console.log(`[fix-watcher] watching ${watchKey} — timeout in ${timeoutMs / 60_000}min`);
}

/**
 * Cancels an active watch timer if one exists for the given issue.
 * Useful for early cancellation if success is detected before the timeout.
 */
export function cancelWatch(owner: string, repo: string, issueId: number): void {
  const watchKey = `${owner}/${repo}#${issueId}`;
  const handle = watchers.get(watchKey);
  if (handle !== undefined) {
    clearTimeout(handle);
    watchers.delete(watchKey);
    console.log(`[fix-watcher] cancelled watch for ${watchKey}`);
  }
}
