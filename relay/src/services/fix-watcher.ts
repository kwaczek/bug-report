import { Octokit } from '@octokit/rest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isProjectBusy } from './fixplan.js';
import { resolveProjectDir } from './project-resolver.js';

interface WatchHandles {
  timeoutHandle: ReturnType<typeof setTimeout>;
  pollHandle: ReturnType<typeof setInterval>;
}

const watchers = new Map<string, WatchHandles>();

const POLL_INTERVAL_MS = 5 * 60_000; // 5 minutes

/**
 * Starts a timeout monitor for a Ralph fix job. If the fix_plan.md still
 * has uncompleted items after FIX_TIMEOUT_MS, the GitHub issue is relabeled
 * from 'auto-fix' to 'needs-review'.
 *
 * Also polls every 5 minutes to log progress (completed/total tasks) and
 * detect early completion before the timeout fires.
 */
export function watchFix(
  owner: string,
  repo: string,
  issueId: number,
  repoName: string
): void {
  const watchKey = `${owner}/${repo}#${issueId}`;
  const timeoutMs = parseInt(process.env.FIX_TIMEOUT_MS ?? '3600000', 10);

  async function cleanup(reason: 'completed' | 'timeout'): Promise<void> {
    const handles = watchers.get(watchKey);
    if (!handles) return;
    clearTimeout(handles.timeoutHandle);
    clearInterval(handles.pollHandle);
    watchers.delete(watchKey);

    if (reason === 'completed') {
      console.log(`[fix-watcher] ✓ ${watchKey} completed successfully`);
      return;
    }

    // Timeout path — check busy one more time then relabel
    const busy = await isProjectBusy(repoName);
    if (busy) {
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
  }

  const timeoutHandle = setTimeout(() => {
    cleanup('timeout').catch((err) => {
      console.error(`[fix-watcher] cleanup error for ${watchKey}: ${err}`);
    });
  }, timeoutMs);

  // Progress poller — runs every 5 minutes to log tasks and detect early completion
  const pollHandle = setInterval(async () => {
    const busy = await isProjectBusy(repoName);
    if (!busy) {
      // Ralph finished early
      await cleanup('completed');
      return;
    }

    // Log progress: count completed vs total checklist items
    try {
      const projectDir = resolveProjectDir(repoName);
      const fixPlanPath = path.join(projectDir, '.ralph', 'fix_plan.md');
      const content = await readFile(fixPlanPath, 'utf8');
      const total = (content.match(/^\s*- \[[ x]\]/gm) ?? []).length;
      const done = (content.match(/^\s*- \[x\]/gm) ?? []).length;
      console.log(`[fix-watcher] ${watchKey} progress: ${done}/${total} tasks`);
    } catch {
      // fix_plan.md may not exist yet — that's OK
    }
  }, POLL_INTERVAL_MS);

  watchers.set(watchKey, { timeoutHandle, pollHandle });
  console.log(`[fix-watcher] watching ${watchKey} — timeout in ${timeoutMs / 60_000}min`);
}

/**
 * Cancels an active watch timer if one exists for the given issue.
 * Clears both the timeout and the progress poll interval.
 */
export function cancelWatch(owner: string, repo: string, issueId: number): void {
  const watchKey = `${owner}/${repo}#${issueId}`;
  const handles = watchers.get(watchKey);
  if (handles !== undefined) {
    clearTimeout(handles.timeoutHandle);
    clearInterval(handles.pollHandle);
    watchers.delete(watchKey);
    console.log(`[fix-watcher] cancelled watch for ${watchKey}`);
  }
}
