---
phase: 02-backend-triage
plan: 03
subsystem: api
tags: [express, multer, rate-limit, octokit, webhooks, hmac, triage, typescript]

# Dependency graph
requires:
  - phase: 02-backend-triage
    plan: 01
    provides: Express 5 scaffold, types.ts (BugMetadata, TriageResult, PendingApproval), config.ts, health route
  - phase: 02-backend-triage
    plan: 02
    provides: triageReport(), uploadScreenshots(), createGitHubIssue(), ensureLabelsExist() service functions

provides:
  - POST /report handler with triage-first pipeline (validate → triage → spam-exit → ImgBB → GitHub issue)
  - IP-based rate limiter: 10 requests/IP/hour (BACK-03)
  - GitHub webhook HMAC middleware at /webhook/github (BACK-06)
  - pendingApprovals Map for Phase 4 Telegram approval flow
  - Fully wired Express app with correct middleware ordering (webhook before express.json)
  - Startup label ensurance for all configured GitHub repos

affects:
  - 03-pipeline (can import pendingApprovals Map, webhookMiddleware for event callbacks)
  - 04-telegram (consumes pendingApprovals Map from report.ts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Middleware ordering: webhook HMAC (raw body) → CORS → express.json → routes — prevents body stream double-consumption
    - Lazy middleware init: webhook secret checked on first request, not at module load — server starts without env var
    - Triage-first pipeline: AI verdict runs before any external side effects (upload, issue creation)
    - Spam early exit: 200 response without GitHub issue or ImgBB upload (TRIA-03)
    - Pending approvals: module-level Map<number, PendingApproval> as in-process state store for Phase 4

key-files:
  created:
    - backend/src/routes/report.ts
    - backend/src/middleware/rateLimit.ts
    - backend/src/middleware/webhook.ts
  modified:
    - backend/src/app.ts
    - backend/src/index.ts

key-decisions:
  - "Lazy webhook initialization: moved Webhooks instantiation out of module scope into a getter — server starts cleanly without GITHUB_WEBHOOK_SECRET, error surfaces on first webhook request instead of crashing at startup"
  - "app.use('/report', reportLimiter, reportRouter) with Router.post('/', ...) — rate limiter applies before multer, no body stream interference"
  - "pendingApprovals exported as module-level Map — simple in-process state for Phase 4, no DB needed for MVP"

patterns-established:
  - "Pattern: Lazy env-dependent init — modules with required env vars should initialize lazily so the server starts in all environments"
  - "Pattern: CRITICAL middleware order — webhook middleware mounted first (before express.json) to preserve raw body for HMAC"
  - "Pattern: Triage gates pipeline — verdict check after triage, spam returns early before any side effects"

requirements-completed: [BACK-01, BACK-03, BACK-05, BACK-06, BACK-08, TRIA-01, TRIA-03, TRIA-04]

# Metrics
duration: 4min
completed: 2026-03-01
---

# Phase 02 Plan 03: Report Pipeline Wiring Summary

**Express /report route with triage-first pipeline (triage → spam-exit → ImgBB → GitHub issue), rate limiter, webhook HMAC middleware, and correct middleware ordering in fully wired app.ts**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-01T19:05:34Z
- **Completed:** 2026-03-01T19:09:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `/report` handler processes multipart FormData through a strict triage-first pipeline — spam is discarded silently with 200, valid reports get ImgBB uploads and GitHub issue creation
- Rate limiter enforces 10 requests/IP/hour using `express-rate-limit` with `draft-7` standard headers (BACK-03)
- GitHub webhook middleware at `/webhook/github` verifies HMAC-SHA256 signatures using `@octokit/webhooks`, mounted before `express.json()` to preserve raw body stream (BACK-06)
- `index.ts` calls `ensureLabelsExist()` for every configured repo at startup (idempotent, non-fatal)

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /report route handler with triage-first pipeline, and rate limit + webhook middleware** - `e64b5fc` (feat)
2. **Task 2: Wire all routes and middleware into app.ts with correct ordering, and add startup label ensurance** - `5f0cdf5` (feat)

**Plan metadata:** _(docs commit below)_

## Files Created/Modified

- `backend/src/routes/report.ts` - POST /report with multer, triage-first pipeline, pendingApprovals Map export
- `backend/src/middleware/rateLimit.ts` - reportLimiter (express-rate-limit, 10/IP/hour)
- `backend/src/middleware/webhook.ts` - webhookMiddleware with lazy init, HMAC at /webhook/github
- `backend/src/app.ts` - Fully wired: webhook → CORS → express.json → /report with rate limiter
- `backend/src/index.ts` - Startup label ensurance for all configured repos

## Decisions Made

- Lazy webhook initialization: plan specified `new Webhooks({ secret: process.env.GITHUB_WEBHOOK_SECRET! })` at module scope, which throws at startup without the env var. Moved to a lazy getter — server starts in any environment, error surfaces on first webhook request with a proper 500 response.
- Route mounting: `app.use("/report", reportLimiter, reportRouter)` with `reportRouter` having `router.post("/", upload.array(...), handler)` — rate limiter runs before multer processes the multipart body, consistent with plan Option A.
- `pendingApprovals` Map is module-level state — simple, sufficient for MVP single-instance deployment (Phase 4 will consume it within the same process).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Lazy webhook middleware initialization to prevent startup crash**
- **Found during:** Task 2 (server startup verification)
- **Issue:** `new Webhooks({ secret: process.env.GITHUB_WEBHOOK_SECRET! })` is called at module load time. Without `GITHUB_WEBHOOK_SECRET` set (dev environment, CI), the `@octokit/webhooks` constructor throws: `"[@octokit/webhooks] options.secret required"` — crashing the server before it can start.
- **Fix:** Wrapped instantiation in a lazy getter `getWebhooks()`. The `Webhooks` instance and `createNodeMiddleware` result are cached on first call. Requests to non-webhook paths pass through normally without triggering initialization.
- **Files modified:** backend/src/middleware/webhook.ts
- **Verification:** `npx tsc --noEmit` passes; server starts cleanly on `PORT=3333` without `GITHUB_WEBHOOK_SECRET`; `/health` returns `{"status":"ok"}`.
- **Committed in:** 5f0cdf5 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 startup crash bug)
**Impact on plan:** Essential for local dev and CI. In production `GITHUB_WEBHOOK_SECRET` will always be set; the lazy init adds no overhead on the hot path.

