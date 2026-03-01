# Roadmap: Bug Report Pipeline

## Overview

Four phases deliver a fully automated bug-to-fix pipeline. The widget ships first — it has zero external dependencies and can be verified in isolation. The backend lands next, establishing the secure intake layer that all downstream components depend on. Phase 3 combines AI triage with Ralph integration, completing the automated fix loop (the core value of the project). Phase 4 adds the Telegram human-in-the-loop for uncertain cases, rounding out all three routing lanes. Every v1 requirement lands in exactly one phase; nothing is deferred.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Widget** - Embeddable script-tag widget with screenshot capture, Shadow DOM isolation, and graceful failure
- [ ] **Phase 2: Backend** - Express 5 service on Railway that receives reports, rate-limits, stores screenshots, and creates GitHub issues
- [ ] **Phase 3: Triage + Ralph** - Pre-issue AI triage with three-lane routing and local relay server that triggers Ralph for auto-fix verdicts
- [ ] **Phase 4: Telegram** - Human-in-the-loop approve/reject flow for uncertain triage verdicts

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
**Plans**: TBD

### Phase 2: Backend
**Goal**: Bug reports submitted by the widget arrive at a secure, rate-limited Railway service that creates properly labeled GitHub issues in the correct project repo
**Depends on**: Phase 1
**Requirements**: BACK-01, BACK-02, BACK-03, BACK-04, BACK-05, BACK-06, BACK-07, BACK-08
**Success Criteria** (what must be TRUE):
  1. A report submitted via the widget appears as a GitHub issue in the correct project repo with screenshot URLs, labels, and browser metadata embedded in the issue body
  2. Submitting more than 10 reports from the same IP within one hour results in 429 responses for all excess requests
  3. A GitHub webhook event with an invalid or missing HMAC signature is rejected before any processing occurs
  4. Inspecting the browser network tab shows zero requests to api.github.com — all GitHub API calls originate from the Railway service
  5. The Railway service restarts automatically and stays always-on; health check returns 200
**Plans**: TBD

### Phase 3: Triage + Ralph
**Goal**: Valid bug reports trigger automatic fix_plan.md generation and Ralph execution; spam reports are silently discarded before a GitHub issue is ever created; uncertain reports are held for human review
**Depends on**: Phase 2
**Requirements**: TRIA-01, TRIA-02, TRIA-03, TRIA-04, TRIA-05, RALF-01, RALF-02, RALF-03, RALF-04, RALF-05, RALF-06
**Success Criteria** (what must be TRUE):
  1. Submitting a clear spam report (gibberish text, no URL context) results in no GitHub issue created and a 200 returned to the widget
  2. Submitting a legitimate high-confidence bug report results in a GitHub issue with an `auto-fix` label and Ralph picking up a freshly written fix_plan.md within seconds
  3. Submitting the same webhook event twice (simulating GitHub retry) produces exactly one fix_plan.md write — not two
  4. All triage decisions are written to a log with confidence score, lane assignment, and model reasoning
  5. The local relay server is reachable from Railway via Cloudflare Tunnel and writes fix_plan.md to the correct project path on the local machine
**Plans**: TBD

### Phase 4: Telegram
**Goal**: When triage assigns a bug to the review lane, Miro receives a Telegram notification with full context and inline Approve/Reject buttons; approving triggers the fix pipeline; rejecting closes the issue
**Depends on**: Phase 3
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
| 1. Widget | TBD | Not started | - |
| 2. Backend | TBD | Not started | - |
| 3. Triage + Ralph | TBD | Not started | - |
| 4. Telegram | TBD | Not started | - |
