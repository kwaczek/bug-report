import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RelayFixRequest } from '../types.js';
import { resolveProjectDir } from './project-resolver.js';

/**
 * Builds a bug report section to append to an existing fix_plan.md.
 * Just describes the bug — does not analyze root cause.
 */
export function buildBugReportSection(req: RelayFixRequest): string {
  const screenshots = req.reportData.screenshotUrls.length > 0
    ? req.reportData.screenshotUrls.map((u) => `- ${u}`).join('\n')
    : 'None provided';

  return [
    '',
    '---',
    '',
    `# Bug Report: ${req.issueTitle}`,
    '',
    `**Issue:** ${req.issueUrl}`,
    `**Received:** ${new Date().toISOString()}`,
    `**Repo:** ${req.owner}/${req.repo}`,
    '',
    '## What was reported',
    req.reportData.description,
    '',
    '## Screenshots',
    screenshots,
    '',
    '## Fix Tasks',
    `- [ ] Investigate the bug based on the report above — find the root cause in the codebase`,
    '- [ ] Implement the minimal fix',
    '- [ ] Run tests to verify no regressions',
    `- [ ] Commit: "fix: ${req.issueTitle} (closes #${req.issueId})"`,
    '- [ ] Push to main branch',
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
 * Appends content to the project's .ralph/fix_plan.md, creating the
 * directory and file if they don't exist.
 */
export async function appendToFixPlan(repoName: string, content: string): Promise<void> {
  const projectDir = resolveProjectDir(repoName);
  const dir = path.join(projectDir, '.ralph');
  const filePath = path.join(dir, 'fix_plan.md');
  await mkdir(dir, { recursive: true });

  let existing = '';
  try {
    existing = await readFile(filePath, 'utf8');
  } catch {
    // File doesn't exist yet — that's fine
  }

  await writeFile(filePath, existing + content, 'utf8');
  console.log(`[fixplan] appended bug report to fix_plan.md for ${repoName}`);
}
