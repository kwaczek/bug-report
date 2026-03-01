# Architecture Research

**Domain:** Automated bug report → fix pipeline (embeddable widget + centralized service + Telegram bot + Ralph CLI integration)
**Researched:** 2026-03-01
**Confidence:** HIGH (component patterns well-established; one LOW-confidence area: screenshot-to-GitHub-issue image attachment)

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                               │
│                                                                   │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐          │
│  │ rohlik-web   │   │ houbar       │   │ hry-portal   │  ...     │
│  │              │   │              │   │              │          │
│  │ <script src= │   │ <script src= │   │ <script src= │          │
│  │ widget.js /> │   │ widget.js /> │   │ widget.js /> │          │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘          │
└─────────┼─────────────────┼─────────────────┼───────────────────┘
          │  POST /report    │                  │
          └──────────────────┴──────────────────┘
                             │
┌────────────────────────────▼──────────────────────────────────────┐
│                    CENTRALIZED SERVICE (Railway)                   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    HTTP Server (Express)                      │  │
│  │  POST /report  ←── widget reports (rate-limited per IP)      │  │
│  │  POST /webhook ←── GitHub issue webhook events               │  │
│  │  POST /bot     ←── Telegram bot callback queries             │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                             │                                      │
│  ┌──────────────────────────▼───────────────────────────────────┐  │
│  │                    Pipeline Orchestrator                      │  │
│  │  1. validate + rate-check report                             │  │
│  │  2. upload screenshot → GitHub repo (workaround)             │  │
│  │  3. create GitHub issue with label + screenshot link         │  │
│  │  4. receive webhook → run AI triage                          │  │
│  │  5a. HIGH confidence → write fix_plan.md + run Ralph         │  │
│  │  5b. LOW confidence  → send Telegram message, await reply    │  │
│  │  5c. SPAM/invalid    → close issue, no action                │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                             │                                      │
│  ┌──────────────────────────▼───────────────────────────────────┐  │
│  │                    In-Process State                           │  │
│  │  pendingApprovals Map { issueId → {chatId, messageId} }      │  │
│  │  (survives restarts only if persisted — see pitfalls)        │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
          │               │                │
          ▼               ▼                ▼
   ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────┐
   │  GitHub API │ │  Telegram   │ │     Ralph CLI (local)        │
   │  (Octokit)  │ │  Bot API    │ │  /ralph-workspace/projects/  │
   │  - issues   │ │  (grammY)   │ │  <name>/fix_plan.md          │
   │  - webhooks │ │  - notify   │ │  ralph --monitor             │
   │  - repo     │ │  - approve/ │ │  → runs fix → pushes main    │
   │    contents │ │    reject   │ │  → CI/CD deploys             │
   └─────────────┘ └─────────────┘ └─────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Widget JS | Capture report (title, description, URL, screenshot), POST to service | Vanilla JS, Webpack bundle, no framework dependency |
| HTTP Server | Receive reports and webhooks, validate signatures, respond fast | Express.js + express-rate-limit |
| Pipeline Orchestrator | Business logic: triage, route to auto-fix or human review | Node.js service layer |
| AI Triage | Classify bug as valid/spam, estimate fix risk | OpenAI/Anthropic API call with structured output |
| Screenshot Store | Host screenshot images referenceable by GitHub Markdown | GitHub repo `kwaczek/bug-assets` (or similar) via Contents API |
| GitHub Integration | Create issues, add labels, close spam | @octokit/rest with personal token |
| Telegram Bot | Send triage notifications, handle approve/reject inline keyboard | grammY with long polling on Railway |
| Ralph Bridge | Write fix_plan.md to the correct project path, trigger Ralph | File system write + shell exec (local only) |
| CI/CD | Deploy after Ralph pushes fix to main | Existing Railway/Vercel pipelines (no changes needed) |

## Recommended Project Structure

