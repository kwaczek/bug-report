import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

interface RalphStatus {
  status?: string;
}

/**
 * Checks if Ralph is already running for a project by reading status.json.
 */
function isRalphRunning(projectDir: string): boolean {
  const statusPath = path.join(projectDir, '.ralph', 'status.json');
  try {
    const raw = readFileSync(statusPath, 'utf8');
    const status = JSON.parse(raw) as RalphStatus;
    if (status.status === 'running' || status.status === 'executing') {
      return true;
    }
    return false;
  } catch {
    // File does not exist or is not valid JSON — Ralph is not running
    return false;
  }
}

/**
 * Spawns Ralph in the background (detached) to execute the fix_plan.md
 * for the given project. Pipes stdout/stderr to relay console with prefix.
 *
 * If Ralph is already running (status.json indicates running/executing),
 * logs a warning and skips spawning.
 *
 * Calls ralph.unref() so the relay process does not wait for Ralph to exit.
 */
export function spawnRalph(projectDir: string, repoName: string): void {
  if (isRalphRunning(projectDir)) {
    console.warn(`[ralph] already running for ${repoName} — skipping spawn`);
    return;
  }

  const ralph = spawn(
    'ralph',
    [
      '--calls', '50',
      '--timeout', '20',
      '--no-continue',
    ],
    {
      cwd: projectDir,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  // Pipe stdout line by line
  const stdoutRl = createInterface({ input: ralph.stdout });
  stdoutRl.on('line', (line) => {
    console.log(`[ralph:${repoName}] ${line}`);
  });

  // Pipe stderr line by line
  const stderrRl = createInterface({ input: ralph.stderr });
  stderrRl.on('line', (line) => {
    console.error(`[ralph:${repoName}] stderr: ${line}`);
  });

  ralph.on('close', (code) => {
    console.log(`[ralph] exited for ${repoName} (code: ${code})`);
  });

  ralph.on('error', (err) => {
    console.error(`[ralph] spawn error for ${repoName}: ${err}`);
  });

  // Detach from relay process — relay can exit without waiting for Ralph
  ralph.unref();

  console.log(`[ralph] spawned for ${repoName} (pid: ${ralph.pid})`);
}
