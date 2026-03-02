import type { TriageResult } from "../types.js";

/**
 * Local triage — no paid API calls.
 *
 * Basic spam filter (too short / empty), everything else goes to auto-fix.
 * Claude Code on the relay does the real analysis for free.
 * Rate limiting (10/IP/hour) handles spam volume.
 */
export async function triageReport(report: {
  subject: string;
  description: string;
  metadata: string;
}): Promise<TriageResult> {
  const text = `${report.subject} ${report.description}`.trim();

  // Discard obviously empty or too-short reports
  if (text.length < 10) {
    return {
      verdict: "spam",
      confidence: 0.9,
      reasoning: "Report too short to be actionable",
    };
  }

  // Everything else → auto-fix. Claude Code on the relay will analyze.
  return {
    verdict: "auto-fix",
    confidence: 1.0,
    reasoning: "Passed basic validation — forwarding to relay for Claude Code analysis",
  };
}
