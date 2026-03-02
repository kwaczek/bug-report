import { Router } from 'express';
import { z } from 'zod';
import { enqueue } from '../services/queue.js';
import { isDuplicate, markSeen } from '../services/dedup.js';
import { buildFixPlan, writeFixPlan, isProjectBusy } from '../services/fixplan.js';
import { watchFix } from '../services/fix-watcher.js';

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

  // 4. Enqueue the async fix_plan.md write job
  enqueue(data.repo, async () => {
    // Check if Ralph is busy with an in-progress job before writing
    const busy = await isProjectBusy(data.repo);
    if (busy) {
      console.warn(`[fix] project ${data.repo} has in-progress fix_plan.md — queuing delayed retry`);
      // Wait 60s then check again
      await new Promise<void>((resolve) => setTimeout(resolve, 60_000));
      const stillBusy = await isProjectBusy(data.repo);
      if (stillBusy) {
        console.error(`[fix] project ${data.repo} still busy after retry — skipping ${dedupeKey}`);
        return;
      }
    }

    const content = buildFixPlan(data);
    await writeFixPlan(data.repo, content);

    // Start fix timeout watcher — relabels issue if Ralph stalls
    watchFix(data.owner, data.repo, data.issueId, data.repo);
  });

  // 5. Return 202 immediately — do NOT await the queue
  res.status(202).json({ status: 'accepted', key: dedupeKey });
});
