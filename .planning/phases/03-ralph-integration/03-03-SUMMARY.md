---
phase: 03-ralph-integration
plan: 03
subsystem: infra
tags: [claude-code, ralph, relay, child_process, fix_plan]

# Dependency graph
requires:
  - phase: 03-ralph-integration
    plan: "03-01"
    provides: relay server scaffold, notifyRelay() backend service, registerRelayWebhook()
  - phase: 03-ralph-integration
    plan: "03-02"
    provides: POST /fix route, dedup, queue, fixplan writer, fix-watcher timeout
provides:
  - Smart bug analysis pipeline (Claude Code CLI → enriched fix_plan.md → Ralph spawn)
  - backend report.ts directly notifies relay with full screenshotUrls for auto-fix verdicts
  - repo-map.json for GitHub repo → local folder name mismatches
  - project-resolver.ts for canonical repo → absolute project directory resolution
  - claude-analyze.ts spawns Claude Code to write root cause analysis into fix_plan.md
  - ralph-runner.ts spawns Ralph detached with running-state check
  - fix-watcher.ts upgraded with 5-min progress polling and early completion detection
affects:
  - 04-telegram-approval (relay pipeline is the primary fix flow they interact with)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - child_process.spawn with detached:true + unref() for fire-and-forget background processes
    - readline-based stdout/stderr piping for long-running child processes
    - repo-map.json for environment-specific name mismatches, loaded at module init
    - Fallback chain: Claude analysis → template fix_plan as safety net

key-files:
  created:
    - relay/repo-map.json
    - relay/src/services/project-resolver.ts
    - relay/src/services/claude-analyze.ts
    - relay/src/services/ralph-runner.ts
  modified:
    - backend/src/routes/report.ts
    - relay/src/services/fixplan.ts
    - relay/src/routes/fix.ts
    - relay/src/services/fix-watcher.ts

key-decisions:
  - "notifyRelay() called fire-and-forget (not awaited) in report.ts — relay failure must not block bug report response"
  - "repo-map.json only stores mismatches — default is repo name = folder name (zero-config for most projects)"
  - "Claude Code CLI spawned with allowedTools constrained to Read,Glob,Grep,Write,WebFetch,Bash(ls *),Bash(cat *) — prevents unwanted side effects"
  - "ralph-runner reads status.json to detect running Ralph before spawning — avoids parallel Ralph instances"
  - "fix-watcher upgraded from single setTimeout to setTimeout+setInterval pair — both cleared on cancelWatch()"
  - "Template fix_plan fallback in fix.ts on Claude analysis failure — Ralph always has something to execute"
  - "10-minute hard timeout on Claude Code CLI process — kills if hung, triggers fallback path"

patterns-established:
  - "Pipeline logging: [service-name] ▶ action description — consistent across all pipeline stages"
  - "resolveProjectDir() is the single source of truth for repo→path resolution in relay"

requirements-completed:
  - RALF-03
  - RALF-06

# Metrics
duration: 4min
completed: 2026-03-02
---

# Phase 03 Plan 03: Smart Relay Pipeline Summary

**Smart bug-to-fix pipeline: Claude Code analyzes bug reports with codebase context, writes enriched fix_plan.md with root cause analysis, then Ralph executes the fix — all fully automated from report submission**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-02T11:11:53Z
- **Completed:** 2026-03-02T11:15:21Z
- **Tasks:** 2 of 3 (Task 3 is human-verify checkpoint)
- **Files modified:** 8

## Accomplishments

- Backend `report.ts` now calls `notifyRelay()` directly for auto-fix verdicts with full `screenshotUrls` (primary path)
- Smart relay pipeline: Claude Code CLI analyzes bug + codebase → writes enriched fix_plan.md → Ralph spawned detached
- `project-resolver.ts` canonicalizes repo names to absolute project directories via `repo-map.json`
- `fix-watcher.ts` upgraded with 5-minute progress polling and early-completion detection (clears both handles)
- Fallback to template fix_plan if Claude analysis fails — pipeline never silently drops a fix job

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire full report data to relay + add project resolution** - `270da0d` (feat)
2. **Task 2: Smart analysis pipeline — Claude Code + Ralph + enhanced monitoring** - `e875f52` (feat)
3. **Task 3: Verify smart relay pipeline end-to-end** - PENDING (human-verify checkpoint)

## Files Created/Modified

- `backend/src/routes/report.ts` - Added notifyRelay() call for auto-fix verdicts with real screenshotUrls
- `relay/repo-map.json` - GitHub repo → local folder name mapping (rohlik-stats → rohlik-web)
- `relay/src/services/project-resolver.ts` - Resolves repo name to absolute project directory path
- `relay/src/services/fixplan.ts` - Updated to use resolveProjectDir() for all path operations
- `relay/src/services/claude-analyze.ts` - Spawns Claude Code CLI with 10-min timeout, bug context, template prompt
- `relay/src/services/ralph-runner.ts` - Spawns Ralph detached with status.json running-state check
- `relay/src/routes/fix.ts` - Replaced dumb template writer with smart pipeline (Claude → Ralph → watcher)
- `relay/src/services/fix-watcher.ts` - Added setInterval progress polling, resolveProjectDir() for path

## Decisions Made

- `notifyRelay()` called fire-and-forget in report.ts — relay failure must not block the HTTP response
- `repo-map.json` only stores mismatches (default: folder name = repo name) — zero-config for most projects
- Claude Code CLI tools constrained to Read/Glob/Grep/Write/WebFetch/Bash(ls,cat) — prevents side effects
- `ralph-runner` reads `status.json` before spawning — avoids parallel Ralph instances on same project
- Template fix_plan fallback ensures Ralph always has something to execute even if Claude fails

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — both tasks completed cleanly. TypeScript typechecks passed for both relay and backend.

## User Setup Required

None — no external service configuration required for the code changes in this plan.

## Next Phase Readiness

- Smart pipeline is code-complete and typechecked
- Human verification required (Task 3): start relay + tunnel, POST test payload to `/fix`, verify console logs and fix_plan.md quality
- After verification, Phase 3 is complete and Phase 4 (Telegram approval flow) can begin

---
*Phase: 03-ralph-integration*
*Completed: 2026-03-02*
