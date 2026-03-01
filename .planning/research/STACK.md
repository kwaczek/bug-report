# Stack Research

**Domain:** Embeddable bug report widget + centralized fix pipeline backend
**Researched:** 2026-03-01
**Confidence:** MEDIUM-HIGH (core stack HIGH, AI triage MEDIUM, image hosting workaround MEDIUM)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22 LTS | Backend runtime | Current LTS, Railway auto-detects, V8 v12.4, native ES modules. Express 5 requires Node 18+. |
| Express.js | 5.2.1 | HTTP server for webhook receiver and report API | v5 is now npm default (March 2025). Async error handling built-in. Eliminates boilerplate `try/catch` wrappers vs v4. |
| Vite | 7.3.1 | Widget bundler (IIFE format) | Library mode with `formats: ['iife']` produces a single self-executing JS file — exactly what a `<script>` tag widget needs. Assets inlined. No Webpack config hell. |
| Vanilla JS / TypeScript | ES2022 | Widget frontend | Zero runtime dependency in the injected bundle. Preact was considered but adds 3KB min+gzip and framework coupling. Widget has no complex state. |

### External APIs

| API | Auth | Purpose | Notes |
|-----|------|---------|-------|
| GitHub REST API v3 | Fine-grained PAT (`Issues: write`) | Create issues with labels on target repos | `POST /repos/{owner}/{repo}/issues`. No framework needed — raw fetch or Octokit. |
| Telegram Bot API 9.5 | Bot token via `setWebhook` | Send notification + inline approve/reject buttons | Current version released 2026-03-01. Use `sendMessage` + `InlineKeyboardMarkup` + `answerCallbackQuery`. |
| ImgBB API | Free API key | Screenshot storage (workaround for GitHub's missing upload API) | Free tier: 32 MB limit, no time restriction, no rate limit docs. Accepts base64. Returns permanent URL embeddable in issue body. |

### Supporting Libraries (Backend)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@octokit/rest` | 21.x (latest per npm, ~5.0.5 umbrella) | GitHub API client | Use `octokit.rest.issues.create()` — typed, handles auth, retry, pagination automatically |
| `@octokit/webhooks` | latest | Verify GitHub webhook signatures | Official, handles `X-Hub-Signature-256` HMAC-SHA256 verification with timing-safe comparison |
| `telegraf` | 4.16.3 | Telegram bot with webhook support | Framework abstracts `setWebhook`, `InlineKeyboardMarkup`, `answerCallbackQuery`. Use `bot.createWebhook()` to attach to existing Express server. |
| `multer` | 2.1.0 | Multipart form handling for screenshot uploads | v2.0 addresses security CVEs. Use memory storage (buffer) so image goes straight to ImgBB — never written to disk. |
| `sharp` | 0.34.5 | Image compression before ImgBB upload | Resize screenshots to max 1280px wide, compress to JPEG 80% quality. Reduces file size 60-80% vs raw PNG paste. |
| `express-rate-limit` | 8.2.1 | Spam protection for bug report endpoint | 10 reports/IP/hour window sufficient for legitimate use. Combine with IP-based blocklist for repeat offenders. |
| `helmet` | latest | Security HTTP headers | One-liner protection. Required for Railway production. |
| `dotenv` | 16.x | Environment variable loading | Dev only — Railway injects env vars directly in production. |

### Supporting Libraries (Widget)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `html-to-image` | 1.11.13 | Capture current page as PNG for screenshot | Best maintained option in 2025 (1.6M monthly downloads). Uses SVG foreignObject approach. Faster than html2canvas. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vite 7 | Widget build + dev server | `vite build --mode widget` for IIFE output. Configure `build.lib.formats: ['iife']` |
| TypeScript 5.x | Type safety across widget and backend | Use `tsc --noEmit` for type checking, Vite handles transpilation for widget |
| `nodemon` | Backend hot reload in dev | `nodemon --watch src` — not needed in production |
| `tsx` | Run TypeScript directly in Node | `tsx src/index.ts` for development without pre-compilation step |

---

## Installation

```bash
# Backend (centralized service)
npm install express @octokit/rest @octokit/webhooks telegraf multer sharp express-rate-limit helmet dotenv

# Dev dependencies (backend)
npm install -D typescript tsx nodemon @types/express @types/multer @types/node

# Widget (separate package.json in widget/ subdirectory)
npm install html-to-image
npm install -D vite typescript
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Express 5 | Fastify 4 | If you need extreme throughput (>10k req/s). Not warranted here — bug reports are low volume. |
| Vite IIFE | Rollup directly | If you need more control over chunk splitting. Vite wraps Rollup — skip the extra config. |
| Vite IIFE | Webpack | Never for a widget. Configuration overhead unjustified. Output size 2-3x larger than Rollup-based tools. |
| Vanilla JS widget | Preact | Only if widget grows to 10+ interactive components. Adds 3KB min+gzip. Current widget is a form — not worth it. |
| ImgBB | Cloudinary | If you need image transformations or CDN optimization. ImgBB is simpler for raw screenshot storage. |
| ImgBB | GitHub release assets | Release assets API works but requires a dedicated repo and release, adds complexity. ImgBB is cleaner. |
| ImgBB | Imgur | Imgur has 50-image/IP rate limit — problematic in production. ImgBB has no stated limit on free tier. |
| `multer` v2 | `busboy` directly | Only if you need streaming without intermediate files. Multer wraps busboy cleanly enough. |
| `telegraf` | `node-telegram-bot-api` | node-telegram-bot-api (yagop) is less maintained in 2025. Telegraf has better TypeScript types and active development. |
| `@octokit/webhooks` | Manual HMAC verification | Always use the official library — it handles timing-safe comparison and edge cases correctly. |
| `html-to-image` | `html2canvas` | html2canvas: 21+ seconds for complex pages, poor maintenance. html-to-image is 3x faster for typical pages. |
| `html-to-image` | `dom-to-image` | dom-to-image is no longer actively maintained, breaks on modern CSS (flexbox, grid). |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| GitHub's native image upload UI endpoint | No official REST API for uploading images to issues. The web UI uses a proprietary endpoint that returns 401/400 for API clients. Community discussion confirmed: no working workaround as of 2025. | ImgBB API — upload image, get permanent URL, embed in issue body as `![screenshot](url)` |
| Base64 images inline in GitHub issue body | GitHub's markdown renderer strips base64 images. Long-standing refusal (tracked since 2012, no change). | External URL from ImgBB |
| `dom-to-image` | Abandoned. Breaks on flexbox/grid/modern CSS transforms. | `html-to-image` (maintained fork with improvements) |
| `multer` v1.x | High-severity security CVEs (CVE-2025-47944, DoS via malicious requests). v2 fixes these. | `multer` 2.1.0 |
| Express 4.x | v5 is now the npm default (March 2025). v4 enters maintenance. New projects should start on v5. | Express 5.2.1 |
| Polling for Telegram updates (`getUpdates`) | Wastes Railway compute cycles, introduces latency (typically 1-3s delay vs instant). | `bot.createWebhook()` with Telegraf |
| Shadow DOM closed mode | Blocks browser DevTools inspection and `document.querySelector` access from host page scripts, which causes issues with some screenshot capture approaches. | Shadow DOM open mode — style isolation is sufficient without closed mode for a public widget |
| Session/cookie auth on bug report endpoint | Widget is anonymous by design. Adding auth defeats the zero-friction goal. | Rate limiting by IP + GitHub issue labels for spam triage |

---

## Stack Patterns by Variant

**Widget (browser, injected via `<script>` tag):**
- Build with Vite IIFE format — single self-contained file
- Use Shadow DOM (open mode) for style isolation from host page
- Read config from `data-*` attributes on the `<script>` tag via `document.currentScript`
- Capture screenshot via `html-to-image` before user submits (async, non-blocking)
- Use Clipboard API (`navigator.clipboard.read()`) for paste-from-clipboard support
- Fail silently: wrap all init in `try/catch`, never throw errors that break host page

**Backend (Railway, Node.js service):**
- Single Express 5 app with distinct route groups: `/report` (widget intake), `/webhook/github` (GitHub events), `/webhook/telegram` (bot callbacks)
- Verify GitHub webhook signatures with `@octokit/webhooks` before processing
- Store no state — GitHub Issues is the source of truth, Telegram is the notification channel
- Use environment variables for all secrets (Railway injects these directly)

**AI Triage (bug validity assessment):**
- Use GPT-4o-mini (text-only) for cost efficiency on text classification
- Prompt: assess if report is valid bug vs. spam/feature request. Output: VALID / SPAM / UNCERTAIN + confidence score
- UNCERTAIN cases → Telegram bot message with Approve/Reject inline buttons
- Estimated cost: ~$0.001 per triage call (150 input tokens × $0.15/1M)

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Express 5.2.1 | Node.js 18+ | Requires Node 18 minimum. Node 22 LTS recommended for Railway. |
| multer 2.1.0 | Express 5 | Explicitly tested with Express 5 in the v2 release. |
| telegraf 4.16.3 | Node.js 18+ | TypeScript-first. `createWebhook()` attaches to Express cleanly. |
| sharp 0.34.5 | Node.js 18.17+ | Native binaries — pre-built for Node 18/20/22 on Linux (Railway). No compile step needed on Railway. |
| @octokit/rest latest | Node.js 18+ | ESM-first in recent versions. Use `import` not `require`. |
| Vite 7.3.1 | Node.js 18+ | Widget dev/build tool only — not deployed to Railway. |

---

## Key Architecture Decision: Image Hosting

GitHub's REST API has **no endpoint for uploading images to issues**. This was confirmed in:
- GitHub Community Discussion #46951 (multiple user confirmations, 400/401 responses)
- GitHub Community Discussion #28219 (open since 2022, no official response)

**Decision: Use ImgBB as the image host.**

Flow:
1. Widget captures screenshot as PNG blob
2. Widget converts to base64, POSTs to backend with bug report
3. Backend compresses with Sharp (max 1280px, JPEG 80%)
4. Backend uploads to ImgBB API → receives permanent URL
5. Backend creates GitHub issue with `![Screenshot](imgbb_url)` in body

ImgBB free tier: 32MB limit (more than sufficient for compressed screenshots), no stated rate limit, permanent storage.

---

## Sources

- Vite Build Options (official) — https://vite.dev/config/build-options — verified IIFE format config, current version 7.3.1 (HIGH confidence)
- Telegram Bot API 9.5 — https://core.telegram.org/bots/api — verified version 9.5 released 2026-03-01, webhook methods, inline keyboards (HIGH confidence)
- GitHub REST API Issues — https://docs.github.com/en/rest/issues/issues — verified issue creation endpoint, authentication requirements, no image upload (HIGH confidence)
- GitHub Community Discussion #46951 — https://github.com/orgs/community/discussions/46951 — confirmed no REST API image upload, workarounds (MEDIUM confidence, community source)
- @octokit/webhooks usage — https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries — official recommendation for webhook verification (HIGH confidence)
- Express 5 npm default — https://expressjs.com/2025/03/31/v5-1-latest-release.html — v5 became npm default March 2025 (HIGH confidence)
- Telegraf v4.16.3 — https://telegraf.js.org/ — current version confirmed (HIGH confidence)
- multer 2.1.0 — npm search result — v2 released with CVE fixes (MEDIUM confidence, verify on npm)
- sharp 0.34.5 — https://sharp.pixelplumbing.com/changelog/v0.34.5/ — released November 2025 (HIGH confidence)
- express-rate-limit 8.2.1 — npm search result (MEDIUM confidence, verify on npm)
- html-to-image 1.11.13 — npm search result — 1.6M monthly downloads (MEDIUM confidence)
- ImgBB API — https://api.imgbb.com/ — free tier 32MB, base64 upload, permanent storage (MEDIUM confidence, free tier limits unconfirmed in writing)
- WebSearch: embeddable widget shadow DOM best practices 2025 — Smashing Magazine, Viget (MEDIUM confidence)
- WebSearch: html-to-image vs html2canvas 2025 comparison — npm-compare.com (MEDIUM confidence)

---

*Stack research for: Embeddable Bug Report Widget + Centralized Fix Pipeline*
*Researched: 2026-03-01*
