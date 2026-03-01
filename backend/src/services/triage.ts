import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { TriageResult } from "../types.js";

const TriageSchema = z.object({
  verdict: z.enum(["auto-fix", "review", "spam"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

const SYSTEM_PROMPT = `You are a bug report triage classifier. Classify bug reports into three categories based on confidence:
- auto-fix (confidence > 0.8): clear, reproducible bug with specific steps
- review (confidence 0.4-0.8): ambiguous or needs human judgment
- spam (confidence < 0.4): nonsense, test data, advertising, or not a bug report

Respond with ONLY a JSON object matching this exact schema (no markdown, no explanation outside the JSON):
{
  "verdict": "auto-fix" | "review" | "spam",
  "confidence": <number between 0 and 1>,
  "reasoning": "<brief explanation>"
}`;

const FALLBACK: TriageResult = {
  verdict: "review",
  confidence: 0.5,
  reasoning: "Triage unavailable — defaulting to manual review",
};

/**
 * Classify a bug report using Claude AI.
 *
 * NEVER throws — returns a safe "review" fallback on any failure so the
 * bug report pipeline is never blocked by triage errors.
 */
export async function triageReport(report: {
  subject: string;
  description: string;
  metadata: string;
}): Promise<TriageResult> {
  try {
    const client = new Anthropic();

    const userMessage = [
      `Subject: ${report.subject}`,
      ``,
      `Description: ${report.description}`,
      ``,
      `Browser metadata: ${report.metadata}`,
    ].join("\n");

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text block in Anthropic response");
    }

    const rawText = textBlock.text.trim();

    // Strip markdown code fences if present (e.g. ```json ... ```)
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    const parsed = JSON.parse(jsonText);
    const validated = TriageSchema.safeParse(parsed);

    if (!validated.success) {
      throw new Error(
        `Triage schema validation failed: ${validated.error.message}`,
      );
    }

    return validated.data;
  } catch (error) {
    console.warn(`[triage] AI triage failed, defaulting to review: ${error}`);
    return FALLBACK;
  }
}
