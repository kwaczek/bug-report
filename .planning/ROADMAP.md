# Roadmap: Bug Report Pipeline

## Overview

Two phases deliver the core bug report pipeline. The widget ships first — it has zero external dependencies and can be verified in isolation. Phase 2 combines the backend service with AI triage (pre-issue triage must live in the same handler as issue creation). Phases 3 (Ralph auto-fix) and 4 (Telegram approval) are deferred to v2 — v1 focuses on getting widget → triage → GitHub issues working in production first.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Widget** - Embeddable script-tag widget with screenshot capture, Shadow DOM isolation, and graceful failure
- [x] **Phase 2: Backend + Triage** - Express 5 service on Railway with pre-issue AI triage, rate-limiting, and conditional GitHub issue creation (completed 2026-03-01)
- [ ] **Phase 3: Ralph Integration** *(v2)* - Local relay server, fix_plan.md generation, job queue, and auto-fix pipeline wiring
- [ ] **Phase 4: Telegram** *(v2)* - Human-in-the-loop approve/reject flow for uncertain triage verdicts

## Phase Details

### Phase 1: Widget
**Goal**: Developers can embed a single script tag into any project and users can submit bug reports with screenshots — without affecting the host application
**Depends on**: Nothing (first phase)
**Requirements**: WIDG-01, WIDG-02, WIDG-03, WIDG-04, WIDG-05, WIDG-06, WIDG-07, WIDG-08, WIDG-09
**Success Criteria** (what must be TRUE):
  1. Pasting `<script src="..." data-project-id="..."></script>` into any HTML page shows a floating report button with no visible style conflicts
  2. Clicking the button opens a form pre-filled with the current page URL; submitting it captures a screenshot automatically (or falls back gracefully if capture fails)
  3. The form collects subject, description, and browser/OS metadata; the reporter sees a success or failure confirmation after submission
  4. Throwing an exception inside the widget or simulating a network failure does not break or alter the host page in any way
  5. Multiple screenshots can be attached per report via file upload or Ctrl+V paste
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Scaffold widget package, Vite IIFE config, shared TypeScript types, and metadata collection
- [x] 01-02-PLAN.md — Core widget: Shadow DOM init, floating button, form UI, screenshot capture, upload/paste handler
- [x] 01-03-PLAN.md — FormData submission module, production build, and browser verification checkpoint

### Phase 2: Backend + Triage
**Goal**: Bug reports submitted by the widget are triaged by AI before any GitHub issue is created — spam is silently discarded, valid/uncertain reports become properly labeled GitHub issues in the correct project repo
**Depends on**: Phase 1
**Requirements**: BACK-01, BACK-02, BACK-03, BACK-04, BACK-05, BACK-06, BACK-07, BACK-08, TRIA-01, TRIA-02, TRIA-03, TRIA-04
**Success Criteria** (what must be TRUE):
  1. Submitting a clear spam report results in no GitHub issue created and a 200 returned to the widget
  2. Submitting a legitimate bug report creates a GitHub issue in the correct project repo with screenshot URLs, triage labels (auto-fix/review), and browser metadata
  3. Submitting more than 10 reports from the same IP within one hour results in 429 responses for excess requests
  4. A GitHub webhook event with an invalid or missing HMAC signature is rejected before any processing occurs
  5. Inspecting the browser network tab shows zero requests to api.github.com — all GitHub API calls originate from the Railway service
  6. The Railway service restarts automatically and stays always-on; health check returns 200
**Cross-phase contracts**:
  - Widget POSTs to `/report` with `{ projectId, subject, description, url, screenshots[], metadata }` — returns `{ success: boolean, message: string }`
  - Webhook handler verifies HMAC signature and responds 200; routing logic (fix plan, Telegram) added in Phase 3/4 via registered event callbacks
  - `PendingApproval { issueId, repo, triageResult, reportData }` interface defined here, consumed by Phase 4
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — Scaffold backend package, Express 5 app factory, shared TypeScript types, project config, health endpoint
- [x] 02-02-PLAN.md — ImgBB upload service, Anthropic AI triage service, GitHub issue creation service
- [x] 02-03-PLAN.md — POST /report route handler, rate limiting, webhook HMAC middleware, full app wiring
- [x] 02-04-PLAN.md — Gap closure: Railway deployment config (railway.toml) for BACK-07

### Phase 3: Ralph Integration
**Goal**: GitHub webhook events for auto-fix issues trigger fix_plan.md generation and Ralph execution via a local relay server; triage decisions are logged; the pipeline is idempotent
**Depends on**: Phase 2
**Requirements**: TRIA-05, RALF-01, RALF-02, RALF-03, RALF-04, RALF-05, RALF-06, RALF-07
**Precondition**: Verify Ralph's --monitor behavior and fix_plan.md format from Ralph source code before implementation
**Success Criteria** (what must be TRUE):
  1. A GitHub issue with `auto-fix` label triggers fix_plan.md generation and Ralph picks it up within seconds
  2. Submitting the same webhook event twice (simulating GitHub retry) produces exactly one fix_plan.md write — not two
  3. All triage decisions are written to a log with confidence score, lane assignment, and model reasoning
  4. The local relay server is reachable from Railway via Cloudflare Tunnel and writes fix_plan.md to the correct project path
  5. The relay server rejects requests without a valid shared secret
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — Backend triage logging (TRIA-05), relay notification service, webhook handler registration
- [ ] 03-02-PLAN.md — Relay server package: scaffold, auth, dedup, queue, fix_plan.md writer, POST /fix route
- [ ] 03-03-PLAN.md — Cloudflare Tunnel config, env documentation, end-to-end verification checkpoint

### Phase 4: Telegram
**Goal**: When triage assigns a bug to the review lane, Miro receives a Telegram notification with full context and inline Approve/Reject buttons; approving triggers the fix pipeline; rejecting closes the issue
**Depends on**: Phase 3 (relay server endpoint RALF-02/RALF-03 for Approve path; PendingApproval interface from Phase 2)
**Requirements**: TELE-01, TELE-02, TELE-03, TELE-04, TELE-05, TELE-06
**Success Criteria** (what must be TRUE):
  1. An uncertain-verdict bug report causes a Telegram message to arrive with the bug title, description, screenshot URL, and project name
  2. Tapping Approve triggers fix_plan.md generation and Ralph execution for the corresponding issue
  3. Tapping Reject closes the GitHub issue with a rejection label and no fix_plan.md is written
  4. Tapping Approve or Reject twice (simulating a double-tap or duplicate callback) produces exactly one action — not two
  5. The Telegram bot acknowledges every callback query immediately so the button spinner disappears without delay
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Widget | 3/3 plans | Complete | 2026-03-01 |
| 2. Backend + Triage | 4/4 | Complete | 2026-03-01 |
| 3. Ralph Integration *(v2)* | 1/3 | In Progress | - |
| 4. Telegram *(v2)* | TBD | Deferred | - |