## Issues Encountered

- `@octokit/webhooks` `Webhooks` constructor throws synchronously when `secret` is undefined — the non-null assertion `!` in TypeScript silences the compile-time warning but cannot prevent the runtime throw. Resolved with lazy initialization.

## User Setup Required

Add to `backend/.env` for webhook verification to work:
```
GITHUB_WEBHOOK_SECRET=<your-github-webhook-secret>
```

All other required env vars (`IMGBB_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `PROJECT_MAP`) were documented in previous plans.

## Next Phase Readiness

- Full backend pipeline is wired and type-safe: widget POST → rate limit → multer → triage → [spam: 200 | valid: ImgBB → GitHub issue → pendingApprovals]
- `webhookMiddleware` is ready for Phase 3 event callback registration: `getWebhooksInstance().on("issues.labeled", ...)`
- `pendingApprovals` Map exported from `report.ts` ready for Phase 4 Telegram approval flow
- Server compiles cleanly and starts with health check passing

## Self-Check: PASSED

All files verified present. All commits verified in git log.

- FOUND: backend/src/routes/report.ts
- FOUND: backend/src/middleware/rateLimit.ts
- FOUND: backend/src/middleware/webhook.ts
- FOUND: backend/src/app.ts (modified)
- FOUND: backend/src/index.ts (modified)
- FOUND commit: e64b5fc
- FOUND commit: 5f0cdf5

---
*Phase: 02-backend-triage*
*Completed: 2026-03-01*
