---
phase: 03-ralph-integration
plan: 01
subsystem: api
tags: [logging, jsonl, webhooks, relay, octokit, github-issues]

# Dependency graph
requires:
  - phase: 02-backend-triage
    provides: triageReport() pipeline, getWebhooksInstance(), GitHub issue creation with labels

provides:
  - Append-only JSONL triage logger at $RALPH_WORKSPACE/triage.log
  - Relay notification client (notifyRelay) with 5-attempt retry schedule
  - GitHub issue relabeler (relabelIssue) using Octokit — auto-fix → needs-review on relay exhaustion
  - issues.labeled webhook handler registered at startup via registerRelayWebhook()

affects:
  - 03-ralph-integration (relay server will consume RelayFixPayload contract)
  - 04-telegram (pendingApprovals map unchanged, phase 4 reads it)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Append-only JSONL logging with try/catch wrapper (never throws, never disrupts pipeline)
    - Fire-and-forget background retry loop with .catch() error handler
    - Startup registration of webhook event handlers with try/catch guard

key-files:
  created:
    - backend/src/services/triage-log.ts
    - backend/src/services/relay.ts
    - backend/src/services/issue-relabel.ts
  modified:
    - backend/src/routes/report.ts
    - backend/src/index.ts
    - backend/.env.example

key-decisions:
  - "Two-point triage logging: spam logged with null issueId before early return; auto-fix/review logged with actual issueId after GitHub issue creation"
  - "registerRelayWebhook() wrapped in try/catch at startup — missing GITHUB_WEBHOOK_SECRET causes a warning, not a crash"
  - "relay.ts uses native fetch() (Node 18+ built-in) for relay POST — no extra dependency"
  - "Background retry fires as fire-and-forget Promise to avoid blocking the HTTP response pipeline"

patterns-established:
  - "Non-fatal background operations: always detach with .catch() handler, never await in the main pipeline"
  - "Startup registration guards: wrap optional startup hooks in try/catch and warn rather than crash"

requirements-completed: [TRIA-05]

# Metrics
duration: 2min
completed: 2026-03-02
---

# Phase 03 Plan 01: Triage Logging and Relay Notification Service Summary

**Append-only JSONL triage logging for all verdict lanes plus relay notification client with 5-step retry and automatic GitHub issue relabeling on exhaustion**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-02T09:44:14Z
- **Completed:** 2026-03-02T09:46:42Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Every triage decision (spam, review, auto-fix) is now logged to `$RALPH_WORKSPACE/triage.log` as JSONL with timestamp, verdict, confidence, reasoning, and issueId
- Spam decisions captured with `issueId: null` before early return; valid decisions captured with the GitHub issue number after creation
- Relay service POSTs `RelayFixPayload` to `RELAY_URL` with Bearer auth when `issues.labeled` webhook fires for the `auto-fix` label
- After all five retry attempts (1, 5, 15, 30, 60 min) are exhausted, the GitHub issue is automatically relabeled from `auto-fix` to `needs-review`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create triage log service and integrate into report pipeline** - `5bd6bca` (feat)
2. **Task 2: Create relay notification service with retry/relabel and register webhook handler** - `cd9814d` (feat)

**Plan metadata:** committed with SUMMARY/STATE/ROADMAP update

## Files Created/Modified
- `backend/src/services/triage-log.ts` - Append-only JSONL logger; exports TriageLogEntry interface and appendTriageLog()
- `backend/src/services/relay.ts` - Relay notification client; exports notifyRelay() and registerRelayWebhook()
- `backend/src/services/issue-relabel.ts` - GitHub issue relabeler using Octokit; exports relabelIssue()
- `backend/src/routes/report.ts` - Added appendTriageLog() calls in spam path and post-issue-creation path
- `backend/src/index.ts` - Added registerRelayWebhook() call at startup (try/catch guarded)
- `backend/.env.example` - Added RELAY_URL, RELAY_SECRET, RALPH_WORKSPACE entries

## Decisions Made
- **Two-point triage logging:** Spam logged with `issueId: null` just before early return; auto-fix/review logged with actual `issueId` after `createGitHubIssue()` returns. Every log entry has the correct issueId when available.
- **relay.ts uses native `fetch()`:** Node 18+ built-in — no extra dependency needed.
- **Background retry is fire-and-forget:** `retryRelayDelivery()` is never awaited in the main pipeline; it runs detached with a `.catch()` guard so relay failures cannot crash the HTTP response.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Guarded registerRelayWebhook() call at startup against missing GITHUB_WEBHOOK_SECRET**
- **Found during:** Task 2 (registering webhook handler in index.ts)
- **Issue:** `registerRelayWebhook()` calls `getWebhooksInstance()` which throws if `GITHUB_WEBHOOK_SECRET` is not set, crashing the server at startup in environments where the secret is absent
- **Fix:** Wrapped the `registerRelayWebhook()` call in `index.ts` with try/catch that emits a `console.warn` instead of crashing
- **Files modified:** `backend/src/index.ts`
- **Verification:** TypeScript compiles; server start path is non-fatal without the secret
- **Committed in:** cd9814d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Essential correctness fix — matches the plan's must-have truth that missing env vars cause warnings, not crashes. No scope creep.

## Issues Encountered
None — both tasks executed cleanly after the startup guard deviation.

## User Setup Required
Three new environment variables are needed in the Railway/production environment and local `.env`:

| Variable | Purpose |
|---|---|
| `RELAY_URL` | URL of the local relay server endpoint (e.g. `https://relay.yourdomain.com/fix`) |
| `RELAY_SECRET` | Shared Bearer token for relay authentication |
| `RALPH_WORKSPACE` | Absolute path to the ralph-workspace root directory (where `triage.log` will be written) |

These are optional for basic backend operation — missing values produce warnings, not crashes.

## Next Phase Readiness
- Relay notification contract (`RelayFixPayload`) is defined and ready for the relay server implementation
- `triage.log` JSONL format is stable — each entry has: `timestamp`, `issueId`, `owner`, `repo`, `verdict`, `confidence`, `reasoning`
- Webhook handler fires correctly on `issues.labeled` for `auto-fix` label — relay server can be built independently

## Self-Check: PASSED

- FOUND: backend/src/services/triage-log.ts
- FOUND: backend/src/services/relay.ts
- FOUND: backend/src/services/issue-relabel.ts
- FOUND: .planning/phases/03-ralph-integration/03-01-SUMMARY.md
- FOUND: commit 5bd6bca (Task 1)
- FOUND: commit cd9814d (Task 2)

---
*Phase: 03-ralph-integration*
*Completed: 2026-03-02*
