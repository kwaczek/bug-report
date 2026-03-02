import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RelayFixRequest } from '../types.js';
import { resolveProjectDir } from './project-resolver.js';

/**
 * Builds a fix_plan.md string in Ralph's verified format.
 */
export function buildFixPlan(req: RelayFixRequest): string {
  return [
    `# Bug Fix: ${req.issueTitle}`,
    '',
    `**Issue:** ${req.issueUrl}`,
    `**Reported:** ${new Date().toISOString()}`,
    `**Repo:** ${req.owner}/${req.repo}`,
    '',
    '## Investigation',
    `- [ ] Read the bug report at ${req.issueUrl} — understand the exact failure, reproduce steps, and identify affected code paths`,
    '',
    '## Implementation',
    '- [ ] Identify the root cause in the codebase',
    '- [ ] Implement the minimal fix — do not refactor unrelated code',
    '- [ ] Run the test suite to verify no regressions',
    '',
    '## Delivery',
    `- [ ] Commit the fix with message: "fix: ${req.issueTitle} (closes #${req.issueId})"`,
    '- [ ] Push to main branch — Railway auto-deploys on push',
    '',
  ].join('\n');
}

/**
 * Returns true if the project currently has an in-progress fix_plan.md
 * (i.e., it contains uncompleted checklist items). Returns false if the
 * file does not exist or all items are checked off.
 */
export async function isProjectBusy(repoName: string): Promise<boolean> {
  try {
    const projectDir = resolveProjectDir(repoName);
    const fixPlanPath = path.join(projectDir, '.ralph', 'fix_plan.md');
    const content = await readFile(fixPlanPath, 'utf8');
    const uncompletedCount = (content.match(/^\s*- \[ \]/gm) ?? []).length;
    return uncompletedCount > 0;
  } catch {
    // File does not exist or project dir not found — project is not busy
    return false;
  }
}

/**
 * Writes fix_plan.md to the project's .ralph/ directory, creating the
 * directory if it does not exist.
 */
export async function writeFixPlan(repoName: string, content: string): Promise<void> {
  const projectDir = resolveProjectDir(repoName);
  const dir = path.join(projectDir, '.ralph');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'fix_plan.md'), content, 'utf8');
  console.log(`[fixplan] wrote fix_plan.md for ${repoName}`);
}
