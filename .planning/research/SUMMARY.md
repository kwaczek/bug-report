# Project Research Summary

**Project:** Bug Report Pipeline
**Domain:** Embeddable bug-reporting widget + AI triage + automated fix pipeline via Ralph
**Researched:** 2026-03-01
**Confidence:** MEDIUM-HIGH (widget and backend HIGH; Ralph bridge and AI triage MEDIUM)

---

## Executive Summary

This project is a two-part system: an embeddable vanilla-JS widget injected via `<script>` tag into any of Miro's existing projects, and a centralized Node.js service on Railway that receives reports, triages them with AI, and either queues an automated fix via Ralph or routes them to Miro for manual approval via Telegram. The well-understood pattern here is "intake widget + centralized processor + GitHub as source of truth" — the same model used by Sentry, Marker.io, and Gleap, extended with an automated fix loop that is unique to this project. The consensus across all four research areas is to use a single Railway service for all projects (not one per project), use Express 5 + Octokit for the backend, and build the widget as a Vite IIFE bundle with Shadow DOM isolation.

The most consequential architectural decision is when AI triage runs relative to GitHub issue creation. FEATURES.md strongly recommends pre-issue triage (triage before creating the issue, to avoid polluting the repo with spam) but ARCHITECTURE.md's default data flow shows post-issue triage triggered by a GitHub webhook. The recommended resolution is **pre-issue triage with conditional issue creation**: run the AI before creating the GitHub issue, create the issue only for valid/uncertain reports, then use the issue webhook to trigger downstream work. This preserves the GitHub audit trail for real bugs while keeping the repo clean.

The second unresolved conflict is image hosting: STACK.md recommends ImgBB (simpler, no GitHub dependency) while ARCHITECTURE.md recommends a dedicated `kwaczek/bug-assets` GitHub repository via the Contents API (free, keeps everything in GitHub). Both work. **Recommendation: use ImgBB for the MVP** — it requires fewer GitHub token scopes, has no repo growth management overhead, and is easier to swap out later. If keeping everything in GitHub matters, switch to the Contents API approach in v1.x. The third conflict — Telegram library choice (STACK.md recommends `telegraf`, ARCHITECTURE.md recommends `grammY`) — is resolved by the code examples: **use `telegraf`** as it has better TypeScript types and is actively maintained as of 2026-03-01.

---

## Key Findings

### Recommended Stack

The backend is Node.js 22 LTS + Express 5.2.1, running on Railway with Telegraf for the Telegram bot, Octokit for GitHub, and Multer v2 + Sharp for screenshot handling. Express 5 became the npm default in March 2025 and its async error handling eliminates significant boilerplate. Multer v1 has active CVEs (CVE-2025-47944) — v2 is mandatory. The widget is built with Vite 7 in IIFE library mode, producing a single self-contained JS file suitable for `<script>` tag injection. AI triage uses GPT-4o-mini at approximately $0.001 per call — cost is not a concern.

**Core technologies:**
- Node.js 22 LTS + Express 5.2.1: backend runtime — async error handling built-in, current LTS, Railway auto-detects
- Vite 7 IIFE format: widget bundler — single self-contained file, no Webpack config overhead
- Vanilla JS/TypeScript: widget code — zero runtime dependency in injected bundle
- `@octokit/rest` 21.x: GitHub API — typed, handles auth and retries
- `@octokit/webhooks` latest: webhook HMAC verification — official, timing-safe comparison
- `telegraf` 4.16.3: Telegram bot — TypeScript-first, webhook integration with Express
- `multer` 2.1.0: multipart form handling — CVE fixes in v2, memory storage for direct ImgBB upload
- `sharp` 0.34.5: screenshot compression — pre-built binaries on Railway, no compile step
- `html-to-image` 1.11.13: widget screenshot capture — 3x faster than html2canvas, maintained
- `express-rate-limit` 8.2.1: spam protection — 10 reports/IP/hour minimum
- ImgBB API: screenshot hosting — free tier, 32MB limit, permanent URLs (MVP choice)