```
bug-report/
├── src/
│   ├── server.ts              # Express app, route registration
│   ├── routes/
│   │   ├── report.ts          # POST /report — receive widget submissions
│   │   ├── webhook.ts         # POST /webhook — GitHub issue events
│   │   └── bot.ts             # POST /bot — Telegram callbacks (if webhook mode)
│   ├── services/
│   │   ├── github.ts          # Octokit wrappers: create issue, upload image, label
│   │   ├── triage.ts          # AI call → {decision: 'fix'|'review'|'spam', confidence, reason}
│   │   ├── telegram.ts        # grammY bot init, send notification, handle callbacks
│   │   └── ralph.ts           # Write fix_plan.md, invoke ralph CLI
│   ├── middleware/
│   │   ├── rateLimit.ts       # express-rate-limit config (per IP, per project)
│   │   └── webhookVerify.ts   # HMAC-SHA256 check for GitHub webhook signature
│   ├── state/
│   │   └── pendingApprovals.ts # In-memory map (issueId → Telegram context)
│   └── config.ts              # Env var loading and validation
├── widget/
│   ├── src/
│   │   ├── index.ts           # Widget entry point — init, inject UI
│   │   ├── ui.ts              # Floating button + modal DOM construction
│   │   ├── screenshot.ts      # html2canvas wrapper
│   │   └── reporter.ts        # POST to service endpoint
│   ├── webpack.config.js      # Bundle to single widget.js
│   └── dist/
│       └── widget.js          # Served statically
├── public/
│   └── widget.js              # Symlink or copy of widget/dist/widget.js
└── package.json
```

### Structure Rationale

- **src/services/:** Each external system gets its own file — swapping GitHub for GitLab later only touches `github.ts`
- **widget/:** Completely separate build target with its own webpack config — keeps browser code isolated from server code
- **src/state/:** Explicit isolation of in-memory state makes it easy to swap for Redis later
- **src/middleware/:** Rate limiting and signature verification as middleware — applied at route registration, not buried in handlers

## Architectural Patterns

### Pattern 1: Respond Fast, Process Async

**What:** The HTTP endpoint acknowledges a webhook or report immediately (200 OK), then does all heavy work (AI call, GitHub API, Telegram message) asynchronously after the response is sent.

**When to use:** Any endpoint triggered by GitHub webhooks or widget submissions. GitHub expects a response within 10 seconds or retries. AI calls can take 5-15 seconds.

**Trade-offs:** Simple to implement in Node.js with async IIFE; doesn't guarantee delivery if the process crashes mid-work. Acceptable for this scale — a simple in-memory queue or `setImmediate` pattern works before adding BullMQ.

**Example:**
```typescript
app.post('/webhook', verifyGithubSignature, (req, res) => {
  res.sendStatus(200); // Acknowledge immediately
  processWebhook(req.body).catch(console.error); // Process after response
});

async function processWebhook(payload: WebhookPayload) {
  const { issue } = payload;
  const triage = await triageService.evaluate(issue);
  if (triage.decision === 'fix') {
    await ralphService.writeFixPlan(issue);
  } else if (triage.decision === 'review') {
    await telegramService.sendApprovalRequest(issue, triage.reason);
  } else {
    await githubService.closeAsSpam(issue.number);
  }
}
```

### Pattern 2: GitHub Webhook as the Event Bus

**What:** Rather than having the widget trigger the fix pipeline directly, the widget only creates the GitHub issue. The GitHub webhook then triggers all downstream processing. The issue is the canonical record.

**When to use:** Always — this is the right design for this system.

**Trade-offs:** One extra hop (report → GitHub issue → webhook → service) but the payoff is enormous: every bug has a GitHub issue as its audit trail, human review is always available via GitHub, and the pipeline is restartable from any issue.

**Example flow:**
```
Widget POSTs → Service creates issue → GitHub fires webhook →
Service receives webhook → AI triages → fix or review
```

### Pattern 3: Telegram Bot as Long-Polling Service on Railway

**What:** grammY `bot.start()` runs long-polling within the same Railway service process (or a separate Railway service). No webhook URL needed for the bot itself.

