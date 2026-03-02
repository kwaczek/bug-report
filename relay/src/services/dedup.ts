import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const seen = new Set<string>();

const SEEN_FILE = path.join(
  process.env.RALPH_WORKSPACE ?? process.cwd(),
  '.relay-seen.jsonl'
);

/**
 * Returns true if the key has already been seen (is a duplicate).
 * Does NOT add the key to the set.
 */
export function isDuplicate(key: string): boolean {
  if (seen.has(key)) {
    console.log(`[dedup] duplicate: ${key}`);
    return true;
  }
  return false;
}

/**
 * Adds the key to the in-memory set and appends it to the SEEN_FILE for
 * persistence across relay restarts.
 */
export function markSeen(key: string): void {
  seen.add(key);
  try {
    appendFileSync(SEEN_FILE, JSON.stringify({ key, ts: Date.now() }) + '\n', 'utf8');
  } catch (err) {
    console.error(`[dedup] failed to persist seen key: ${err}`);
  }
  console.log(`[dedup] marked seen: ${key}`);
}

/**
 * Reads SEEN_FILE on startup and populates the in-memory set.
 * Safe to call when the file does not yet exist.
 */
export function loadSeen(): void {
  try {
    const content = readFileSync(SEEN_FILE, 'utf8');
    let count = 0;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed) as { key: string };
        if (entry.key) {
          seen.add(entry.key);
          count++;
        }
      } catch {
        // Malformed line — skip
      }
    }
    console.log(`[dedup] loaded ${count} seen keys`);
  } catch {
    // File does not exist yet — that's fine
    console.log('[dedup] loaded 0 seen keys');
  }
}
