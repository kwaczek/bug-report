import { spawn } from 'node:child_process';
import type { RelayFixRequest } from '../types.js';

const CLAUDE_TIMEOUT_MS = 10 * 60_000; // 10 minutes

function buildPrompt(data: RelayFixRequest): string {
  const screenshotSection =
    data.reportData.screenshotUrls.length > 0
      ? `**Screenshots:**\n${data.reportData.screenshotUrls.map((u) => `- ${u}`).join('\n')}\nUse WebFetch to examine each screenshot.`
      : '**Screenshots:** None provided';

  return `You are a bug analyst for a live project. A user reported a bug.

**Bug:** ${data.issueTitle}
**Issue:** ${data.issueUrl}
**Description:** ${data.reportData.description}
${screenshotSection}
**AI Triage:** ${data.triageResult.reasoning} (confidence: ${data.triageResult.confidence})

Your task:
1. If screenshots are provided, examine them with WebFetch to understand the visual bug
2. Explore the project codebase — find the relevant files, understand the code paths involved
3. Identify the likely root cause
4. Write .ralph/fix_plan.md with your analysis and a fix checklist

The fix_plan.md MUST follow this exact format:

# Bug Fix: ${data.issueTitle}

**Issue:** ${data.issueUrl}
**Reported:** ${new Date().toISOString()}
**Repo:** ${data.owner}/${data.repo}

## Root Cause Analysis
[2-4 sentences: what's likely causing the bug, referencing specific files/functions]

## Investigation
- [ ] [Specific file to check and what to look for — include file path]
- [ ] [Another investigation step if needed]

## Implementation
- [ ] [Specific change to make — include file path and what to change]
- [ ] [Additional changes if needed]
- [ ] Run the existing test suite to verify no regressions

## Delivery
- [ ] Commit the fix with message: "fix: ${data.issueTitle} (closes #${data.issueId})"
- [ ] Push to main branch

Important:
- Be SPECIFIC — reference actual file paths and function names from this codebase
- Keep the checklist focused — 4-8 items total, not a generic template
- The Root Cause Analysis section is critical — Ralph uses it to understand what to fix`;
}

/**
 * Spawns Claude Code CLI to analyze a bug report and write an enriched
 * fix_plan.md with root cause analysis in the project directory.
 *
 * Resolves when Claude exits 0, rejects on non-zero exit or timeout.
 */
export function analyzeBugAndCreatePlan(
  projectDir: string,
  data: RelayFixRequest
): Promise<void> {
  const prompt = buildPrompt(data);
  const tag = `${data.owner}/${data.repo}#${data.issueId}`;

  console.log(`[claude-analyze] started for ${tag}`);

  return new Promise((resolve, reject) => {
    const claude = spawn(
      'claude',
      [
        '-p',
        prompt,
        '--output-format',
        'text',
        '--allowedTools',
        'Read,Glob,Grep,Write,WebFetch,Bash(ls *),Bash(cat *)',
      ],
      {
        cwd: projectDir,
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

    claude.on('close', (code) => {
      clearTimeout(timeoutHandle);
      if (code === 0) {
        console.log(`[claude-analyze] finished — fix_plan.md written for ${data.repo}`);
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