**When to use:** Railway persistent service (not serverless). Long polling is simpler, avoids Telegram's 60-second webhook timeout constraint, and Railway's always-on container makes polling cost-effective.

**Trade-offs:** Polling adds ~1-2 second latency for Telegram responses vs. webhooks. Acceptable for approve/reject workflow. The Railway service already handles GitHub webhooks via HTTP, so the Telegram bot simply runs alongside it via `bot.start()` in the same process.

**Example:**
```typescript
// src/services/telegram.ts
import { Bot, InlineKeyboard } from 'grammy';

export const bot = new Bot(process.env.TELEGRAM_TOKEN!);

bot.on('callback_query:data', async (ctx) => {
  const [action, issueId] = ctx.callbackQuery.data.split(':');
  if (action === 'approve') await ralphService.writeFixPlan(issueId);
  if (action === 'reject') await githubService.close(issueId);
  await ctx.answerCallbackQuery();
});

// In server startup: bot.start() — runs alongside Express
```

### Pattern 4: Screenshot Storage via GitHub Repo Contents API

**What:** Screenshots cannot be attached to GitHub issues via the REST API (confirmed — no such endpoint exists). Instead, convert the screenshot canvas to base64 PNG and push it to a dedicated `kwaczek/bug-assets` repository using the GitHub Contents API. The file URL is then embedded as markdown `![]()` in the issue body.

**When to use:** Any time screenshot capture is enabled in the widget. This avoids external storage (Cloudinary, S3) and keeps everything within the GitHub ecosystem at zero cost.

**Trade-offs:** The bug-assets repo will grow over time — add a periodic cleanup script or use a shallow repo strategy. File URL format is `https://raw.githubusercontent.com/kwaczek/bug-assets/main/screenshots/<uuid>.png`.

**Confidence:** MEDIUM — GitHub Contents API for file creation is well-documented. The workaround for issue image attachment is confirmed by community discussion. The raw.githubusercontent.com URL approach is standard practice.

**Example:**
```typescript
// Upload via Contents API, then reference in issue body
async function uploadScreenshot(base64: string, filename: string): Promise<string> {
  await octokit.repos.createOrUpdateFileContents({
    owner: 'kwaczek',
    repo: 'bug-assets',
    path: `screenshots/${filename}`,
    message: `Add screenshot ${filename}`,
    content: base64,
  });
  return `https://raw.githubusercontent.com/kwaczek/bug-assets/main/screenshots/${filename}`;
}
```

## Data Flow

### Report Submission Flow

```
User clicks bug button in widget
    ↓
html2canvas captures screenshot → base64 PNG
    ↓
User fills title + description in modal
    ↓
Widget POSTs { title, description, url, screenshot_b64, project_id } to /report
    ↓
Service: rate limit check (per IP, max 5/hour)
    ↓
Service: upload screenshot to bug-assets repo → get raw URL
    ↓
Service: create GitHub issue in correct project repo
         body = description + screenshot markdown + reporter URL
         labels = ["bug", "auto-reported"]
    ↓
Service: respond 201 to widget → widget shows success toast
    ↓
[GitHub fires 'issues' webhook to /webhook]
```

### Triage & Fix Flow

```
GitHub webhook: issues.opened event
    ↓
Service: verify HMAC-SHA256 signature (reject if invalid)
    ↓
Service: respond 200 immediately
    ↓ (async)
AI Triage: evaluate issue title + body
           → { decision: 'fix' | 'review' | 'spam', confidence: 0-1, reason: string }
    ↓
if decision === 'spam':
    GitHub: close issue + add label "spam"
    DONE

if decision === 'fix' (confidence > 0.8):
    Ralph Bridge: write fix_plan.md to projects/<name>/fix_plan.md
    Ralph Bridge: ralph --monitor (already running, picks up new plan)
    Telegram: notify "Auto-fixing: <issue title>"
    WAIT for Ralph to push to main → CI/CD deploys

