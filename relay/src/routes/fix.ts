import { Router } from 'express';
import { z } from 'zod';
import { enqueue } from '../services/queue.js';
import { isDuplicate, markSeen } from '../services/dedup.js';
import { buildBugReportSection, appendToFixPlan } from '../services/fixplan.js';
import { watchFix } from '../services/fix-watcher.js';
import { resolveProjectDir } from '../services/project-resolver.js';
import { analyzeBugAndCreatePlan } from '../services/claude-analyze.js';
import { spawnRalph } from '../services/ralph-runner.js';

const FixRequestSchema = z.object({
  issueId: z.number(),
  issueUrl: z.string().url(),
  issueTitle: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  triageResult: z.object({
    verdict: z.literal('auto-fix'),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  }),
  reportData: z.object({
    subject: z.string(),
    description: z.string(),
    screenshotUrls: z.array(z.string()),
  }),
});

export const fixRouter = Router();

fixRouter.post('/', async (req, res) => {
  // 1. Validate payload
  const result = FixRequestSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid payload', details: result.error.flatten() });
    return;
  }
  const data = result.data;

  // 2. Deduplication check
  const dedupeKey = `${data.owner}/${data.repo}#${data.issueId}`;
  if (isDuplicate(dedupeKey)) {
    console.log(`[fix] duplicate request — returning 200 for ${dedupeKey}`);
    res.status(200).json({ status: 'duplicate', key: dedupeKey });
    return;
  }

  // 3. Mark as seen before enqueuing (prevents duplicate from arriving
  //    between isDuplicate check and actual write)
  markSeen(dedupeKey);

  // 4. Enqueue the async smart pipeline job
  //    Queue is per-project — serializes Claude writes so two reports
  //    for the same project don't race on fix_plan.md.
  //    Always append the bug, only spawn Ralph if not already running.
  enqueue(data.repo, async () => {
    const projectDir = resolveProjectDir(data.repo);

    // Step 1: Claude describes the bug and appends to fix_plan.md
    //         Always runs — even if Ralph is busy with a previous fix.
    //         Ralph reads fix_plan after each task, so it will pick up new items.
    console.log(`[fix] ▶ starting Claude analysis for ${dedupeKey}`);
    try {
      await analyzeBugAndCreatePlan(projectDir, data);
    } catch (err) {
      console.error(`[fix] Claude analysis failed for ${dedupeKey}: ${err}`);
      // Fallback: append basic bug report so Ralph has something to work with
      const section = buildBugReportSection(data);
      await appendToFixPlan(data.repo, section);
      console.log(`[fix] appended fallback bug report to fix_plan.md for ${data.repo}`);
    }

    // Step 2: Spawn Ralph only if not already running.
    //         If Ralph is already working, it will see the new tasks
    //         on its next loop iteration (reads fix_plan after each task).
    spawnRalph(projectDir, data.repo);

    // Step 3: Start timeout watcher for this specific issue
    watchFix(data.owner, data.repo, data.issueId, data.repo);
    console.log(`[fix] ▶ pipeline active for ${dedupeKey} — watcher started`);
  });

  // 5. Return 202 immediately — do NOT await the queue
  res.status(202).json({ status: 'accepted', key: dedupeKey });
});
