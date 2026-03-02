# Bug Report Pipeline

## What This Is

An automated bug-to-fix pipeline for Ralph-managed projects. An embeddable widget (22KB script tag) lets users report bugs with screenshots from any live project. Reports flow through a centralized Railway backend that triages spam, creates GitHub issues with labels and metadata, and notifies a local relay server. The relay spawns Claude Code to describe the bug, writes fix_plan.md, and launches Ralph for autonomous fix-commit-push-deploy.

## Core Value

Bugs reported by users get fixed and deployed automatically without manual developer intervention — closing the loop from report to resolution.

## Current State

**Shipped:** v1.0 (2026-03-02)
**Stack:** TypeScript, Express 5, Vite, Octokit, Zod
**LOC:** 2,346 across widget/, backend/, relay/
**Deployment:** Backend on Railway, relay runs locally via Cloudflare Tunnel

**What's working:**
- Widget → Backend → GitHub Issue → Relay → Claude → fix_plan.md → Ralph (full E2E)
- Spam filtering (local, cost-free)
- Screenshot capture and ImgBB hosting
- Webhook dedup and per-project queue serialization
- Auto-fix label → autonomous fix pipeline

**Known gaps (accepted as tech debt):**
- Review lane dormant (triage only produces auto-fix/spam, not review)
- RELAY_URL must include /fix path suffix (documented but no code guard)
- 11 human verification items pending (browser rendering + live credential tests)

## Requirements

### Validated

- ✓ Embeddable bug report widget (script tag) with screenshot support, auto-filled URL — v1.0
- ✓ Centralized backend service that receives reports and creates GitHub issues — v1.0
- ✓ GitHub webhook listener that triggers the fix pipeline on new issues — v1.0
- ✓ AI-powered triage that assesses bug validity and risk — v1.0
- ✓ Automatic fix_plan.md generation and Ralph execution for confirmed bugs — v1.0
- ✓ Rate limiting for spam protection — v1.0
- ✓ Auto-deploy after successful fix (via existing CI/CD) — v1.0

### Active

- [ ] Telegram bot for notification and approve/reject of uncertain bugs
- [ ] Three-lane triage reactivation (review lane currently dormant)

### Out of Scope

- Mobile app — web widget only
- User accounts/login for reporters — fully anonymous
- Custom dashboards for bug tracking — GitHub Issues is the UI
- Manual bug assignment — AI triage handles routing
- Multi-language support — Czech where user-facing, English for technical
- Screenshot annotation in widget — description field is sufficient
- Session replay — privacy concerns + massive payload size

## Context

- Ralph workspace at `/Users/miro/Workspace/PERSONAL/ralph-workspace` with projects in `projects/`
- Live projects: rohlik-web (Railway), takticke-clovece (Railway), houbar (Vercel), hry-portal (Vercel + Railway)
- All projects push to GitHub under kwaczek/ organization
- Backend deployed on Railway with always-on config and health check
- Relay exposed via Cloudflare Tunnel at relay.botur.fun
- E2E verified with houbar issue #2 during Phase 3 development

## Constraints

- **Budget**: Free or near-free services only — Railway for hosting (already used), ImgBB free tier for screenshots
- **Integration**: Must work as a simple `<script>` tag drop-in, no framework dependency
- **GitHub**: All issues created under the correct project repo with proper labels
- **Privacy**: No user data collected beyond the bug report itself
- **Reliability**: If the service is down, bug reports fail gracefully (widget never breaks host app)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Script tag widget (not NPM) | Zero integration effort per project, works with any framework | ✓ Good — 22KB IIFE bundle, one line to embed |
| Shadow DOM for CSS isolation | Complete style isolation from host page | ✓ Good — zero conflicts with Bootstrap, Tailwind, etc. |
| Centralized service (not per-project) | One service for all projects, simpler to maintain | ✓ Good — PROJECT_MAP env var routes to correct repos |
| GitHub Issues as source of truth | Already used for all projects, no new DB needed | ✓ Good — labels enable automation |
| Pre-issue AI triage | Prevents wasting Ralph cycles on spam/invalid reports | ✓ Good — replaced with local spam filter (cost-free) |
| ImgBB for screenshot hosting | Simpler than GitHub Contents API, fewer token scopes | ✓ Good — permanent URLs, free tier sufficient |
| Express 5 with ESM | Modern Node.js, native async error propagation | ✓ Good — clean async/await throughout |
| Local relay (not cloud) | Ralph runs locally, fix_plan.md is a local file | ✓ Good — Cloudflare Tunnel bridges the gap |
| Claude Code for bug description | Multimodal (reads screenshots), understands codebase context | ✓ Good — better descriptions than templates |
| Local spam filter over Anthropic API | Cost-free, instant, no API key dependency for triage | ✓ Good — simple length check catches obvious spam |
| Telegram for human-in-the-loop | Quick approve/reject from phone, no need to open laptop | — Pending (Phase 4) |
| Railway for hosting | Consistent with existing infrastructure, already paid | ✓ Good — always-on with health check |

---
*Last updated: 2026-03-02 after v1.0 milestone*