if decision === 'review' (confidence 0.4-0.8):
    Telegram: send message with inline keyboard [Approve Fix] [Reject]
    state.pendingApprovals.set(issueId, { chatId, messageId })
    WAIT for human response
        → Approve: same as 'fix' path above
        → Reject: close issue + add label "wont-fix"
```

### Telegram Approve/Reject Flow

```
Human receives Telegram message: "Review needed: <title>"
    + [Approve Fix] [Reject] inline keyboard
    ↓
Human taps [Approve Fix]
    ↓
grammY fires callback_query handler
    ↓
state.pendingApprovals.get(issueId) → retrieve context
    ↓
Ralph Bridge: write fix_plan.md
    ↓
Telegram: answerCallbackQuery() + edit message "Approved — Ralph is on it"
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-10 projects, 1-50 reports/day | Current monolith is fine. In-memory state for pending approvals. No queue needed. |
| 10-50 projects, 50-500 reports/day | Add Redis for rate limiting (replace in-memory store) and pending approvals (survives restarts). Still monolith. |
| 50+ projects, 500+ reports/day | Extract AI triage to a queue (BullMQ + Redis). Split Telegram bot to its own Railway service. Add webhook delivery retry tracking. |

### Scaling Priorities

1. **First bottleneck:** In-memory rate limiter doesn't survive restarts and doesn't work across multiple Railway replicas. Fix: swap `express-rate-limit` memory store for Redis store (`rate-limit-redis`).
2. **Second bottleneck:** Pending approvals lost on restart (Telegram shows buttons but bot forgets context). Fix: persist to Redis or a JSON file on Railway's volume.

## Anti-Patterns

### Anti-Pattern 1: Processing Webhooks Synchronously

**What people do:** Call the AI API, write fix_plan.md, and send Telegram messages all within the webhook handler before responding.
**Why it's wrong:** GitHub retries webhooks that don't respond within 10 seconds. AI calls routinely take 5-15 seconds. The service will receive duplicate webhook deliveries and process the same bug multiple times.
**Do this instead:** Respond 200 immediately, then run all processing in a detached async function. Use a deduplication check (issue ID already seen?) to guard against retries.

### Anti-Pattern 2: Widget Directly Triggers the Fix Pipeline

**What people do:** Skip GitHub issue creation and have the widget POST directly to a "create fix_plan" endpoint.
**Why it's wrong:** Loses the audit trail entirely. No human can review what was reported. Spam goes straight to Ralph with no filter. GitHub Issues becomes useless.
**Do this instead:** Widget → GitHub Issue → Webhook → Pipeline. The issue is the source of truth.

### Anti-Pattern 3: Per-Project Backend Service

**What people do:** Deploy a separate backend for each project being monitored.
**Why it's wrong:** Multiplies operational burden by N. Each project needs its own Railway service, env vars, webhook registration, and Telegram bot.
**Do this instead:** One centralized service for all projects. The `project_id` in the widget tag tells the service which GitHub repo to create the issue in.

### Anti-Pattern 4: Storing Secrets in Widget Bundle

**What people do:** Embed the GitHub token or service API key directly in the compiled widget.js.
**Why it's wrong:** widget.js is publicly served — anyone can extract and abuse the token. GitHub tokens with issues:write can do significant damage.
**Do this instead:** Widget only knows the service URL and a public project slug. All secrets stay on the server.

### Anti-Pattern 5: Skipping Webhook Signature Verification

