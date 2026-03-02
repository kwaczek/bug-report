---
phase: 03-ralph-integration
plan: "02"
subsystem: infra
tags: [express, typescript, zod, octokit, relay, fix-plan, dedup, queue]

requires:
  - phase: 03-ralph-integration/03-01
    provides: RelayFixPayload contract and backend relay.ts service that POSTs to this server

provides:
  - relay/ Express server with timing-safe Bearer auth, POST /fix endpoint, and per-project fix_plan.md writes
  - Deduplication service (in-memory + JSONL file persistence) preventing double-processing of webhook retries
  - Per-project Promise-chain queue serializing fix_plan.md writes without concurrent corruption
  - isProjectBusy() check preventing clobbering in-progress Ralph jobs
  - watchFix() timeout monitor relabeling stalled GitHub issues from auto-fix to needs-review via Octokit

affects:
  - 03-ralph-integration/03-03
  - Ralph workspace project dirs (writes to projects/<repoName>/.ralph/fix_plan.md)

tech-stack:
  added:
    - express 5.1.0 (relay server)
    - zod 3.x (payload validation)
    - "@octokit/rest" 21.x (GitHub issue relabeling)
    - dotenv 16.x
    - tsx 4.x (TypeScript runtime for dev/prod)
  patterns:
    - createApp() factory pattern (mirrors backend, testability)
    - Per-project Promise-chain queue via Map<string, Promise<void>>
    - timingSafeEqual for constant-time secret comparison
    - JSONL append-only file for dedup persistence across restarts
    - isProjectBusy() reads uncompleted checklist items to detect active Ralph jobs
    - Fire-and-forget watchFix() with in-memory setTimeout map

key-files:
  created:
    - relay/package.json
    - relay/tsconfig.json
    - relay/.env.example
    - relay/src/index.ts
    - relay/src/app.ts
    - relay/src/types.ts
    - relay/src/routes/fix.ts
    - relay/src/services/dedup.ts
    - relay/src/services/queue.ts
    - relay/src/services/fixplan.ts
    - relay/src/services/fix-watcher.ts
  modified: []

key-decisions:
  - "Health route mounted BEFORE auth middleware — accessible without credentials for monitoring"
  - "Duplicate requests return 200 (not 4xx) to prevent retry escalation from upstream webhook systems"
  - "markSeen() called before enqueue() to prevent race-condition duplicates between check and write"
  - "Busy project gets 60s single retry then gives up rather than indefinite blocking"
  - "In-memory setTimeout Map for fix-watcher — relay restart clears watches (acceptable for manual operator process)"
  - "timingSafeEqual wrapped in try/catch to handle empty-string edge case safely"

patterns-established:
  - "Auth-before-body: express.json() mounted AFTER auth middleware to avoid parsing untrusted request bodies"
  - "Per-project serialization: Promise chaining via Map<project, Promise<void>> — zero dependencies, no Redis needed"
  - "JSONL append-only persistence: simple, crash-safe, easy to inspect and trim manually"

requirements-completed: [RALF-01, RALF-02, RALF-04, RALF-05, RALF-06, RALF-07]

duration: 3min
completed: "2026-03-02"
---

# Phase 3 Plan 02: Relay Server Summary

**Express relay server with timing-safe auth, Zod-validated POST /fix, per-project Promise-chain queue, and fix_plan.md writes in Ralph's verified markdown format with Octokit-powered stall detection**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-02T09:44:22Z
- **Completed:** 2026-03-02T09:47:15Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Full relay/ package with Express 5 server, auth middleware, and all service layers
- POST /fix endpoint with Zod validation, dedup, async queue, and immediate 202 response
- fix_plan.md writer producing Ralph's exact verified checklist format for autonomous consumption
- Fix stall detector: watchFix() relabels GitHub issues from auto-fix to needs-review after configurable timeout

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold relay package with Express app, auth middleware, and types** - `3755c47` (feat)
2. **Task 2: Implement core services — dedup, queue, fixplan writer, fix watcher** - `9c56065` (feat)
3. **Task 3: Implement POST /fix route and wire into app** - `da61567` (feat)

**Plan metadata:** _(docs commit — see below)_

## Files Created/Modified

- `relay/package.json` - Package metadata: bug-report-relay, Express 5, zod, @octokit/rest
- `relay/tsconfig.json` - TypeScript config matching backend (ES2022, bundler moduleResolution)
- `relay/.env.example` - PORT, RELAY_SECRET, RALPH_WORKSPACE, GITHUB_TOKEN, FIX_TIMEOUT_MS
- `relay/src/index.ts` - Server bootstrap: loadSeen() then listen on PORT 3001
- `relay/src/app.ts` - createApp() factory: health (no auth) → auth middleware → json → /fix router
- `relay/src/types.ts` - RelayFixRequest and FixWatchEntry interfaces
- `relay/src/routes/fix.ts` - POST / with Zod validation, dedup, enqueue, 202 response
- `relay/src/services/dedup.ts` - isDuplicate/markSeen/loadSeen with JSONL persistence
- `relay/src/services/queue.ts` - enqueue() per-project Promise-chain serialization
- `relay/src/services/fixplan.ts` - buildFixPlan/isProjectBusy/writeFixPlan
- `relay/src/services/fix-watcher.ts` - watchFix/cancelWatch with Octokit relabeling on timeout

## Decisions Made

- Health endpoint is behind no auth — mounted before the auth middleware, consistent with backend pattern
- Duplicate webhook deliveries return HTTP 200 (not 409/4xx) to prevent upstream retry escalation
- `markSeen()` is called before `enqueue()` — prevents the race where two simultaneous requests pass `isDuplicate()` before either is marked
- Busy project (in-progress fix_plan.md) gets a single 60-second retry then skips — avoids indefinite blocking while still handling brief timing gaps
- In-memory `setTimeout` map for fix-watcher state — acceptable tradeoff since relay restart is manual; no distributed state required
- `timingSafeEqual` wrapped in `try/catch` — handles the zero-length buffer edge case when `RELAY_SECRET` is empty or header is missing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Set the following environment variables before running the relay:

```
PORT=3001
RELAY_SECRET=<same value as RELAY_SECRET on Railway backend>
RALPH_WORKSPACE=/Users/miro/Workspace/PERSONAL/ralph-workspace
GITHUB_TOKEN=<GitHub PAT with issues:write scope>
FIX_TIMEOUT_MS=3600000
```

Run the relay:
```bash
cd relay && npm install && npm run dev
```

## Next Phase Readiness

- Relay server is complete and ready to receive payloads from the Railway backend (Plan 03-01)
- Plan 03-03 (Cloudflare Tunnel + integration wiring) can proceed — relay is the component being exposed

---
*Phase: 03-ralph-integration*
*Completed: 2026-03-02*

## Self-Check: PASSED

All 11 relay source files confirmed present on disk. All 3 task commits (3755c47, 9c56065, da61567) confirmed in git log. TypeScript compiles with zero errors.
