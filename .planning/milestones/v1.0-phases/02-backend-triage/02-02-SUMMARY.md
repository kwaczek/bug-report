---
phase: 02-backend-triage
plan: 02
subsystem: api
tags: [imgbb, anthropic, claude, octokit, github, zod, typescript, triage]

# Dependency graph
requires:
  - phase: 02-backend-triage
    plan: 01
    provides: Express 5 backend scaffold, shared types (TriageResult, BugMetadata), all dependencies installed

provides:
  - ImgBB screenshot upload (uploadToImgBB, uploadScreenshots with graceful degradation)
  - Anthropic AI triage service (triageReport with JSON parsing and safe "review" fallback)
  - GitHub issue creation (createGitHubIssue with markdown body, labels)
  - GitHub label management (ensureLabelsExist, idempotent 422-safe)
  - buildIssueBody() markdown template with Screenshots, Environment, and Triage tables

affects:
  - 02-03 (webhook route can use ensureLabelsExist at startup)
  - 03-pipeline (imports triageReport, createGitHubIssue, uploadScreenshots for /report handler)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Graceful degradation: Promise.allSettled for batch uploads, placeholder URL on failure
    - Safe AI triage: entire triageReport wrapped in try/catch, always returns TriageResult
    - Idempotent label setup: createLabel catches 422 (already exists), safe to call at startup
    - Anthropic structured output via messages.create() + JSON prompt + zod.safeParse() (SDK 0.39.0 compatible)

key-files:
  created:
    - backend/src/services/imgbb.ts
    - backend/src/services/triage.ts
    - backend/src/services/github.ts
  modified: []

key-decisions:
  - "triageReport() uses messages.create() + JSON system prompt + zod.safeParse() instead of messages.parse()/zodOutputFormat — SDK 0.39.0 does not expose those APIs"
  - "uploadScreenshots() uses Promise.allSettled not Promise.all — one failed upload cannot block the bug report"
  - "ensureLabelsExist() uses Promise.all over all labels — parallel idempotent creation, 422 swallowed per label independently"
  - "buildIssueBody() returns pure markdown string — no side effects, easily testable, composed by createGitHubIssue"

patterns-established:
  - "Pattern: Graceful degradation in batch operations — Promise.allSettled + placeholder result, never abort on partial failure"
  - "Pattern: Infallible triage — triageReport never throws; all failures return safe 'review' fallback so pipeline is never blocked"
  - "Pattern: Idempotent startup side-effects — ensureLabelsExist catches 422 so repeated calls are always safe"

requirements-completed: [BACK-02, BACK-05, TRIA-01, TRIA-02, TRIA-03, TRIA-04]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 02 Plan 02: Service Modules Summary

**ImgBB upload, Anthropic AI triage, and GitHub issue creation implemented as three pure async service modules with graceful degradation and safe fallbacks throughout**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-01T19:01:27Z
- **Completed:** 2026-03-01T19:03:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- ImgBB service uploads screenshots with `Promise.allSettled` — one failed upload yields a placeholder, not a crash
- Triage service calls `claude-sonnet-4-5` via standard `messages.create()` API, validates JSON with `zod.safeParse()`, always returns a valid `TriageResult` even on network or parse errors
- GitHub service creates issues with a rich markdown body (description, screenshot embeds, environment table, triage table) and applies verdict-specific labels idempotently

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement ImgBB upload service and Anthropic triage service** - `fef3a1f` (feat)
2. **Task 2: Implement GitHub issue creation service with label management** - `62ebe61` (feat)

**Plan metadata:** _(docs commit below)_

## Files Created/Modified

- `backend/src/services/imgbb.ts` - uploadToImgBB (Buffer → base64 → api.imgbb.com), uploadScreenshots (batch with graceful degradation)
- `backend/src/services/triage.ts` - triageReport (claude-sonnet-4-5, zod validation, infallible "review" fallback)
- `backend/src/services/github.ts` - buildIssueBody (markdown template), createGitHubIssue (Octokit + labels), ensureLabelsExist (idempotent)

## Decisions Made

- `triageReport()` uses `messages.create()` + JSON system prompt + `zod.safeParse()` instead of `messages.parse()` / `zodOutputFormat` — the installed `@anthropic-ai/sdk@0.39.0` does not expose those APIs (added in a later version). Behavior is identical: structured output validated against `TriageSchema`.
- `uploadScreenshots()` uses `Promise.allSettled` not `Promise.all` — partial upload failures are replaced with a `"[screenshot unavailable]"` placeholder, ensuring the bug report is never blocked.
- `ensureLabelsExist()` calls `createLabel` for each label concurrently and catches `status === 422` (already-exists) per label independently so repeated calls at startup are always safe.
- `buildIssueBody()` is a pure function separate from `createGitHubIssue()` — no side effects, easily testable in isolation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used messages.create() + zod.safeParse() instead of messages.parse()/zodOutputFormat**
- **Found during:** Task 1 (triage.ts implementation)
- **Issue:** Plan specified `import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"` and `client.messages.parse()`. Neither exists in `@anthropic-ai/sdk@0.39.0` — the `helpers/` directory does not exist in this version.
- **Fix:** Used `client.messages.create()` with a JSON-instructed system prompt, then `JSON.parse()` + `TriageSchema.safeParse()` for validation. Identical runtime behavior and safety guarantees.
- **Files modified:** backend/src/services/triage.ts
- **Verification:** `npx tsc --noEmit` passes cleanly; function signature and return type match plan spec exactly.
- **Committed in:** fef3a1f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — SDK API mismatch)
**Impact on plan:** Zero functional difference. Same structured output + zod validation + safe fallback. No scope creep.

## Issues Encountered

- `@anthropic-ai/sdk@0.39.0` does not expose `messages.parse()` or `zodOutputFormat` — plan was written against a newer SDK. Resolved by using the standard `messages.create()` API with a JSON prompt. All type contracts and safety properties preserved.

## User Setup Required

No new env vars beyond those documented in 02-01. The three services use:
- `IMGBB_API_KEY` — already in `backend/.env.example`
- `ANTHROPIC_API_KEY` — already in `backend/.env.example`
- `GITHUB_TOKEN` — already in `backend/.env.example`

## Next Phase Readiness

- All three service modules compile and export typed async functions
- Services are stateless and composable — ready for the `/report` route wiring in Plan 02-03
- `ensureLabelsExist()` ready to be called at app startup in `index.ts`
- `triageReport()`, `uploadScreenshots()`, `createGitHubIssue()` can be imported directly into the route handler

## Self-Check: PASSED

All files verified present. All commits verified in git log.

- FOUND: backend/src/services/imgbb.ts
- FOUND: backend/src/services/triage.ts
- FOUND: backend/src/services/github.ts
- FOUND commit: fef3a1f
- FOUND commit: 62ebe61

---
*Phase: 02-backend-triage*
*Completed: 2026-03-01*