**What people do:** Accept any POST to /webhook without checking the GitHub HMAC-SHA256 signature.
**Why it's wrong:** Anyone who knows the webhook URL can forge "issue created" events and trigger Ralph to run arbitrary fix plans.
**Do this instead:** Verify `X-Hub-Signature-256` on every webhook request before processing. Reject with 401 if invalid.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| GitHub Issues API | @octokit/rest, PAT (personal access token) | Token scoped to issues:write + contents:write on project repos + bug-assets repo |
| GitHub Webhooks | HMAC-SHA256 verified POST receiver at /webhook | Register one webhook per project repo pointing to the Railway service URL |
| Telegram Bot API | grammY long polling (`bot.start()`) in same Railway process | Use inline keyboard with callback_query for approve/reject |
| OpenAI / Anthropic | HTTP API call in triage service | Use structured output (JSON mode) for reliable decision parsing |
| Ralph CLI | File system write to `projects/<name>/fix_plan.md` | Ralph must already be running (`ralph --monitor`) — the service writes the file, Ralph detects change |
| html2canvas | Browser-side JS library bundled into widget.js | v1.4.1 stable (April 2025). Known limitation: cross-origin iframes are not captured |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Widget → Service | HTTPS POST (JSON + base64 screenshot) | Widget must send to absolute URL; service needs CORS header for all origins |
| Service → Ralph | Local filesystem write | Only works when service and Ralph run on the same machine — acceptable for this setup where Ralph is local and service is on Railway. Means fix_plan.md write must happen on the local machine, not Railway. See note below. |
| GitHub → Service | HTTPS webhook POST | Register in each project repo's Settings → Webhooks |
| Telegram → Service | grammY long polling (outbound from service) | No inbound URL needed for bot |

### Critical Note: Ralph Bridge Architecture

Ralph runs locally at `/Users/miro/Workspace/PERSONAL/ralph-workspace/`. The centralized service runs on Railway (remote). These are different machines.

**This means:** The service on Railway cannot directly write `fix_plan.md` to the local filesystem.

**Resolution options (choose one at build time):**

1. **Recommended: Local tunnel or local service component.** Run a tiny local HTTP server on the Ralph machine that accepts authenticated POST requests from the Railway service and writes `fix_plan.md`. The Railway service sends the fix plan payload; the local server writes the file and triggers `ralph`.

2. **Alternative: GitHub-mediated.** The Railway service commits `fix_plan.md` to the project's GitHub repo. A GitHub Action triggers on that file change and runs Ralph in a cloud runner. This removes local dependency but moves Ralph to CI.

3. **Alternative: Ralph on Railway.** Run Ralph itself on Railway (requires the repo to be checked out there). Adds complexity and Railway cost.

**Option 1 is recommended** because it keeps Ralph local (consistent with existing workflow) and adds only one small component (a local relay server, ~50 lines of Node.js).

```
Railway service → POST /fix-plan { project, plan_content } (with secret token)
    ↓
Local relay server (localhost:PORT, exposed via ngrok or Cloudflare Tunnel)
    ↓
Writes projects/<name>/fix_plan.md
    ↓
Ralph --monitor picks up file change, executes fix
```

## Sources

- Sentry feedback widget architecture: [develop.sentry.dev](https://develop.sentry.dev/application-architecture/feedback-architecture/) — HIGH confidence, official Sentry dev docs
- GitHub REST API — no issue attachment endpoint: [community discussion #46951](https://github.com/orgs/community/discussions/46951) — HIGH confidence, confirmed by multiple users + official docs check
- grammY long polling vs webhooks: [grammy.dev/guide/deployment-types](https://grammy.dev/guide/deployment-types) — HIGH confidence, official grammY docs
- Webhook async processing best practice: [hookdeck.com/blog/webhooks-at-scale](https://hookdeck.com/blog/webhooks-at-scale) — MEDIUM confidence
- @octokit/webhooks for GitHub webhook signature verification: [github.com/octokit/webhooks.js](https://github.com/octokit/webhooks.js) — HIGH confidence, official GitHub SDK
- express-rate-limit: [npmjs.com/package/express-rate-limit](https://www.npmjs.com/package/express-rate-limit) — HIGH confidence
- html2canvas v1.4.1: [html2canvas.hertzen.com](https://html2canvas.hertzen.com/) — MEDIUM confidence (2025 version info from third-party article)
- GitHub Agentic Workflows / AI triage patterns: [github.com agentic workflows](https://github.github.com/gh-aw/patterns/issueops/) — MEDIUM confidence

---
*Architecture research for: Bug Report Pipeline — embeddable widget + centralized service + Telegram bot + Ralph CLI integration*
*Researched: 2026-03-01*
