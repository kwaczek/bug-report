import { spawn } from 'node:child_process';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { RelayFixRequest } from '../types.js';

const CLAUDE_TIMEOUT_MS = 10 * 60_000; // 10 minutes

const RALPH_WORKSPACE =
  process.env.RALPH_WORKSPACE ?? '/Users/miro/Workspace/PERSONAL/ralph-workspace';

/**
 * Downloads screenshot URLs to a temp directory and returns local file paths.
 */
async function downloadScreenshots(urls: string[], tag: string): Promise<string[]> {
  if (urls.length === 0) return [];

  const tmpDir = path.join(RALPH_WORKSPACE, '.tmp-screenshots', tag.replace(/[/#]/g, '-'));
  await mkdir(tmpDir, { recursive: true });

  const localPaths: string[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const ext = url.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] ?? 'jpg';
    const filePath = path.join(tmpDir, `screenshot-${i + 1}.${ext}`);

    try {
      const res = await fetch(url);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        await writeFile(filePath, buffer);
        localPaths.push(filePath);
        console.log(`[claude-analyze] downloaded screenshot ${i + 1}: ${filePath}`);
      } else {
        console.warn(`[claude-analyze] failed to download screenshot ${i + 1}: HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn(`[claude-analyze] failed to download screenshot ${i + 1}: ${err}`);
    }
  }

  return localPaths;
}

/**
 * Cleans up downloaded screenshot temp files.
 */
async function cleanupScreenshots(tag: string): Promise<void> {
  const tmpDir = path.join(RALPH_WORKSPACE, '.tmp-screenshots', tag.replace(/[/#]/g, '-'));
  try {
    await rm(tmpDir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

function buildPrompt(data: RelayFixRequest, projectFolder: string, screenshotPaths: string[]): string {
  let screenshotSection: string;
  if (screenshotPaths.length > 0) {
    screenshotSection = `**Screenshots (local files — use Read tool to view each image):**\n${screenshotPaths.map((p) => `- ${p}`).join('\n')}`;
  } else if (data.reportData.screenshotUrls.length > 0) {
    screenshotSection = `**Screenshots (download failed, URLs for reference):**\n${data.reportData.screenshotUrls.map((u) => `- ${u}`).join('\n')}`;
  } else {
    screenshotSection = '**Screenshots:** None provided';
  }

  return `A customer reported a bug. Your job is to DESCRIBE the bug clearly and append it to the project's fix_plan.md. Do NOT analyze root cause or suggest code changes — Ralph will handle that.

**Bug Title:** ${data.issueTitle}
**Issue URL:** ${data.issueUrl}
**Subject:** ${data.reportData.subject}
**Description:** ${data.reportData.description}
${screenshotSection}
**AI Triage Notes:** ${data.triageResult.reasoning} (confidence: ${data.triageResult.confidence})

Steps:
1. If screenshot files are provided, use the Read tool to view each image and describe what you see
2. Read the existing fix_plan at projects/${projectFolder}/.ralph/fix_plan.md
3. APPEND the following section to the END of that file (keep all existing content intact):

---

# Bug Report: ${data.issueTitle}

**Issue:** ${data.issueUrl}
**Received:** ${new Date().toISOString()}
**Repo:** ${data.owner}/${data.repo}

## What was reported
[Summarize what the customer described in 2-3 sentences — use their words where helpful]

## Screenshots
[Describe what you see in each screenshot image, or "None provided"]

## Fix Tasks
- [ ] Investigate the bug based on the report above — find the root cause in the codebase
- [ ] Implement the minimal fix
- [ ] Run tests to verify no regressions
- [ ] Commit: "fix: ${data.issueTitle} (closes #${data.issueId})"
- [ ] Push to main branch

IMPORTANT:
- APPEND to the end of the file — do not overwrite or remove existing content
- Just DESCRIBE the bug — do not dig into code or suggest fixes
- If screenshot images are provided, READ them and describe what you see visually (errors, blank screens, broken layouts, etc.)
- Keep it concise — Ralph reads this and does the actual work`;
}

/**
 * Spawns Claude Code CLI in the ralph-workspace root to describe a bug
 * report and append it to the project's fix_plan.md.
 *
 * Runs from ralph-workspace so Claude picks up workspace CLAUDE.md instructions.
 * Resolves when Claude exits 0, rejects on non-zero exit or timeout.
 */
export async function analyzeBugAndCreatePlan(
  projectDir: string,
  data: RelayFixRequest
): Promise<void> {
  const projectFolder = projectDir.split('/').pop() ?? data.repo;
  const tag = `${data.owner}/${data.repo}#${data.issueId}`;

  console.log(`[claude-analyze] started for ${tag}`);

  // Download screenshots to local temp files so Claude can Read them
  const screenshotPaths = await downloadScreenshots(data.reportData.screenshotUrls, tag);
  const prompt = buildPrompt(data, projectFolder, screenshotPaths);

  return new Promise((resolve, reject) => {
    const claude = spawn(
      'claude',
      [
        '-p',
        prompt,
        '--output-format',
        'text',
        '--allowedTools',
        'Read,Edit,Write,WebFetch,Glob',
      ],
      {
        cwd: RALPH_WORKSPACE,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, HOME: process.env.HOME },
      }
    );

    // Pipe stdout with prefix
    claude.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.log(`[claude-analyze] ${line}`);
        }
      }
    });

    // Pipe stderr with prefix
    claude.stderr.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.error(`[claude-analyze] stderr: ${line}`);
        }
      }
    });

    // Hard timeout: kill the process if it hangs
    const timeoutHandle = setTimeout(() => {
      console.error(`[claude-analyze] timeout (${CLAUDE_TIMEOUT_MS / 60_000}min) — killing process for ${tag}`);
      claude.kill('SIGTERM');
      reject(new Error(`claude-analyze timed out after ${CLAUDE_TIMEOUT_MS / 60_000} minutes`));
    }, CLAUDE_TIMEOUT_MS);

    claude.on('close', async (code) => {
      clearTimeout(timeoutHandle);
      await cleanupScreenshots(tag);
      if (code === 0) {
        console.log(`[claude-analyze] finished — bug appended to fix_plan.md for ${data.repo}`);
        resolve();
      } else {
        const err = new Error(`claude exited with code ${code}`);
        console.error(`[claude-analyze] failed for ${data.repo}: ${err.message}`);
        reject(err);
      }
    });

    claude.on('error', (err) => {
      clearTimeout(timeoutHandle);
      console.error(`[claude-analyze] spawn error for ${tag}: ${err}`);
      reject(err);
    });
  });
}
