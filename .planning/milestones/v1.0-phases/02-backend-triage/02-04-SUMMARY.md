---
phase: 02-backend-triage
plan: 04
subsystem: infra
tags: [railway, deployment, nixpacks, health-check, toml]

# Dependency graph
requires:
  - phase: 02-backend-triage
    provides: "Working Express backend with npm start script and GET /health endpoint returning 200"
provides:
  - "backend/railway.toml: Railway deployment config with NIXPACKS builder, health check, and ON_FAILURE restart policy"
affects: [railway-deployment, backend-hosting]

# Tech tracking
tech-stack:
  added: []
  patterns: [railway-toml for Railway service configuration, ON_FAILURE restart policy for always-on web services]

key-files:
  created: [backend/railway.toml]
  modified: []

key-decisions:
  - "restartPolicyType = ON_FAILURE (not ALWAYS) — restarts on crashes, does not restart on clean SIGTERM during redeployment"
  - "buildCommand = npm install only, no separate tsc build step — tsx handles TypeScript execution at runtime via npm start"
  - "healthcheckTimeout = 300s — accommodates npm install + server startup time in Railway environment"

patterns-established:
  - "railway.toml: startCommand must match package.json scripts.start exactly"
  - "railway.toml: healthcheckPath must match a live GET endpoint that returns 200"

requirements-completed: [BACK-07]

# Metrics
duration: 1min
completed: 2026-03-01
---

# Phase 02 Plan 04: Railway Deployment Configuration Summary

**railway.toml with NIXPACKS builder, npm start entry point, /health check, and ON_FAILURE auto-restart closes the BACK-07 deployment gap**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-01T19:23:43Z
- **Completed:** 2026-03-01T19:24:11Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created backend/railway.toml with all required Railway deployment fields
- NIXPACKS builder configured for Node.js auto-detection from package.json
- Health check path /health wired to the existing Express health endpoint
- ON_FAILURE restart policy ensures always-on service without restart loops on clean shutdown

## Task Commits

Each task was committed atomically:

1. **Task 1: Create backend/railway.toml with deployment configuration** - `ee4b130` (feat)

**Plan metadata:** (docs commit pending)

## Files Created/Modified
- `backend/railway.toml` - Railway deployment config: NIXPACKS builder, npm start command, /health check, ON_FAILURE restart policy

## Decisions Made
- `restartPolicyType = "ON_FAILURE"` rather than `"ALWAYS"` — prevents restart loops on clean SIGTERM during Railway redeployments while still ensuring the service restarts after crashes
- No separate build step (no `tsc` in buildCommand) — tsx handles TypeScript at runtime via `node --import tsx src/index.ts`, keeping the build simple

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Railway will pick up railway.toml automatically when the repo is connected.

## Next Phase Readiness
- All Phase 2 backend-triage plans complete (02-01 through 02-04)
- backend/railway.toml closes the last BACK-07 verification gap
- Backend is ready to deploy: build config, health check, and restart policy all specified
- Phase 3 (Ralph Pipeline Integration) can proceed

---
*Phase: 02-backend-triage*
*Completed: 2026-03-01*

## Self-Check: PASSED

- backend/railway.toml: FOUND
- 02-04-SUMMARY.md: FOUND
- Commit ee4b130: FOUND
