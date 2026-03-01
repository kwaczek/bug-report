---
phase: 01-widget
plan: 01
subsystem: ui
tags: [vite, typescript, iife, html-to-image, widget, shadow-dom]

# Dependency graph
requires: []
provides:
  - Widget package scaffold with Vite IIFE build configuration outputting single widget.js
  - TypeScript interfaces BugMetadata, WidgetConfig, SubmitArgs, SubmitResult in widget/src/types.ts
  - collectMetadata() function collecting 9 browser/screen fields in widget/src/metadata.ts
affects: [01-02, 01-03]

# Tech tracking
tech-stack:
  added:
    - vite 7.3.1 (IIFE library bundler)
    - typescript 5.x (type checking)
    - html-to-image 1.11.13 (screenshot capture, used in later plans)
    - "@types/node ^20.0.0"
  patterns:
    - Vite IIFE library mode with single widget.js output
    - TypeScript strict mode targeting ES2020 DOM
    - Type-only imports (import type) for interfaces across modules

key-files:
  created:
    - widget/package.json
    - widget/tsconfig.json
    - widget/vite.config.ts
    - widget/src/types.ts
    - widget/src/metadata.ts
  modified: []

key-decisions:
  - "Use Vite IIFE lib mode without vite-plugin-css-injected-by-js — CSS handled via ?inline import in later plans (simpler)"
  - "collectMetadata() uses devicePixelRatio ?? 1 fallback for browsers without the API"
  - "SubmitArgs and SubmitResult interfaces added alongside BugMetadata/WidgetConfig to define full submission contract upfront"

patterns-established:
  - "Pattern: All widget types defined in a single types.ts; other modules import via type-only import"
  - "Pattern: Vite config uses inlineDynamicImports: true to ensure single-file IIFE output"

requirements-completed: [WIDG-01, WIDG-03, WIDG-07]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 1 Plan 01: Widget Scaffold Summary

**Vite 7 IIFE widget package with strict TypeScript, html-to-image dep, and typed BugMetadata/collectMetadata() foundation for all subsequent widget modules**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-01T17:48:08Z
- **Completed:** 2026-03-01T17:49:36Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Scaffolded widget/ directory with package.json, tsconfig.json, vite.config.ts and ran npm install (17 packages, 0 vulnerabilities)
- Created widget/src/types.ts exporting BugMetadata (9 fields), WidgetConfig, SubmitArgs, SubmitResult interfaces
- Created widget/src/metadata.ts exporting collectMetadata() collecting url, userAgent, screen dimensions, devicePixelRatio, language, timestamp
- tsc --noEmit passes with zero errors on the new source files

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold widget package and Vite IIFE config** - `c6a2cc1` (chore)
2. **Task 2: Define shared types and metadata collection module** - `2c12e46` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `widget/package.json` - Package manifest with html-to-image dep and Vite devDeps
- `widget/tsconfig.json` - TypeScript strict config targeting ES2020 DOM
- `widget/vite.config.ts` - Vite IIFE library config outputting dist/widget.js
- `widget/package-lock.json` - Lockfile (17 packages installed)
- `widget/src/types.ts` - BugMetadata, WidgetConfig, SubmitArgs, SubmitResult interfaces
- `widget/src/metadata.ts` - collectMetadata() browser/screen metadata collector

## Decisions Made
- Used Vite IIFE lib mode without `vite-plugin-css-injected-by-js` — the plan chose the simpler `?inline` import approach for CSS (to be used in later plans)
- Added `devicePixelRatio ?? 1` fallback in collectMetadata() as the plan specified — defensive for obscure browsers
- Included SubmitArgs and SubmitResult in types.ts even though they're used by later plans — defines the full submission contract upfront so downstream modules have a stable type import

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- widget/src/types.ts provides stable type contracts for all subsequent widget modules (screenshot.ts, submit.ts, upload.ts, widget.ts, index.ts)
- widget/vite.config.ts is ready for building once src/index.ts entry point is created in plan 02
- npm dependencies installed and lockfile committed; no additional installs needed for plan 02

---
*Phase: 01-widget*
*Completed: 2026-03-01*
