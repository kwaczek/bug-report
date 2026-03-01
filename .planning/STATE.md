# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** Bugs reported by users get fixed and deployed automatically without manual developer intervention — closing the loop from report to resolution.
**Current focus:** Phase 1 — Widget

## Current Position

Phase: 1 of 4 (Widget) — COMPLETE
Plan: 3 of 3 in current phase — COMPLETE
Status: Phase complete — ready for Phase 2 (Backend)
Last activity: 2026-03-01 — Completed 01-03 submit.ts FormData module, Vite production build (22.36 KB), human-verified end-to-end widget flow

Progress: [███░░░░░░░] 25%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 8.3 min
- Total execution time: ~0.42 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-widget | 3 | 25 min | 8.3 min |

**Recent Trend:**
- Last 5 plans: 01-01 (2 min), 01-02 (3 min), 01-03 (20 min)
- Trend: stable (01-03 longer due to human verification checkpoint)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Pre-issue triage: AI runs before GitHub issue creation; spam is discarded without creating an issue
- Image hosting: ImgBB for MVP (simpler, fewer GitHub token scopes; switch to Contents API in v1.x if needed)
- Telegram library: telegraf 4.16.3 (better TypeScript types vs grammY)
- Local relay exposure: Cloudflare Tunnel preferred over ngrok (stable, free, permanent URL)
- Widget CSS: Use ?inline Vite import instead of vite-plugin-css-injected-by-js (simpler, avoids plugin complexity)
- Widget types: SubmitArgs and SubmitResult defined upfront in types.ts to establish full submission contract early
- document.currentScript captured synchronously at module scope before async IIFE — becomes null after script execution
- submit.ts placeholder stub created in plan 02 so widget.ts dynamic import type-checks before plan 03 implements the real module
- Shadow host dimensions 0x0, floating button positions itself via fixed CSS inside shadow root — no layout impact on host page
- submitReport() uses FormData POST without manual Content-Type — browser sets multipart boundary automatically
- Paste handler attached to document (not shadowRoot) — shadow DOM does not receive paste events when focus is outside the shadow tree
- autoScreenshot named 'screenshot-auto.jpg', attached images named 'screenshot-{i}.png' — consistent naming for backend parsing

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 3: Ralph's fix_plan.md format and --monitor behavior must be confirmed from Ralph source before implementation begins
- Phase 3: ImgBB free tier rate limits are undocumented — test under load; have GitHub Contents API as fallback
- Phase 3: Cloudflare Tunnel vs ngrok decision must be finalized before relay server implementation

## Session Continuity

Last session: 2026-03-01
Stopped at: Completed 01-03-PLAN.md — Phase 1 (Widget) fully complete. submit.ts, dist/widget.js, widget.test.html. Ready for Phase 2 (Backend).
Resume file: None
