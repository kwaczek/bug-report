# Requirements: Bug Report Pipeline

**Defined:** 2026-03-01
**Core Value:** Bugs reported by users get fixed and deployed automatically without manual developer intervention — closing the loop from report to resolution.

## v1 Requirements

### Widget

- [ ] **WIDG-01**: Widget loads via a single `<script>` tag with `data-project-id` attribute
- [ ] **WIDG-02**: Widget renders a floating bug report button that does not interfere with host page
- [ ] **WIDG-03**: Widget uses Shadow DOM for complete CSS isolation from host page
- [ ] **WIDG-04**: Widget captures page screenshot via html-to-image with graceful fallback on failure
- [ ] **WIDG-05**: Widget auto-fills current page URL in the report form
- [ ] **WIDG-06**: Widget supports multiple screenshots per report (upload + Ctrl+V paste)
- [ ] **WIDG-07**: Widget collects subject, description, URL, and browser/OS metadata
- [ ] **WIDG-08**: Widget shows submission confirmation (success/failure) to reporter
- [ ] **WIDG-09**: Widget fails gracefully — host app is never affected by widget errors

### Backend

- [ ] **BACK-01**: Express 5 service receives bug reports at POST /report
- [ ] **BACK-02**: Service uploads screenshots to ImgBB and embeds permanent URLs in issue body
- [ ] **BACK-03**: Service rate-limits by IP (10 reports/IP/hour minimum)
- [ ] **BACK-04**: Service maps project IDs to GitHub repos for correct issue routing
- [ ] **BACK-05**: Service creates GitHub issues via Octokit with labels, screenshots, and metadata
- [ ] **BACK-06**: Service registers and handles GitHub webhooks with HMAC signature verification
- [ ] **BACK-07**: Service deploys to Railway with always-on configuration
- [ ] **BACK-08**: Zero GitHub API calls originate from the browser — all through backend proxy

### Triage

- [ ] **TRIA-01**: AI triage runs pre-issue — before GitHub issue creation, not after
- [ ] **TRIA-02**: Triage produces three-lane output: auto-fix (>0.8), review (0.4-0.8), spam (<0.4)
- [ ] **TRIA-03**: Spam reports are discarded without creating a GitHub issue
- [ ] **TRIA-04**: Valid and uncertain reports create GitHub issues with triage labels
- [ ] **TRIA-05**: All triage decisions are logged with model reasoning

### Ralph Integration

- [ ] **RALF-01**: Service generates fix_plan.md in Ralph's expected format for auto-fix verdicts
- [ ] **RALF-02**: Local relay server bridges Railway service to local Ralph workspace
- [ ] **RALF-03**: Relay server exposed via Cloudflare Tunnel or ngrok for Railway reachability
- [ ] **RALF-04**: Per-project job queue serializes fix_plan.md writes (no race conditions)
- [ ] **RALF-05**: Issue-ID-based deduplication prevents duplicate fix_plan.md writes from webhook retries
- [ ] **RALF-06**: Ralph detects fix_plan.md change and executes fix → commit → push → auto-deploy

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
| WIDG-01 | Phase 1 | Pending |
| WIDG-02 | Phase 1 | Pending |
| WIDG-03 | Phase 1 | Pending |
| WIDG-04 | Phase 1 | Pending |
| WIDG-05 | Phase 1 | Pending |
| WIDG-06 | Phase 1 | Pending |
| WIDG-07 | Phase 1 | Pending |
| WIDG-08 | Phase 1 | Pending |
| WIDG-09 | Phase 1 | Pending |
| BACK-01 | Phase 2 | Pending |
| BACK-02 | Phase 2 | Pending |
| BACK-03 | Phase 2 | Pending |
| BACK-04 | Phase 2 | Pending |
| BACK-05 | Phase 2 | Pending |
| BACK-06 | Phase 2 | Pending |
| BACK-07 | Phase 2 | Pending |
| BACK-08 | Phase 2 | Pending |
| TRIA-01 | Phase 3 | Pending |
| TRIA-02 | Phase 3 | Pending |
| TRIA-03 | Phase 3 | Pending |
| TRIA-04 | Phase 3 | Pending |
| TRIA-05 | Phase 3 | Pending |
| RALF-01 | Phase 3 | Pending |
| RALF-02 | Phase 3 | Pending |
| RALF-03 | Phase 3 | Pending |
| RALF-04 | Phase 3 | Pending |
| RALF-05 | Phase 3 | Pending |
| RALF-06 | Phase 3 | Pending |
| TELE-01 | Phase 4 | Pending |
| TELE-02 | Phase 4 | Pending |
| TELE-03 | Phase 4 | Pending |
| TELE-04 | Phase 4 | Pending |
| TELE-05 | Phase 4 | Pending |
| TELE-06 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after initial definition*