**Critical version notes:**
- `multer` must be v2.1.0+ — v1.x has active security CVEs
- Express 5 requires Node.js 18+; Node 22 LTS recommended
- `@octokit/rest` is ESM-first — use `import`, not `require`

**What NOT to use:**
- GitHub native image upload to issues (no REST API endpoint — confirmed by community)
- Base64 images inline in GitHub issue body (stripped by GitHub's markdown renderer)
- `dom-to-image` (abandoned, breaks on modern CSS)
- Telegraf with long polling (webhooks preferred; if Telegraf's `createWebhook()` adds complexity, fall back to long polling only on Railway where always-on is configured)

---

### Expected Features

The widget must do three things without being asked: capture a screenshot, capture the page URL, and capture browser/OS metadata. These are table stakes — every competing tool includes them and users will not trust a report without visual proof. The backend must create a GitHub issue per validated report in the correct project repo. Rate limiting is not optional — any public endpoint without it will be exploited within days.

**Must have (v1 table stakes):**
- Embeddable widget via `<script>` tag with `data-project-id` — zero-install entry point
- Screenshot capture (`html-to-image`) with graceful fallback if capture fails
- Auto-captured metadata: page URL, browser/OS, screen dimensions
- Free-text description field (required) with "what were you doing?" prompt
- Rate limiting: IP-based, server-side only — 10 reports/IP/hour
- GitHub issue creation in correct project repo via per-project routing
- AI triage: spam detection + validity + risk scoring in a single LLM call, pre-issue
- `fix_plan.md` auto-generation for high-confidence, low-risk bugs
- Telegram approval flow for uncertain/risky bugs
- Graceful widget failure: host app must never be affected by widget errors
- Submission confirmation: success/failure state visible to reporter

**Should have (v1 differentiators):**
- Console log capture via `window.onerror` buffering (enhances AI triage accuracy)
- Duplicate detection via GitHub Issues search API (reduces issue noise)
- Screenshot preview before submission with retake option

**Defer to v1.x after validation:**
- Per-project Telegram channel routing (start with one channel)
- Widget UX polish: animations, branding customization
- Duplicate detection (premature optimization until issue volume grows)

**Defer to v2+:**
- Optional reporter email for follow-up notifications
- Session replay (anti-feature: privacy concerns, payload size)
- Screenshot annotation in-widget (anti-feature: complexity vs value)
- Multi-tenant support (out of scope per PROJECT.md)

---

### Architecture Approach

The system uses a single centralized Railway service as the hub for all projects. The widget submits to `/report`, the service runs AI triage pre-issue, creates a GitHub issue only for valid/uncertain reports, and uses the GitHub `issues.opened` webhook to trigger downstream processing (fix plan generation or Telegram approval). GitHub Issues is the canonical audit trail. Ralph runs locally and is reached via a local relay server that accepts authenticated POST requests from the Railway service — this is a small but required component (~50 lines) that bridges the Railway/local boundary.

**Major components:**

1. **Widget (browser, Vite IIFE)** — captures report data + screenshot, POSTs to service, shows confirmation; must use Shadow DOM open mode for CSS isolation; never touches GitHub API directly
2. **HTTP Server (Express 5, Railway)** — receives `/report`, `/webhook/github`, `/webhook/telegram`; validates signatures; rate limits; responds fast, processes async
3. **Pipeline Orchestrator (service layer)** — runs pre-issue AI triage, routes to auto-fix, human review, or spam discard; manages `pendingApprovals` in-memory map
4. **AI Triage Service** — single GPT-4o-mini call with structured output; three-lane output: `auto-fix` (confidence > 0.8), `review` (0.4–0.8), `spam` (< 0.4 with multiple spam signals); logs all decisions
5. **GitHub Integration (Octokit)** — creates issues with labels + screenshot URL; verifies webhook signatures via `@octokit/webhooks`; scoped PAT per role
6. **Telegram Bot (Telegraf)** — sends triage notifications with inline approve/reject keyboard; handles callback queries with immediate `answerCallbackQuery`; deduplicates by callback ID
7. **Local Relay Server (~50 lines)** — runs on Miro's machine, exposed via Cloudflare Tunnel or ngrok; accepts authenticated POST from Railway; writes `fix_plan.md` to correct project path; Ralph detects file change and executes
8. **Screenshot Storage (ImgBB)** — backend uploads compressed JPEG to ImgBB API; permanent URL embedded as markdown in issue body

**Key patterns to follow:**
- Respond 200 immediately on webhook receipt, process all heavy work async — GitHub retries after 10s timeout
- GitHub issue as the event bus: widget → service → GitHub issue → webhook → pipeline (not widget → pipeline directly)
- Filter webhooks to `issues.opened` only — all other events cause duplicate firing
- Implement idempotency by issue ID before writing `fix_plan.md`

---

### Critical Pitfalls

1. **Widget CSS leaks in both directions** — Use Shadow DOM `attachShadow({ mode: 'open' })` from day one; retrofitting Shadow DOM after the widget is built is expensive; test on Bootstrap and Tailwind pages in Phase 1

2. **GitHub token in client-side code** — All GitHub API calls go through the backend; the widget only knows the service URL and a public project slug; verify with DevTools network tab that zero calls go to `api.github.com` from the browser

3. **Unverified GitHub webhooks** — Verify `X-Hub-Signature-256` using `@octokit/webhooks` (handles timing-safe comparison) before any processing; read raw body before JSON parsing; reject payloads older than 5 minutes

4. **fix_plan.md race condition** — Implement a per-project job queue (even a simple in-memory queue) to serialize writes; `fs.writeFile` directly from concurrent webhook handlers causes silent data loss

5. **AI auto-rejecting real bugs** — Use three lanes (auto-fix / review / spam), not two; keep the auto-reject lane narrow — require multiple spam signals; prefer unnecessary human review over missed real bugs; log all triage decisions with model reasoning

6. **Duplicate webhook firing** — Filter to `issues.opened` event; implement issue-ID-based deduplication before writing fix_plan.md; same issue event delivered twice must produce exactly one job

7. **Telegram callback buttons expire or fire twice** — Call `answerCallbackQuery` immediately on receipt before any async work; deduplicate by `update_id` in short-lived cache

---

## Conflicts Identified and Resolutions

### Conflict 1: When Does AI Triage Run? (Pre-issue vs. Post-issue)

| Researcher | Position |
|------------|----------|
| FEATURES.md | Pre-issue triage strongly preferred — create GitHub issue only after AI says it's worth keeping |
| ARCHITECTURE.md | Data flow shows post-issue triage triggered by GitHub `issues.opened` webhook |

**Resolution (RECOMMENDED): Pre-issue triage with conditional issue creation.**

Run AI triage synchronously during the `/report` handler (before GitHub API call), use the result to decide whether to create the issue, then let the webhook trigger downstream work (fix plan generation, Telegram notification) for any issue that gets created. This hybrid approach satisfies both concerns: the repo stays clean (no spam issues), and the GitHub issue remains the canonical record for all legitimate bugs.

The flow becomes:
```
Widget POST → rate limit check → AI pre-triage
  → spam: discard, return 200 to widget, done
  → valid/uncertain: create GitHub issue → GitHub fires webhook → fix plan / Telegram
```

The webhook is still the trigger for Ralph and Telegram — the only change is that the issue never gets created for spam.

---

### Conflict 2: Image Hosting (ImgBB vs. GitHub bug-assets repo)

| Researcher | Position |
|------------|----------|
| STACK.md | ImgBB — simpler, no GitHub scope dependency, no repo growth management |
| ARCHITECTURE.md | GitHub `kwaczek/bug-assets` repo via Contents API — free, keeps everything in GitHub ecosystem |

**Resolution (RECOMMENDED): Use ImgBB for MVP.**

ImgBB requires a single free API key and no additional GitHub token scopes. The GitHub Contents API approach requires `contents:write` on a separate repo and adds repo growth management overhead over time. Both produce permanent URLs embeddable in issue markdown. Switch to GitHub if staying fully within the GitHub ecosystem becomes a priority in v1.x.

---

### Conflict 3: Telegram Library (Telegraf vs. grammY)

| Researcher | Position |
|------------|----------|
| STACK.md | `telegraf` 4.16.3 — better TypeScript types, more active development |
| ARCHITECTURE.md | `grammY` — examples shown in grammY syntax |

**Resolution (RECOMMENDED): Use `telegraf`.**

STACK.md explicitly compared the two and chose Telegraf based on TypeScript quality and maintenance activity as of 2026-03-01. The ARCHITECTURE.md examples can be ported to Telegraf syntax straightforwardly. The `bot.createWebhook()` method in Telegraf attaches cleanly to the existing Express app.

---

## Implications for Roadmap

Based on the architectural dependency chain, four phases emerge naturally. The dependency order is strict: you cannot test the backend without a widget, you cannot test triage without a backend, and you cannot test Ralph integration without triage.

### Phase 1: Widget Foundation
**Rationale:** Everything depends on a working widget. This phase has no external dependencies — only browser APIs and a build tool. Shadow DOM must be established here; retrofitting it later is expensive. This phase is entirely self-contained and verifiable without any backend.
**Delivers:** A working embeddable widget that captures screenshots, metadata, and description; bundles as a self-contained IIFE; isolates styles via Shadow DOM; fails gracefully
**Features addressed:** Script-tag embed, screenshot capture, auto-captured metadata, free-text description, graceful failure, submission confirmation (stub)
**Pitfalls to avoid:** CSS leaks (Shadow DOM from day one), widget crashing host app (try/catch wrapper), screenshot size (Sharp compression, JPEG 80%), html-to-image failure fallback
**Stack:** Vite 7 IIFE, TypeScript, html-to-image, Shadow DOM
**Research flag:** Standard patterns — skip research-phase

### Phase 2: Backend Service + GitHub Integration
**Rationale:** The backend is the dependency for every downstream component. Rate limiting, webhook verification, and GitHub issue creation must be in place before AI triage can be tested end-to-end. Security requirements (token isolation, HMAC verification, rate limiting) cannot be deferred.
**Delivers:** Express 5 service on Railway that receives widget reports, rate-limits by IP, creates GitHub issues in the correct repo, registers webhooks per project, and verifies webhook signatures
**Features addressed:** Per-project routing (projectId → repo mapping), GitHub issue creation, rate limiting, webhook signature verification, Railway always-on configuration
**Pitfalls to avoid:** GitHub token in client code, unverified webhooks, spam flood exhausting GitHub API rate limit, Railway cold starts
**Stack:** Express 5, @octokit/rest, @octokit/webhooks, express-rate-limit, helmet, multer v2, sharp, ImgBB API
**Research flag:** Standard patterns for Express + Octokit. Railway deployment may benefit from a quick research-phase pass if environment configuration is unclear.

### Phase 3: AI Triage + fix_plan.md Generation
**Rationale:** Triage is the core value proposition. It runs as a pre-issue step (conflict resolution above), meaning the report handler must call the AI before deciding to create the GitHub issue. Ralph integration via the local relay server is the novel/risky component — the relay server pattern has no external reference.
**Delivers:** Pre-issue AI classification (spam/uncertain/valid), conditional GitHub issue creation, `fix_plan.md` generation for auto-fix verdicts, local relay server that bridges Railway → Ralph, idempotent issue processing
**Features addressed:** AI triage + spam detection, fix_plan.md auto-generation, auto-deploy (no work — existing CI/CD)
**Pitfalls to avoid:** AI auto-rejecting real bugs (three-lane output), fix_plan.md race condition (per-project queue), duplicate webhook firing (issue-ID deduplication), fix_plan.md format drift (validate against schema before writing)
**Stack:** GPT-4o-mini (structured output), in-memory job queue per project, local relay server + Cloudflare Tunnel/ngrok
**Research flag:** NEEDS research-phase — the local relay server + tunnel pattern is project-specific. Ralph's fix_plan.md format and monitoring behavior need to be confirmed from the Ralph source code before implementation.

### Phase 4: Telegram Human-in-the-Loop
**Rationale:** Telegram handles only the "uncertain" triage lane. It can be developed independently once Phase 3 is complete and the three-lane routing exists. The Telegram bot must not be a blocker for the auto-fix lane.
**Delivers:** Telegram notifications for uncertain/risky bugs with inline approve/reject keyboard; callback handling with immediate answerCallbackQuery; deduplication of callbacks; in-memory pendingApprovals map
**Features addressed:** Telegram approve/reject, human oversight for borderline cases, cross-project visibility via notifications
**Pitfalls to avoid:** Callback button expiry (answerCallbackQuery immediately), double-tap approve (deduplicate by update_id), in-memory state lost on restart (document this limitation, add Redis in v1.x if needed)
**Stack:** Telegraf 4.16.3, bot.createWebhook() on Express, in-memory Map for pendingApprovals
**Research flag:** Standard Telegram bot patterns are well-documented. Skip research-phase unless Telegraf webhook integration with Express 5 needs verification.

### Phase 5: Hardening + v1.x Features
**Rationale:** After all four lanes are working end-to-end, polish the security, reliability, and UX gaps. Console log capture and duplicate detection belong here — they are enhancements that require the core pipeline to already be working.
**Delivers:** Console log capture in widget, duplicate detection via GitHub search, audit trail logging, screenshot preview before submission, Redis for persistent pendingApprovals (if Railway restarts cause issues), per-project Telegram channel routing
**Features addressed:** Console log capture (P2), duplicate detection (P2), widget UX polish (P3)
**Pitfalls to avoid:** No audit trail for automated actions (logging chain: report_id → issue_id → triage_decision → fix_plan → ralph_run → deploy_sha)
**Research flag:** Standard patterns — skip research-phase

---

### Phase Ordering Rationale

- **Phase 1 first** because the widget has zero external dependencies and is verifiable in isolation — ship this before touching any infrastructure
- **Phase 2 before Phase 3** because triage needs a working report receiver and GitHub integration to test end-to-end; security requirements (token isolation, rate limiting) cannot be bolted on after triage is working
- **Phase 3 before Phase 4** because Telegram only handles the "uncertain" lane — it depends on Phase 3's three-way routing existing; also, the local relay server is the riskiest component and needs to be proven before adding more moving parts
- **Phase 5 last** because console logs and duplicate detection are enhancements that add noise during core pipeline development

---

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (Ralph Bridge):** The local relay server + Cloudflare Tunnel pattern is novel to this project — no external reference. Need to confirm Ralph's `--monitor` behavior: what file change triggers pickup? Does it watch for `fix_plan.md` creation or modification? What's the format schema? Research Ralph source before writing `ralph.ts`.
- **Phase 3 (AI Triage prompt):** The structured output prompt for three-lane classification needs to be designed carefully. Research GPT-4o-mini structured output JSON mode syntax and test prompt design before implementing.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Widget):** Vite IIFE + Shadow DOM is well-documented. html-to-image has clear API.
- **Phase 2 (Backend + GitHub):** Express 5 + Octokit + Railway deployment follows established patterns. @octokit/webhooks handles HMAC verification with documented API.
- **Phase 4 (Telegram):** Telegraf webhook integration with Express is documented in Telegraf docs. Inline keyboards and callback queries are standard patterns.
- **Phase 5 (Hardening):** All v1.x features are incremental improvements on established patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core libraries verified against official docs and npm. Version numbers spot-checked. One medium-confidence item: ImgBB free tier rate limits are not documented in writing — need to test under load. |
| Features | MEDIUM-HIGH | Widget and backend features HIGH confidence (competitor analysis strong). AI triage accuracy claims LOW confidence (single vendor source at 85-90% — do not rely on this figure). |
| Architecture | HIGH | Component boundaries, data flow, and patterns are well-established. One LOW-confidence item: Ralph bridge (local relay server) is a novel pattern with no external reference — architecture is reasonable but untested. |
| Pitfalls | MEDIUM | Security pitfalls (webhook HMAC, token exposure) HIGH confidence from official sources. Ralph-specific pitfalls (fix_plan format, race condition) are project-unique inferences with no external validation. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

1. **Ralph fix_plan.md format:** The AI triage service must generate fix plans in Ralph's exact expected format. The schema is not defined in this research — it must be read from Ralph's source code or existing fix_plan.md examples in the workspace before Phase 3 begins.

2. **Ralph --monitor behavior:** How does Ralph detect a new fix_plan.md? File watcher? Polling interval? This determines whether the local relay server writes to a file or needs to signal Ralph differently. Confirm before implementing the relay server.

3. **ImgBB free tier rate limits:** No documented rate limit found for ImgBB free tier. Under a spam attack the service could exhaust the limit. Test behavior under load; have a fallback plan (GitHub Contents API approach from ARCHITECTURE.md) if ImgBB rate-limits aggressively.

4. **Cloudflare Tunnel vs. ngrok for local relay:** Both work for exposing the local relay server. Cloudflare Tunnel is free and more stable for permanent use; ngrok free tier has ephemeral URLs. Decision should be made before Phase 3 begins. Cloudflare Tunnel is recommended.

5. **Per-project GitHub webhook registration:** The architecture requires one GitHub webhook registered per project repo pointing to the Railway service. This is an operational setup step that needs to be in the deployment runbook. It's not automated in v1.

6. **html-to-image CORS behavior on specific projects:** The FEATURES.md competitor analysis notes CORS issues with html2canvas; html-to-image uses the same SVG foreignObject approach. Actual behavior on Rohlik, Houbar, and other target pages must be tested in Phase 1 — don't assume it works until verified.

---

## Sources

### Primary (HIGH confidence)
- Telegram Bot API 9.5 — https://core.telegram.org/bots/api — webhook methods, inline keyboards, callback queries
- GitHub REST API Issues — https://docs.github.com/en/rest/issues/issues — issue creation, no image upload endpoint confirmed
- @octokit/webhooks — https://github.com/octokit/webhooks.js — webhook signature verification
- Express 5 npm default announcement — https://expressjs.com/2025/03/31/v5-1-latest-release.html
- Telegraf v4.16.3 — https://telegraf.js.org/
- sharp 0.34.5 — https://sharp.pixelplumbing.com/changelog/v0.34.5/
- grammY long polling vs webhooks — https://grammy.dev/guide/deployment-types
- express-rate-limit — https://www.npmjs.com/package/express-rate-limit
- Sentry User Feedback docs — https://docs.sentry.io/product/user-feedback/
- Marker.io features — https://marker.io/features
- GitHub Webhook security — https://docs.github.com/rest/guides/best-practices-for-using-the-rest-api

### Secondary (MEDIUM confidence)
- Vite Build Options IIFE format — https://vite.dev/config/build-options
- html-to-image npm — 1.6M monthly downloads, maintained fork of dom-to-image
- ImgBB API — https://api.imgbb.com/ — free tier 32MB limit, permanent storage (rate limits undocumented)
- Sentry feedback widget architecture — https://develop.sentry.dev/application-architecture/feedback-architecture/
- Telegram HITL approval patterns — n8n workflow template
- GitHub Community Discussion #46951 — no REST API for issue image upload confirmed
- Webhook async processing best practice — https://hookdeck.com/blog/webhooks-at-scale
- Monday.com engineering: capturing DOM as image — https://engineering.monday.com/capturing-dom-as-image-is-harder-than-you-think
- CSS Shadow DOM pitfalls — https://blog.pixelfreestudio.com/css-shadow-dom-pitfalls-styling-web-components-correctly/
- Building embeddable React widgets (MakerKit) — https://makerkit.dev/blog/tutorials/embeddable-widgets-react

### Tertiary (LOW confidence)
- AI bug triage accuracy 85-90% — Ranger.net (single vendor source, unverified)
- html-to-image vs html2canvas speed comparison — npm-compare.com (third-party, no methodology)

---

*Research completed: 2026-03-01*
*Ready for roadmap: yes*
