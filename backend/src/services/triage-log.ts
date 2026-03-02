import fs from "fs/promises";
import path from "path";

export interface TriageLogEntry {
  timestamp: string; // ISO 8601
  issueId: number | null; // null for spam (no issue created)
  owner: string;
  repo: string;
  verdict: "auto-fix" | "review" | "spam";
  confidence: number;
  reasoning: string;
}

/**
 * TRIA-05: Append a triage decision to the append-only JSONL log at the
 * ralph-workspace root (triage.log). Logging failure never throws — a warning
 * is emitted to the console so the bug-report pipeline is not disrupted.
 */
export async function appendTriageLog(entry: TriageLogEntry): Promise<void> {
  const logPath = path.join(
    process.env.RALPH_WORKSPACE ?? process.cwd(),
    "triage.log",
  );
  const line = JSON.stringify(entry) + "\n";

  try {
    await fs.appendFile(logPath, line, "utf8");
    console.log(
      `[triage-log] logged ${entry.verdict} for ${entry.owner}/${entry.repo}#${entry.issueId ?? "no-issue"}`,
    );
  } catch (err) {
    console.warn(`[triage-log] failed to write log entry: ${err}`);
  }
}
