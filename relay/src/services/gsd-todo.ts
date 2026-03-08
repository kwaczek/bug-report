import { spawn } from 'node:child_process';
import type { RelayFixRequest } from '../types.js';

/**
 * Builds a todo description from the bug report data.
 * Includes all context the user will need when picking up the todo.
 */
function buildTodoDescription(data: RelayFixRequest): string {
  const screenshots = data.reportData.screenshotUrls.length > 0
    ? data.reportData.screenshotUrls.map((u) => `- ${u}`).join('\n')
    : 'None provided';

  return [
    `Fix bug: ${data.issueTitle}`,
    '',
    `Issue: ${data.issueUrl}`,
    `Repo: ${data.owner}/${data.repo}`,
    '',
    'What was reported:',
    `Subject: ${data.reportData.subject}`,
    data.reportData.description,
    '',
    'Screenshots:',
    screenshots,
    '',
    `AI Triage: ${data.triageResult.reasoning} (confidence: ${data.triageResult.confidence})`,
  ].join('\n');
}

/**
 * Spawns Claude CLI to run /gsd:add-todo in the project directory.
 * Runs detached so the relay doesn't wait for it.
 */
export function spawnGsdTodo(projectDir: string, data: RelayFixRequest): void {
  const description = buildTodoDescription(data);
  const tag = `${data.owner}/${data.repo}#${data.issueId}`;

  const prompt = `Run /gsd:add-todo with this description:\n\n${description}`;

  const claude = spawn(
    'claude',
    [
      '-p',
      prompt,
      '--output-format',
      'text',
      '--allowedTools',
      'Read,Write,Glob,Skill',
    ],
    {
      cwd: projectDir,
      detached: true,
      stdio: 'ignore',
    }
  );

  claude.on('close', (code) => {
    console.log(`[gsd-todo] claude exited for ${tag} (code: ${code})`);
  });

  claude.on('error', (err) => {
    console.error(`[gsd-todo] spawn error for ${tag}: ${err}`);
  });

  claude.unref();
  console.log(`[gsd-todo] spawned for ${tag} (pid: ${claude.pid})`);
}
