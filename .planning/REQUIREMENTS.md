# Requirements: Bug Report Pipeline

**Defined:** 2026-03-01
**Core Value:** Bugs reported by users get fixed and deployed automatically without manual developer intervention — closing the loop from report to resolution.

## v1 Requirements

### Widget

- [x] **WIDG-01**: Widget loads via a single `<script>` tag with `data-project-id` attribute
- [x] **WIDG-02**: Widget renders a floating bug report button that does not interfere with host page
- [x] **WIDG-03**: Widget uses Shadow DOM for complete CSS isolation from host page
- [x] **WIDG-04**: Widget captures page screenshot via html-to-image with graceful fallback on failure
- [x] **WIDG-05**: Widget auto-fills current page URL in the report form
- [x] **WIDG-06**: Widget supports multiple screenshots per report (upload + Ctrl+V paste)
- [x] **WIDG-07**: Widget collects subject, description, URL, and browser/OS metadata
- [x] **WIDG-08**: Widget shows submission confirmation (success/failure) to reporter
- [x] **WIDG-09**: Widget fails gracefully — host app is never affected by widget errors

### Backend

- [x] **BACK-01**: Express 5 service receives bug reports at POST /report
- [x] **BACK-02**: Service uploads screenshots to ImgBB and embeds permanent URLs in issue body
- [x] **BACK-03**: Service rate-limits by IP (10 reports/IP/hour minimum)
- [x] **BACK-04**: Service maps project IDs to GitHub repos for correct issue routing
- [x] **BACK-05**: Service creates GitHub issues via Octokit with labels, screenshots, and metadata
- [x] **BACK-06**: Service registers and handles GitHub webhooks with HMAC signature verification
- [x] **BACK-07**: Service deploys to Railway with always-on configuration
- [x] **BACK-08**: Zero GitHub API calls originate from the browser — all through backend proxy

### Triage

- [x] **TRIA-01**: AI triage runs pre-issue — before GitHub issue creation, not after
- [x] **TRIA-02**: Triage produces three-lane output: auto-fix (>0.8), review (0.4-0.8), spam (<0.4)
- [x] **TRIA-03**: Spam reports are discarded without creating a GitHub issue
- [x] **TRIA-04**: Valid and uncertain reports create GitHub issues with triage labels
- [x] **TRIA-05**: All triage decisions are logged with model reasoning

### Ralph Integration

- [x] **RALF-01**: Service generates fix_plan.md in Ralph's expected format for auto-fix verdicts
- [x] **RALF-02**: Local relay server bridges Railway service to local Ralph workspace
- [ ] **RALF-03**: Relay server exposed via Cloudflare Tunnel or ngrok for Railway reachability
- [x] **RALF-04**: Per-project job queue serializes fix_plan.md writes (no race conditions)
- [x] **RALF-05**: Issue-ID-based deduplication prevents duplicate fix_plan.md writes from webhook retries
- [x] **RALF-06**: Ralph detects fix_plan.md change and executes fix → commit → push → auto-deploy (precondition — verify Ralph --monitor behavior before implementation)
- [x] **RALF-07**: Relay server validates a shared secret from Railway before processing any request

### Telegram

- [ ] **TELE-01**: Bot sends triage notifications with bug details for uncertain/risky reports
- [ ] **TELE-02**: Notifications include inline Approve/Reject keyboard buttons
- [ ] **TELE-03**: Approve triggers fix_plan.md generation and Ralph execution
- [ ] **TELE-04**: Reject closes the GitHub issue with a rejection label
- [ ] **TELE-05**: Callback queries are acknowledged immediately via answerCallbackQuery
- [ ] **TELE-06**: Duplicate callbacks are deduplicated by update_id

## v2 Requirements

### Widget Enhancements

- **WIDG-10**: Console log capture via window.onerror buffering (enhances AI triage accuracy)
- **WIDG-11**: Screenshot preview before submission with retake option
- **WIDG-12**: Widget UX polish — animations, branding customization

### Pipeline Enhancements

- **PIPE-01**: Duplicate bug detection via GitHub Issues search API before creating new issue
- **PIPE-02**: Per-project Telegram channel routing (v1 uses single channel)
- **PIPE-03**: Redis-backed persistent state for pending approvals (survives Railway restarts)
- **PIPE-04**: Audit trail logging: report_id → issue_id → triage_decision → fix_plan → ralph_run → deploy_sha
- **PIPE-05**: Optional reporter email for follow-up notifications

## Out of Scope

| Feature | Reason |
|---------|--------|
| Screenshot annotation in widget | Complexity vs. value — description field is sufficient |
| Session replay | Privacy concerns + massive payload size |
| User accounts for reporters | Fully anonymous by design |
| Custom bug tracking dashboard | GitHub Issues is the UI |
| Multi-tenant support | Single workspace (kwaczek/) only |
| Mobile native app | Web widget only |
| Severity selection by reporter | AI triage determines severity, not users |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WIDG-01 | Phase 1 | Complete |
| WIDG-02 | Phase 1 | Complete |
| WIDG-03 | Phase 1 | Complete |
| WIDG-04 | Phase 1 | Complete |
| WIDG-05 | Phase 1 | Complete |
| WIDG-06 | Phase 1 | Complete |
| WIDG-07 | Phase 1 | Complete |
| WIDG-08 | Phase 1 | Complete |
| WIDG-09 | Phase 1 | Complete |
| BACK-01 | Phase 2 | Complete (02-01) |
| BACK-02 | Phase 2 | Complete |
| BACK-03 | Phase 2 | Complete |
| BACK-04 | Phase 2 | Complete (02-01) |
| BACK-05 | Phase 2 | Complete |
| BACK-06 | Phase 2 | Complete |
| BACK-07 | Phase 2 | Complete (02-01) |
| BACK-08 | Phase 2 | Complete (02-01) |
| TRIA-01 | Phase 2 | Complete |
| TRIA-02 | Phase 2 | Complete |
| TRIA-03 | Phase 2 | Complete |
| TRIA-04 | Phase 2 | Complete |
| TRIA-05 | Phase 3 | Complete (03-01) |
| RALF-01 | Phase 3 | Complete |
| RALF-02 | Phase 3 | Complete |
| RALF-03 | Phase 3 | Pending |
| RALF-04 | Phase 3 | Complete |
| RALF-05 | Phase 3 | Complete |
| RALF-06 | Phase 3 | Complete |
| RALF-07 | Phase 3 | Complete |
| TELE-01 | Phase 4 | Pending |
| TELE-02 | Phase 4 | Pending |
| TELE-03 | Phase 4 | Pending |
| TELE-04 | Phase 4 | Pending |
| TELE-05 | Phase 4 | Pending |
| TELE-06 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-02 after 03-01 execution (TRIA-05 complete)*
