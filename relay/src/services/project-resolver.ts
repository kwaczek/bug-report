import { createRequire } from 'node:module';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load repo-map.json at module init — static mapping of GitHub repo names to local folder names.
// Only mismatches need entries; default behavior is folder name = repo name.
const require = createRequire(import.meta.url);
const repoMapPath = path.resolve(__dirname, '../../../repo-map.json');
let repoMap: Record<string, string> = {};
try {
  repoMap = require(repoMapPath) as Record<string, string>;
} catch {
  console.warn(`[project-resolver] repo-map.json not found at ${repoMapPath} — using identity mapping`);
}

const RALPH_WORKSPACE =
  process.env.RALPH_WORKSPACE ?? '/Users/miro/Workspace/PERSONAL/ralph-workspace';

/**
 * Resolves a GitHub repo name to an absolute local project directory path.
 *
 * Uses repo-map.json for known mismatches (e.g. "rohlik-stats" → "rohlik-web").
 * Falls back to using the repo name as-is as the folder name.
 *
 * Throws a descriptive error if the resolved directory does not exist.
 */
export function resolveProjectDir(repoName: string): string {
  const folderName = repoMap[repoName] ?? repoName;
  const absolutePath = path.join(RALPH_WORKSPACE, 'projects', folderName);

  console.log(`[project-resolver] ${repoName} → ${folderName} (${absolutePath})`);

  try {
    const stat = statSync(absolutePath);
    if (!stat.isDirectory()) {
      throw new Error(`Path exists but is not a directory: ${absolutePath}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `[project-resolver] project directory not found: ${absolutePath} (repo="${repoName}", folder="${folderName}")`
      );
    }
    throw err;
  }

  return absolutePath;
}
