# Pitfalls Research

**Domain:** Automated bug reporting and fix pipeline (embeddable widget + GitHub Issues + AI triage + Ralph integration + Telegram oversight)
**Researched:** 2026-03-01
**Confidence:** MEDIUM (domain-specific patterns verified across multiple sources; some Ralph-specific interactions are project-unique with no external reference)

---

## Critical Pitfalls

### Pitfall 1: Widget CSS Leaks In Both Directions

**What goes wrong:**
The host page's CSS bleeds into the widget (making it look broken on some sites), or the widget's CSS bleeds into the host page (breaking the customer's app). Both directions happen. The most common failure is host page resets (`* { box-sizing: border-box; margin: 0; }`) or CSS frameworks (Bootstrap, Tailwind) restyling the widget's form elements.

**Why it happens:**
The widget is injected into the host page's DOM as a plain div. All CSS in scope applies to it unless explicit isolation is enforced. Developers test on their own clean pages and miss that production sites have opinionated global styles.

**How to avoid:**
Use Shadow DOM from day one. Create the widget root as `element.attachShadow({ mode: 'open' })` and mount React into that shadow root. CSS-in-JS or manually injected style tags must target the shadow root, not `document.head`. Retrofitting Shadow DOM after the widget is built is expensive — design for it in Phase 1.

**Warning signs:**
- Widget looks different in Intercom/Crisp/Zendesk live test than in isolation
- Form inputs change font on certain host pages
- Widget's `z-index` doesn't stack over host page modals

**Phase to address:** Phase 1 — Widget Foundation

---

### Pitfall 2: GitHub Token Exposed on the Client Side

**What goes wrong:**
The GitHub token used to create issues gets bundled into the widget JavaScript or sent directly from the browser to GitHub's API. Any visitor can extract it from DevTools network tab and create unlimited issues, delete repositories, or enumerate private repos.

**Why it happens:**
Developers think "it's just creating issues, not sensitive." But a GitHub PAT with `repo` scope is full write access to the repo. Even a fine-grained token with issues:write can be abused to spam thousands of issues in seconds.

**How to avoid:**
All GitHub API calls MUST go through the centralized backend service. The widget POSTs to your own API endpoint (`/api/report`). The backend holds the GitHub token in environment variables, validates and rate-limits the request, then calls GitHub. The token never touches the browser. This is non-negotiable.

**Warning signs:**
- Any direct `api.github.com` call from the widget's JS
- GitHub token in `window.__config`, environment variables bundled into the frontend, or any client-side code

**Phase to address:** Phase 1 — Widget Foundation AND Phase 2 — Backend Service

---

### Pitfall 3: Unverified GitHub Webhooks Create Security Holes

**What goes wrong:**
The backend receives a POST claiming to be a GitHub webhook and triggers the AI triage + fix pipeline. Without HMAC signature verification, anyone who discovers your webhook URL can send fake payloads — triggering Ralph to "fix" fake bugs, flooding Telegram with fake alerts, or exhausting AI API credits.

**Why it happens:**
Signature verification is easy to skip during development ("I'll add it later"). The bug is invisible until someone finds the endpoint. GitHub stopped supporting SHA-1 signatures in 2022, requiring SHA-256.

**How to avoid:**
Verify `X-Hub-Signature-256` header on every webhook request before any processing. Use constant-time comparison (`crypto.timingSafeEqual` in Node.js) — not `===` — to prevent timing attacks. Read the raw request body before parsing JSON (parsers can normalize whitespace, breaking signature verification). Reject any payload older than 5 minutes to prevent replay attacks.

**Warning signs:**
- Webhook endpoint processing requests before signature check
- Using `===` for signature comparison
- Parsing body as JSON before HMAC verification

**Phase to address:** Phase 2 — Backend Service

---

### Pitfall 4: fix_plan.md Race Condition When Multiple Reports Arrive Simultaneously

**What goes wrong:**
Two bug reports arrive within seconds. The AI triages both and both trigger fix_plan.md writes to the same project. Ralph reads a corrupted or half-written plan, or the second write silently overwrites the first. One bug fix is lost entirely.

**Why it happens:**
File system writes from multiple async handlers are not atomic. If the backend spawns two concurrent handlers, both read the current fix_plan.md, both append their task, and the last write wins — whichever completed second overwrites the first.

**How to avoid:**
Implement a job queue (BullMQ or similar, or even a simple in-memory queue per project slug) so fix_plan.md writes are serialized. Only one write operation runs at a time per project. Alternatively, use file locking before read-modify-write operations. The queue also enables retry logic if Ralph is busy.

**Warning signs:**
- Concurrent webhook processing without any serialization primitive
- No queue visible in the architecture
- fix_plan.md being written with `fs.writeFile` directly from webhook handler

**Phase to address:** Phase 3 — AI Triage + Ralph Integration

---

### Pitfall 5: AI Triage Silently Auto-Closing Legitimate Bugs

**What goes wrong:**
The AI marks a real bug as "spam" or "low confidence" and auto-rejects it without human review. The user's bug goes unresolved and they have no feedback. Worse, a critical bug (payment failure, data loss) gets discarded by a hallucinating model.

**Why it happens:**
Developers over-trust LLM confidence scores. The model returns `{ valid: false, reason: "unclear report" }` and the pipeline auto-closes the GitHub issue. No human ever sees it. LLMs hallucinate and are inconsistent — they may reject the same report differently on retries.

**How to avoid:**
Design three lanes, not two: `auto-fix` (high-confidence, low-risk), `human-review` (uncertain), and `auto-reject` (clearly spam/test). The `auto-reject` lane should be very narrow — require multiple spam signals (no URL, no description, profanity, exact duplicate). Prefer false positives (unnecessary human reviews) over false negatives (missed real bugs). Log all triage decisions including the model's reasoning for audit.

**Warning signs:**
- Binary `valid/invalid` triage with no middle lane
- Auto-reject triggering on any single spam signal
- Triage decisions not logged

**Phase to address:** Phase 3 — AI Triage

---

### Pitfall 6: Ralph Triggered on Already-Resolved Issues (Duplicate Firing)

**What goes wrong:**
A GitHub issue is created, triggers the webhook, Ralph starts working on a fix. While Ralph works, the issue gets labeled or commented on, firing more webhooks. Each fires another pipeline run. Ralph gets confused by conflicting fix plans, branches multiply, CI runs stack up.

**Why it happens:**
GitHub webhooks fire on ALL issue events (opened, labeled, commented, closed, etc.). Developers listen on `issues` event and don't filter sub-events. Every comment or label change re-triggers the full pipeline.

**How to avoid:**
Filter the webhook to fire ONLY on `issues.opened` (and possibly `issues.labeled` for a specific trigger label). Implement idempotency: before writing fix_plan.md, check if this issue ID already has an active job. Store a record of "issue #X is being processed" and skip if already active. Clear the record when the fix completes.

**Warning signs:**
- GitHub webhook configured to fire on all issue events without filtering
- No issue-ID-based deduplication in the pipeline
- Ralph being called multiple times for the same issue

**Phase to address:** Phase 3 — AI Triage + Ralph Integration

---

## Moderate Pitfalls

### Pitfall 7: html2canvas Screenshot Missing Critical Content

**What goes wrong:**
The screenshot submitted with the bug report shows a blank area, missing images, or incorrect layout. The AI can't understand the bug from context, reducing triage accuracy. The GitHub issue has a useless screenshot that doesn't match what the user saw.

**Why it happens:**
html2canvas does not take an actual screenshot — it reconstructs the DOM by reading computed styles. It fails on: external images without CORS headers, CSS filters, `background-image` from CDN, `<canvas>` elements, web fonts that haven't loaded, iframes, and elements with complex transforms.

**How to avoid:**
Fall back gracefully. If html2canvas fails or produces a blank canvas (detectable by checking pixel data), send the report without a screenshot rather than blocking the user. Consider adding the current URL + visible text as fallback context. Test on your actual project pages (Rohlik, Houbar etc.) during Phase 1 — don't assume html2canvas works until tested.

**Warning signs:**
- No error handling around `html2canvas()` call
- Screenshot always attached even on failure
- Not tested on pages with external images or custom fonts

**Phase to address:** Phase 1 — Widget Foundation

---

### Pitfall 8: Telegram Callback Buttons Expire or Fire Twice

**What goes wrong:**
Miro taps "Approve" on a Telegram notification. Nothing happens — the callback query expired. Or taps once, and the bug gets approved twice, triggering two Ralph runs. The UI shows a spinning progress bar indefinitely because `answerCallbackQuery` was never called.

**Why it happens:**
Telegram callback queries must be answered within a timeout (typically a few minutes) or they become invalid. Duplicate delivery of updates is documented behavior — the same update_id can arrive more than once if the bot doesn't acknowledge quickly. Without deduplication by callback ID, both executions run.

**How to avoid:**
Always call `answerCallbackQuery` immediately on receipt, before any async processing. Store processed callback IDs in a short-lived cache (Redis, or an in-memory Map with TTL) and skip duplicates. Use state in the database: mark an issue as "pending-human" before sending to Telegram and check this state before processing the callback — if already approved/rejected, ignore the callback and send a "already handled" response.

**Warning signs:**
- No deduplication of callback query IDs
- answerCallbackQuery called at the end of processing instead of immediately
- No persistent state for "pending human review"

**Phase to address:** Phase 4 — Telegram Integration

---

### Pitfall 9: Railway Cold Starts Cause Missed Webhooks

**What goes wrong:**
The Railway service sleeps after inactivity. GitHub sends a webhook. Railway's cold start takes 15-22 seconds. GitHub's webhook delivery times out (30 second default). GitHub retries, but the retry adds a 5-minute delay. The pipeline response time goes from instant to 5+ minutes on the first bug report of the day.

**Why it happens:**
Railway (on hobby/free tier) puts services to sleep when there's no traffic. GitHub webhooks have a delivery timeout. The cold start window overlaps the timeout window under real conditions.

**How to avoid:**
Use Railway's always-on setting (no sleep) for the bug report service — it's a low-traffic service so this is cheap. Alternatively, implement a health check ping every 5 minutes via a cron job or UptimeRobot. Implement GitHub webhook retry handling — GitHub retries failed deliveries, so the pipeline should be idempotent (same event processed twice = no duplicate work).

**Warning signs:**
- Service on Railway without always-on configured
- No health check endpoint
- First bug report of the day consistently slow

**Phase to address:** Phase 2 — Backend Service

---

### Pitfall 10: Spam Flood Exhausting GitHub API Rate Limit

**What goes wrong:**
Someone discovers the bug report endpoint and sends 500 requests in a minute. Each creates a GitHub issue. GitHub's 5,000 req/hour PAT limit is exhausted. All other projects stop working — CI, auto-deploys, everything using the same token breaks.

**Why it happens:**
Rate limiting is often added "later" and later never comes. The service is designed to create a GitHub issue per report, so 1:1 ratio between report and API call. No throttle = no protection.

**How to avoid:**
Apply rate limiting at multiple layers: (1) IP-based rate limiting at the API gateway (max 5 reports per IP per hour), (2) global rate limiting for the service (max N reports per minute regardless of IP), (3) GitHub issue creation rate limiting (separate bucket from other GitHub API calls). Use the `X-RateLimit-Remaining` header — if below 100, stop creating issues and queue them. The rate limiting on the widget endpoint must be in Phase 2, not deferred.

**Warning signs:**
- No `X-RateLimit-Remaining` check before creating GitHub issues
- No IP-based rate limiting on the report endpoint
- Same PAT token used for pipeline operations and issue creation without separate buckets

**Phase to address:** Phase 2 — Backend Service

---

### Pitfall 11: Widget Blocking or Crashing the Host App

**What goes wrong:**
The widget script throws an uncaught exception during initialization. It crashes in a host page context that has a strict Content Security Policy. It loads a 500KB bundle that slows the host page's Time to Interactive by 2 seconds. Any of these make site owners remove the widget.

**Why it happens:**
Developers test widgets on their own pages (no CSP, no competing scripts). Production host pages have CSP headers, custom global objects, and strict error boundaries. A single unhandled error in the widget pollutes the host page's error tracking.

**How to avoid:**
Wrap the entire widget initialization in a try/catch. Load the widget asynchronously with `async defer` — it must never block page render. Keep bundle size under 100KB gzipped (verify with bundlesize). The widget should gracefully degrade: if anything fails, log silently and do nothing. Test with a strict CSP that blocks `eval` and inline scripts.

**Warning signs:**
- Widget script not wrapped in error boundary
- Bundle > 150KB gzipped
- `script` tag without `async` or `defer`
- Not tested on a page with `Content-Security-Policy` header

**Phase to address:** Phase 1 — Widget Foundation

---

## Minor Pitfalls

### Pitfall 12: Ralph fix_plan.md Format Drift

**What goes wrong:**
The AI generates a fix_plan.md with slightly wrong format — wrong section headers, tasks missing required fields, or tasks too vague. Ralph misreads the plan and either skips tasks or misunderstands scope.

**How to avoid:**
Define the exact fix_plan.md schema in the project constants and use it to validate AI output before writing. Include a real example plan in the AI prompt as a template. Test the generated plan format manually before automating Ralph execution.

**Phase to address:** Phase 3 — Ralph Integration

---

### Pitfall 13: Screenshot Size Exceeds GitHub Issue Limits

**What goes wrong:**
html2canvas generates a full-page screenshot that's 8MB as PNG. GitHub's issue comment image upload API accepts files up to 10MB, but the base64-encoded version exceeds the API request body limit before it even reaches GitHub.

**How to avoid:**
Compress screenshots before upload. Scale down to max 1280px wide. Use JPEG at 80% quality instead of PNG for screenshots. Enforce a 2MB limit before submission with a user-visible warning to scroll to the visible bug area before capturing.

**Phase to address:** Phase 1 — Widget Foundation

---

### Pitfall 14: No Audit Trail for Automated Actions

**What goes wrong:**
Ralph deploys a fix. The deployment breaks something else. No one knows which bug report triggered the fix, which AI triage decision approved it, or what the fix_plan.md contained. Post-incident investigation is impossible.

**How to avoid:**
Log every pipeline event with the chain: `report_id → issue_id → triage_decision → fix_plan_content → ralph_run_id → deploy_sha`. Store in Railway's persistent volume or forward to a simple log aggregator (even a GitHub Gist per run). Link the GitHub issue back to the Telegram approval message ID.

**Phase to address:** Phase 3 — AI Triage + Ralph Integration

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip Shadow DOM, use plain div + CSS prefix | Faster initial build | Widget breaks on 20-30% of host pages with opinionated CSS; painful to retrofit | Never — add from start |
| Direct GitHub API calls from widget | Skip backend work | Token exposed in browser, anyone can abuse it | Never |
| Binary triage (valid/invalid only) | Simpler pipeline | Real bugs auto-rejected, user trust destroyed | MVP if human-review lane added in next phase |
| Skip job queue, write fix_plan.md directly | Simpler code | Concurrent reports corrupt plans | Never — queue is cheap to add |
| Hard-code Railway URL in widget | Faster deploy | Widget breaks when service URL changes | Never — make configurable |
| One PAT token for everything | Simpler auth | Rate limits shared; issue spam kills CI/CD | Never — scope tokens tightly |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub Webhooks | Parse JSON body before HMAC verification | Read raw body first, verify HMAC, then parse |
| GitHub Webhooks | Listen on all `issues` events | Filter to `issues.opened` only at minimum |
| GitHub Webhooks | Compare signatures with `===` | Use `crypto.timingSafeEqual` (constant-time) |
| GitHub API | Same token for issue creation and pipeline operations | Use separate fine-grained tokens scoped per repo |
| Telegram Bot | answerCallbackQuery at end of handler | Call immediately on receipt, then process |
| Telegram Bot | Long polling in production | Use webhooks for Railway deployment |
| Telegram Bot | No deduplication of callback updates | Deduplicate by update_id in short-lived cache |
| html2canvas | No fallback on failure | Detect blank canvas, send report without image |
| Railway | Service sleep enabled | Use always-on / health check ping |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Synchronous AI triage in webhook handler | GitHub webhook times out (30s limit), GitHub retries, duplicate pipeline runs | Return 200 immediately, process async via queue | ~10 reports/hour |
| Blocking fix_plan.md writes | Second concurrent bug report lost silently | Job queue with per-project serialization | 2+ concurrent reports |
| html2canvas on full page | 10+ second screenshot capture blocking widget UI | Canvas only visible viewport; compress output | Any page > 500 elements |
| Widget bundle loaded synchronously | Host page Time to Interactive degrades | `async defer` on script tag; bundle < 100KB | Any page using the widget |
| All GitHub calls on one token | 5000 req/hr limit hit during spam attack | Separate tokens + rate limit enforcement | ~200 spam reports/hour |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| GitHub token in widget JS | Any visitor extracts token; full repo write access | Backend-only GitHub calls; token in env vars only |
| No webhook HMAC verification | Attacker triggers arbitrary fix pipelines | Verify `X-Hub-Signature-256` on every request |
| Replay attack via old webhook | Valid old payloads re-trigger pipeline indefinitely | Reject payloads with `created_at` older than 5 minutes |
| No IP rate limiting on report endpoint | Spam flood exhausts GitHub API quota | IP-based + global rate limiting from Phase 2 |
| Telegram bot token in client code | Attacker sends arbitrary Telegram messages as the bot | Token server-side only; webhook URL not shared publicly |
| Trusting AI triage for high-risk actions | Hallucinated `auto-fix` for destructive or data-loss bugs | Require human approval for any fix touching DB migrations, auth, or payments |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No confirmation after submit | User doesn't know if report was received; submits 3 times | Show success state immediately on API response 200 |
| Widget broken by host page | User tries to report bug, widget is unusable — meta-problem | Shadow DOM isolation + graceful degradation |
| Screenshot of wrong area | AI gets no useful visual context | Show preview of screenshot before submission with retake option |
| Generic "Something went wrong" on failure | User abandons; bug goes unreported | "Report saved locally — will retry" or "Copy this info to paste in GitHub" |
| No rate limit feedback | User gets mysterious silence when rate limited | Show "You've already submitted a report recently, thank you" |

---

## "Looks Done But Isn't" Checklist

- [ ] **Widget CSS isolation:** Shadow DOM mounted, not just a div with prefixed class names — verify by injecting on a Bootstrap page
- [ ] **GitHub token security:** Open DevTools Network tab on host page — confirm zero calls to `api.github.com` from browser
- [ ] **Webhook HMAC:** Send a forged webhook payload with wrong signature — confirm 401, not 200
- [ ] **Rate limiting:** Hit the report endpoint 10 times in 10 seconds from one IP — confirm 429 after threshold
- [ ] **Telegram deduplication:** Tap Approve button twice rapidly — confirm only one fix triggered
- [ ] **fix_plan.md idempotency:** Send same GitHub issue event twice — confirm only one job created
- [ ] **Railway always-on:** Wait 30 minutes after last request, send a webhook — confirm < 2 second response time
- [ ] **Screenshot fallback:** Inject an image with CORS-blocked src — confirm widget still submits without screenshot
- [ ] **Widget graceful failure:** Throw an error in widget init — confirm host page is unaffected

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Token exposed in widget | HIGH | Revoke token immediately via GitHub; rotate; audit all issues created during exposure; add backend proxy |
| Webhook HMAC missing | MEDIUM | Add verification; review logs for unauthorized triggers; check if any fake issues were created |
| fix_plan.md corruption | MEDIUM | Restore from git history; add job queue; manually review affected project state |
| GitHub rate limit exhausted | LOW | Wait for reset (X-RateLimit-Reset header); add queuing for backlogged reports |
| Telegram callback loop | LOW | Add deduplication map; purge duplicate runs from queue |
| Widget crashes host page | HIGH | Hotfix with try/catch wrapper; notify affected project owners; roll back widget version |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Widget CSS leaks (both directions) | Phase 1 — Widget Foundation | Test widget on Bootstrap, Tailwind, and unstyled pages |
| GitHub token in client-side code | Phase 1 + Phase 2 | DevTools network: zero `api.github.com` calls from browser |
| Unverified GitHub webhooks | Phase 2 — Backend Service | Send forged webhook: must get 401 |
| fix_plan.md race condition | Phase 3 — Ralph Integration | Concurrent report test: 2 issues, 2 plans, no corruption |
| AI auto-rejecting real bugs | Phase 3 — AI Triage | Manual test set of 20 real bug reports: < 5% false reject |
| Duplicate webhook firing | Phase 3 — Ralph Integration | Same issue event sent 3 times: 1 job created |
| Telegram callback expiry / duplicates | Phase 4 — Telegram Integration | Double-tap Approve: 1 Ralph run, not 2 |
| Railway cold start | Phase 2 — Backend Service | Idle for 30 min, send webhook, measure response time < 5s |
| Spam flood / rate limit exhaustion | Phase 2 — Backend Service | Load test endpoint at 100 req/min: rate limit triggers, GitHub intact |
| Widget crashing host app | Phase 1 — Widget Foundation | Widget init throws: host page console clean |

---

## Sources

- [GitHub Webhook Security Best Practices 2025-2026 (DEV Community)](https://dev.to/digital_trubador/webhook-security-best-practices-for-production-2025-2026-384n)
- [GitHub Best Practices for REST API (Official Docs)](https://docs.github.com/rest/guides/best-practices-for-using-the-rest-api)
- [GitHub Webhooks Complete Guide 2025](https://inventivehq.com/blog/github-webhooks-guide)
- [Webhook Security Fundamentals 2026 (Hooklistener)](https://www.hooklistener.com/learn/webhook-security-fundamentals)
- [CSS Shadow DOM Pitfalls (Pixel Free Studio)](https://blog.pixelfreestudio.com/css-shadow-dom-pitfalls-styling-web-components-correctly/)
- [Building Embeddable React Widgets: Production-Ready Guide (MakerKit)](https://makerkit.dev/blog/tutorials/embeddable-widgets-react)
- [The Hidden Technique That Made Our Web Widgets Bulletproof (Medium)](https://medium.com/@rijulrajtkeey2/the-hidden-technique-that-made-our-web-widgets-bulletproof-f42baec76afd)
- [Avoiding CSS Style Collisions When Building a UI Widget (DEV Community)](https://dev.to/manu4216/avoiding-css-style-collisions-when-building-a-ui-widget-2633)
- [Using LLMs to Filter Out False Positives from Static Code Analysis (Datadog)](https://www.datadoghq.com/blog/using-llms-to-filter-out-false-positives/)
- [grammY: Long Polling vs. Webhooks (Official)](https://grammy.dev/guide/deployment-types)
- [Railway Incident Report November 2025 (GitHub webhooks surge)](https://blog.railway.com/p/incident-report-november-20-2025)
- [Capturing DOM as Image Is Harder Than You Think (Monday Engineering)](https://engineering.monday.com/capturing-dom-as-image-is-harder-than-you-think-how-we-solved-it-at-monday-com/)
- [Are Bugs and Incidents Inevitable With AI Coding Agents? (Stack Overflow)](https://stackoverflow.blog/2026/01/28/are-bugs-and-incidents-inevitable-with-ai-coding-agents)
- [Telegram Bot API — Callback Queries (Official)](https://core.telegram.org/bots/api)
- [Tips to Avoid Falling Into an AI Fix Loop (byldd.com)](https://byldd.com/tips-to-avoid-ai-fix-loop/)

---
*Pitfalls research for: automated bug reporting and fix pipeline*
*Researched: 2026-03-01*
