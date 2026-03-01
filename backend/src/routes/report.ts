import { Router } from "express";
import multer from "multer";
import { getRepo } from "../config.js";
import { uploadScreenshots } from "../services/imgbb.js";
import { triageReport } from "../services/triage.js";
import { createGitHubIssue } from "../services/github.js";
import type { BugMetadata, PendingApproval } from "../types.js";

// In-memory store for reports that need human approval (verdict === "review")
// Phase 4 will consume this map to handle Telegram approval flow.
export const pendingApprovals = new Map<number, PendingApproval>();

const upload = multer({ storage: multer.memoryStorage() });

export const reportRouter = Router();

/**
 * POST /report — main bug report submission endpoint.
 *
 * Pipeline (TRIA-01 critical order):
 *   1. Parse + validate FormData fields
 *   2. Triage FIRST — spam exits early with 200 (no GitHub issue created)
 *   3. Upload screenshots to ImgBB (graceful degradation)
 *   4. Create GitHub issue with verdict labels (TRIA-04)
 *   5. Store PendingApproval for "review" verdicts (Phase 4)
 *   6. Return { success: true, message: "Report submitted" }
 */
reportRouter.post(
  "/",
  upload.array("screenshots", 10),
  async (req, res): Promise<void> => {
    try {
      // --- Field extraction ---
      const { projectId, subject, description } = req.body as {
        projectId?: string;
        subject?: string;
        description?: string;
        metadata?: string;
      };

      if (!projectId || !subject || !description) {
        res.status(400).json({
          success: false,
          message: "Missing required fields: projectId, subject, description",
        });
        return;
      }

      // --- Metadata parsing ---
      let parsedMetadata: BugMetadata;
      try {
        parsedMetadata = JSON.parse(req.body.metadata ?? "{}") as BugMetadata;
      } catch {
        res.status(400).json({
          success: false,
          message: "Invalid metadata JSON",
        });
        return;
      }

      // --- Project lookup ---
      const repo = getRepo(projectId);
      if (!repo) {
        res.status(400).json({
          success: false,
          message: "Unknown project ID",
        });
        return;
      }

      // --- Step 1: TRIAGE FIRST (TRIA-01) ---
      const triageResult = await triageReport({
        subject,
        description,
        metadata: req.body.metadata ?? "",
      });

      // TRIA-03: Spam is discarded silently — 200 response, no GitHub issue
      if (triageResult.verdict === "spam") {
        res.json({ success: true, message: "Report received" });
        return;
      }

      // --- Step 2: Upload screenshots ---
      const files = (req.files as Express.Multer.File[]) ?? [];
      const screenshotUrls = await uploadScreenshots(files);

      // --- Step 3: Create GitHub issue (TRIA-04: labels applied at creation) ---
      const { issueId, issueUrl } = await createGitHubIssue({
        owner: repo.owner,
        repo: repo.repo,
        subject,
        description,
        screenshotUrls,
        metadata: parsedMetadata,
        triageResult,
      });

      // --- Step 4: Store pending approval for "review" verdicts (Phase 4) ---
      if (triageResult.verdict === "review") {
        const approval: PendingApproval = {
          issueId,
          repo,
          triageResult,
          reportData: {
            subject,
            description,
            screenshotUrls,
            metadata: parsedMetadata,
          },
        };
        pendingApprovals.set(issueId, approval);
        console.log(`[report] stored pending approval for issue #${issueId}`);
      }

      console.log(
        `[report] created issue #${issueId} (${triageResult.verdict}): ${issueUrl}`,
      );

      // --- Step 5: Respond ---
      res.json({ success: true, message: "Report submitted" });
    } catch (err) {
      console.error(`[report] pipeline error: ${err}`);
      res.status(500).json({
        success: false,
        message: "Internal error processing report",
      });
    }
  },
);
