# Bug Report Pipeline

## What This Is

An automated bug-to-fix pipeline for Ralph-managed projects. A lightweight embeddable widget lets users and developers report bugs with screenshots directly from any live project. Reports flow through a centralized service that creates GitHub issues, triages them with AI, and triggers Ralph to automatically fix and deploy — with Telegram-based human oversight for uncertain cases.

## Core Value

Bugs reported by users get fixed and deployed automatically without manual developer intervention — closing the loop from report to resolution.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Embeddable bug report widget (script tag) with screenshot support, auto-filled URL
- [ ] Centralized backend service that receives reports and creates GitHub issues
- [ ] GitHub webhook listener that triggers the fix pipeline on new issues
- [ ] AI-powered triage that assesses bug validity and risk
- [ ] Automatic fix_plan.md generation and Ralph execution for confirmed bugs
- [ ] Telegram bot for notification and approve/reject of uncertain bugs
- [ ] Auto-deploy after successful fix (via existing CI/CD)
- [ ] Rate limiting for spam protection

### Out of Scope

- Mobile app — web widget only
- User accounts/login for reporters — fully anonymous
- Custom dashboards for bug tracking — GitHub Issues is the UI
- Manual bug assignment — AI triage handles routing
- Multi-language support — Czech where user-facing, English for technical

## Context

- Ralph workspace at `/Users/miro/Workspace/PERSONAL/ralph-workspace` with projects in `projects/`
- Live projects: rohlik-web (Railway), takticke-clovece (Railway), houbar (Vercel), hry-portal (Vercel + Railway)
- All projects push to GitHub under kwaczek/ organization
- Ralph reads fix_plan.md to know what to work on — the pipeline needs to write to this file
- GitHub API requires authentication — the service uses Miro's GitHub token to create issues on behalf of anonymous reporters
- Screenshots need storage — GitHub's own image hosting (via API) is the cheapest option (free)
- Existing CI/CD on projects handles deployment after push to main

## Constraints

- **Budget**: Free or near-free services only — Railway for hosting (already used)
- **Integration**: Must work as a simple `<script>` tag drop-in, no framework dependency
- **GitHub**: All issues created under the correct project repo with proper labels
- **Privacy**: No user data collected beyond the bug report itself
- **Reliability**: If the service is down, bug reports should fail gracefully (not break the host app)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Script tag widget (not NPM) | Zero integration effort per project, works with any framework | — Pending |
| Centralized service (not per-project) | One service for all projects, simpler to maintain | — Pending |
| GitHub Issues as source of truth | Already used for all projects, no new DB needed | — Pending |
| GitHub webhooks (not polling) | Instant reaction to new issues, no wasted API calls | — Pending |
| AI triage before fix | Prevents wasting Ralph cycles on spam/invalid reports | — Pending |
| Telegram for human-in-the-loop | Quick approve/reject from phone, no need to open laptop | — Pending |
| Auto-deploy after fix | Full automation — report → fix → deploy without human touch | — Pending |
| Railway for hosting | Consistent with existing infrastructure, already paid | — Pending |

---
*Last updated: 2026-03-01 after initialization*
