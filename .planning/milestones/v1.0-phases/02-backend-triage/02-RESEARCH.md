# Phase 2: Backend + Triage - Research

**Researched:** 2026-03-01
**Domain:** Node.js/Express 5 backend service, AI triage with Anthropic SDK, GitHub API via Octokit, ImgBB image hosting, Railway deployment
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BACK-01 | Express 5 service receives bug reports at POST /report | Express 5 + Multer for multipart/form-data; verified patterns below |
| BACK-02 | Service uploads screenshots to ImgBB and embeds permanent URLs in issue body | ImgBB REST API v1 accepts base64; Buffer from Multer memoryStorage → base64 → POST |
| BACK-03 | Service rate-limits by IP (10 reports/IP/hour minimum) | express-rate-limit with `windowMs: 3600000, limit: 10`; trust proxy config for Railway |
| BACK-04 | Service maps project IDs to GitHub repos for correct issue routing | Static config map `{ projectId: { owner, repo } }` loaded from env or config file |
| BACK-05 | Service creates GitHub issues via Octokit with labels, screenshots, and metadata | `octokit.rest.issues.create()` with labels array and markdown body; verified pattern below |
| BACK-06 | Service registers and handles GitHub webhooks with HMAC signature verification | `@octokit/webhooks` provides `createNodeMiddleware()` + automatic verification; `express.raw()` for raw body |
| BACK-07 | Service deploys to Railway with always-on configuration | Railway auto-detects Node.js; bind to `process.env.PORT`; disable serverless in settings; `/health` endpoint |
| BACK-08 | Zero GitHub API calls originate from the browser — all through backend proxy | All Octokit calls live server-side only; widget only POSTs to `/report` |
| TRIA-01 | AI triage runs pre-issue — before GitHub issue creation, not after | Triage function called inside `/report` handler before `octokit.rest.issues.create()` |
| TRIA-02 | Triage produces three-lane output: auto-fix (>0.8), review (0.4-0.8), spam (<0.4) | Anthropic SDK structured output via `zodOutputFormat`; schema: `{ verdict, confidence, reasoning }` |
| TRIA-03 | Spam reports are discarded without creating a GitHub issue | Return early with `{ success: true, message: "Report received" }` when verdict is spam |
| TRIA-04 | Valid and uncertain reports create GitHub issues with triage labels | Labels: `["bug-report", "auto-fix"]` or `["bug-report", "needs-review"]` added at issue creation time |
</phase_requirements>

---

## Summary

Phase 2 builds a single Express 5 TypeScript service that acts as a backend proxy between the widget and GitHub. The service receives multipart FormData (matching the widget's `submitReport()` contract), uploads screenshots to ImgBB, runs AI triage via Anthropic Claude, and conditionally creates GitHub issues. All GitHub API calls are server-side only; the browser never touches `api.github.com`.

The triage pipeline is the critical ordering constraint: triage MUST run before `octokit.rest.issues.create()`. Spam reports exit early with `{ success: true }` — the widget gets a success response regardless. Valid and uncertain reports create issues with appropriate labels (`auto-fix` or `needs-review`). The webhook handler uses `@octokit/webhooks` for HMAC verification and emits typed events for Phase 3/4 consumers to register callbacks on.

Railway deployment requires binding to `process.env.PORT`, disabling the "Serverless" (sleep) feature in Railway settings, and exposing a `GET /health` endpoint. No Dockerfile or nixpacks config is needed — Railway auto-detects Node.js from `package.json`.

**Primary recommendation:** Build a monolithic Express 5 TypeScript service in a `backend/` package at project root; use Multer (memoryStorage) → ImgBB upload → Anthropic triage → Octokit issue creation as a sequential pipeline inside the `/report` handler; use `@octokit/webhooks` middleware for webhook reception with built-in HMAC verification.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | 5.x (^5.1.0) | HTTP server, routing, middleware | Required by BACK-01; v5 has native async error propagation |
| multer | ^1.4.5-lts.1 or ^2.0.0 | multipart/form-data parsing; file upload | Industry standard for Express file uploads |
| @octokit/rest | ^21.x | GitHub REST API client — create issues, labels | Official GitHub SDK; fully typed |
| @octokit/webhooks | ^13.x | Webhook HMAC verification + event routing | Official; provides `createNodeMiddleware()` for Express |
| @anthropic-ai/sdk | ^0.39.x | AI triage via Claude | Official Anthropic SDK; structured output via `zodOutputFormat` |
| express-rate-limit | ^7.x | IP-based rate limiting | Standard for Express; handles Railway proxy correctly |
| zod | ^3.x | Schema validation for triage output + request body | Used by `zodOutputFormat` helper in Anthropic SDK |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| typescript | ^5.x | Type safety | Always; project is TypeScript |
| tsx | ^4.x | TypeScript execution for dev | `npm run dev` — no compile step needed |
| dotenv | ^16.x | `.env` loading for local dev | Railway injects env vars; dotenv for local only |
| node-fetch or native fetch | Node 18+ built-in | ImgBB upload (FormData POST) | Node 18+ has built-in fetch; no extra package needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ImgBB for screenshots | GitHub Contents API | ImgBB: simpler, no extra GitHub token scope; GitHub Contents: permanent, no third-party dependency. STATE.md locked ImgBB for MVP. |
| `@octokit/webhooks` middleware | Raw `crypto.createHmac` + manual verify | `@octokit/webhooks` prevents forgetting `timingSafeEqual`; auto-handles body buffering |
| `zodOutputFormat` + `messages.parse` | Manual JSON prompting + JSON.parse | Structured output guarantees schema; no JSON parsing errors |
| `express-rate-limit` | Custom in-memory store | express-rate-limit handles edge cases (trust proxy, headers, 429 format) correctly |

**Installation:**
```bash
npm install express multer @octokit/rest @octokit/webhooks @anthropic-ai/sdk express-rate-limit zod dotenv
npm install -D typescript tsx @types/express @types/multer @types/node
```

---

## Architecture Patterns

### Recommended Project Structure
```
backend/
├── src/
│   ├── index.ts           # App entry point: start server, register middleware
│   ├── app.ts             # Express app factory (exported for testing)
│   ├── config.ts          # projectId → { owner, repo } map; env vars
│   ├── routes/
│   │   ├── report.ts      # POST /report handler
│   │   └── health.ts      # GET /health handler
│   ├── middleware/
│   │   ├── rateLimit.ts   # IP rate limit config
│   │   └── webhook.ts     # @octokit/webhooks middleware setup
│   ├── services/
│   │   ├── triage.ts      # Anthropic SDK triage → { verdict, confidence, reasoning }
│   │   ├── imgbb.ts       # Buffer[] → ImgBB upload → string[] URLs
│   │   └── github.ts      # Octokit issue creation + webhook registration
│   └── types.ts           # PendingApproval, TriageResult, ReportPayload interfaces
├── package.json
├── tsconfig.json
└── .env.example
```

### Pattern 1: Sequential Pipeline in /report Handler
**What:** Triage before issue creation — all steps in one async handler with early exit for spam
**When to use:** Always for the `/report` route

```typescript
// Source: verified from REQUIREMENTS.md TRIA-01 + Anthropic SDK structured output docs
import { Octokit } from "@octokit/rest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

const TriageResult = z.object({
  verdict: z.enum(["auto-fix", "review", "spam"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

// POST /report handler
app.post("/report", upload.array("screenshots", 10), async (req, res) => {
  const { projectId, subject, description, metadata } = req.body;
  const files = req.files as Express.Multer.File[];

  // 1. Triage FIRST (TRIA-01)
  const triageResult = await triageReport({ subject, description, metadata });

  // 2. Spam: discard silently (TRIA-03)
  if (triageResult.verdict === "spam") {
    return res.json({ success: true, message: "Report received" });
  }

  // 3. Upload screenshots to ImgBB (BACK-02)
  const screenshotUrls = await uploadScreenshots(files);

  // 4. Create GitHub issue (BACK-05)
  const repo = getRepo(projectId); // BACK-04
  const label = triageResult.verdict === "auto-fix" ? "auto-fix" : "needs-review"; // TRIA-04
  const { data: issue } = await octokit.rest.issues.create({
    owner: repo.owner,
    repo: repo.repo,
    title: subject,
    body: buildIssueBody({ description, screenshotUrls, metadata, triageResult }),
    labels: ["bug-report", label],
  });

  res.json({ success: true, message: "Report submitted" });
});
```

### Pattern 2: @octokit/webhooks Middleware for BACK-06
**What:** Register webhook handler with automatic HMAC verification
**When to use:** Webhook endpoint setup at service startup

```typescript
// Source: @octokit/webhooks official docs (https://github.com/octokit/webhooks.js)
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";

const webhooks = new Webhooks({ secret: process.env.GITHUB_WEBHOOK_SECRET! });

// Register Phase 3/4 callbacks here (empty in Phase 2)
webhooks.on("issues.labeled", async ({ payload }) => {
  // Phase 3/4: routing logic added via registered callbacks
});

// CRITICAL: Mount BEFORE express.json() on the webhook path
// The middleware reads raw body internally for HMAC verification
app.use(createNodeMiddleware(webhooks, { path: "/webhook/github" }));
```

**CRITICAL NOTE:** `createNodeMiddleware` handles raw body buffering internally. Do NOT add `express.json()` or `express.raw()` globally before this middleware — body stream can only be consumed once.

### Pattern 3: Rate Limiting with Trust Proxy (BACK-03)
**What:** Express-rate-limit configured for Railway's reverse proxy
**When to use:** All routes, especially `/report`

```typescript
// Source: express-rate-limit official docs (https://github.com/express-rate-limit/express-rate-limit)
import { rateLimit } from "express-rate-limit";

// MUST set trust proxy BEFORE rate limiter — Railway is a proxy
app.set("trust proxy", 1);

const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,                 // 10 requests per IP per hour
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many reports, please try again later" },
});

app.post("/report", reportLimiter, upload.array("screenshots", 10), handler);
```

### Pattern 4: ImgBB Upload from Buffer (BACK-02)
**What:** Multer memoryStorage gives Buffer; convert to base64 for ImgBB API
**When to use:** Every screenshot file in req.files

```typescript
// Source: ImgBB API v1 docs (https://api.imgbb.com/) + imgbb-uploader README
async function uploadToImgBB(buffer: Buffer, filename: string): Promise<string> {
  const base64 = buffer.toString("base64");
  const form = new URLSearchParams();
  form.append("key", process.env.IMGBB_API_KEY!);
  form.append("image", base64);
  form.append("name", filename);

  const res = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error(`ImgBB upload failed: ${res.status}`);
  const data = await res.json() as { data: { url: string } };
  return data.data.url;
}
```

### Pattern 5: Anthropic Structured Triage (TRIA-02)
**What:** Claude classifies reports into auto-fix/review/spam with confidence score
**When to use:** Before any issue creation in the /report handler

```typescript
// Source: Anthropic SDK TypeScript docs (https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md)
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TriageSchema = z.object({
  verdict: z.enum(["auto-fix", "review", "spam"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

async function triageReport(report: { subject: string; description: string; metadata: string }) {
  const message = await client.messages.parse({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: `Classify this bug report. Confidence > 0.8 = auto-fix (clear reproducible bug), 0.4-0.8 = review (ambiguous), < 0.4 = spam (nonsense/test/advertising).

Subject: ${report.subject}
Description: ${report.description}
Browser: ${report.metadata}`,
    }],
    output_config: { format: zodOutputFormat(TriageSchema) },
  });

  return message.parsed_output!;
}
// Verdict mapping: auto-fix > 0.8, review 0.4-0.8, spam < 0.4
// Note: Claude sets the confidence score; lane is determined by confidence threshold
```

### Pattern 6: GitHub Webhook Registration (BACK-06)
**What:** Programmatically register webhook so GitHub sends events to Railway service URL
**When to use:** Service startup (idempotent — check existing hooks first)

```typescript
// Source: GitHub REST API docs + octokit/rest.js search results
async function ensureWebhookRegistered(owner: string, repo: string, serviceUrl: string) {
  const existing = await octokit.rest.repos.listWebhooks({ owner, repo });
  const hookExists = existing.data.some(h => h.config.url === `${serviceUrl}/webhook/github`);

  if (!hookExists) {
    await octokit.rest.repos.createWebhook({
      owner, repo,
      name: "web",
      active: true,
      events: ["issues"],
      config: {
        url: `${serviceUrl}/webhook/github`,
        content_type: "json",  // REQUIRED — @octokit/webhooks doesn't support form-urlencoded
        secret: process.env.GITHUB_WEBHOOK_SECRET!,
        insecure_ssl: "0",
      },
    });
  }
}
```

### Pattern 7: PendingApproval Interface (Cross-phase contract)
**What:** Defined in Phase 2, consumed by Phase 4 Telegram bot
**When to use:** When verdict is "review" — store in memory Map pending Telegram approval

```typescript
// Source: ROADMAP.md cross-phase contract
interface PendingApproval {
  issueId: number;
  repo: { owner: string; repo: string };
  triageResult: TriageResult;
  reportData: { subject: string; description: string; screenshotUrls: string[]; metadata: string };
}

// In-memory store (Phase 4 will consume this)
// v2 upgrade: replace with Redis (PIPE-03)
const pendingApprovals = new Map<number, PendingApproval>();
```

### Anti-Patterns to Avoid
- **Global express.json() before webhook route:** Consumes the body stream; HMAC verification fails because raw body is gone. Apply body parsers per-route only.
- **Calling octokit from widget/browser:** Violates BACK-08. All Octokit calls are backend-only.
- **Creating GitHub issue before triage:** Violates TRIA-01. Triage runs first; spam exits early.
- **Using `===` for HMAC comparison:** Timing attack vulnerability. `@octokit/webhooks` handles this correctly with `timingSafeEqual` internally.
- **Not setting `trust proxy`:** Railway sits behind a reverse proxy; without this, rate limiting affects all users as if from one IP.
- **Multer diskStorage for screenshots:** Images need to be in memory (Buffer) for base64 conversion; disk adds unnecessary I/O.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multipart form parsing | Custom boundary parser | `multer` | Edge cases in multipart spec; content-type charset, encoding |
| HMAC webhook verification | `crypto.createHmac` + `===` | `@octokit/webhooks` | Timing attacks; raw body buffering; signature prefix handling |
| Rate limiting | In-memory counter | `express-rate-limit` | Proxy IP headers, 429 response format, window reset, headers spec |
| AI JSON parsing | `JSON.parse(aiResponse)` | `zodOutputFormat` + `messages.parse` | Claude doesn't always produce valid JSON; schema validation prevents crashes |
| GitHub issue body | Manual string concat | Template function | Markdown escaping; consistent format across triage verdicts |

**Key insight:** The webhook HMAC pipeline has 3 failure modes (wrong header extraction, string vs Buffer comparison, modified body) — `@octokit/webhooks` handles all three.

---

## Common Pitfalls

### Pitfall 1: Body Stream Double-Consumption
**What goes wrong:** Webhook HMAC verification fails because body was already consumed by `express.json()` or `express.urlencoded()`.
**Why it happens:** Node.js HTTP request bodies are streams; once read, they cannot be re-read.
**How to avoid:** Mount `@octokit/webhooks` middleware (which buffers its own body) BEFORE any global body parsers. Apply `multer` and `express.json()` only to specific non-webhook routes.
**Warning signs:** `webhooks.verify()` returns false even with correct secret; triage/issue handler never executes.

### Pitfall 2: Railway Trust Proxy Not Set
**What goes wrong:** All requests appear to come from the Railway load balancer IP; rate limiter blocks all users after the first 10 requests.
**Why it happens:** Railway sits behind a reverse proxy; `req.ip` is the proxy IP without `trust proxy` setting.
**How to avoid:** `app.set('trust proxy', 1)` immediately after `const app = express()`.
**Warning signs:** Rate limit triggers immediately for unrelated users; `req.ip` shows Railway internal IP.

### Pitfall 3: ImgBB Rate Limits (Unknown)
**What goes wrong:** Under load, ImgBB rejects uploads silently.
**Why it happens:** ImgBB free tier rate limits are undocumented (noted in STATE.md blockers).
**How to avoid:** Implement graceful degradation — if ImgBB upload fails, create GitHub issue with "screenshot unavailable" placeholder; do not block report submission.
**Warning signs:** 400/429 responses from `api.imgbb.com`; screenshots missing from issues.

### Pitfall 4: Triage Model Reliability for Edge Cases
**What goes wrong:** Claude returns a confidence score that doesn't map cleanly to a lane, or the parsed_output is null.
**Why it happens:** LLM outputs can be unexpected despite structured output.
**How to avoid:** Default to "review" lane when `parsed_output` is null or confidence is exactly at boundary. Wrap `client.messages.parse()` in try/catch — treat parse failure as confidence 0.5 ("review").
**Warning signs:** `parsed_output` is null; TypeScript null-checks fail at runtime.

### Pitfall 5: Railway Port Binding
**What goes wrong:** Service starts but health check fails; Railway marks deployment as failed.
**Why it happens:** Service binds to hardcoded port (3000) but Railway injects a different `PORT`.
**How to avoid:** Always `const port = process.env.PORT ?? 3000; app.listen(port)`.
**Warning signs:** Health check timeout after 300s; deployment marked as failed despite service logging "listening on port 3000".

### Pitfall 6: GitHub Labels Must Exist Before Issue Creation
**What goes wrong:** `octokit.rest.issues.create()` with labels silently ignores non-existent labels (or returns 422).
**Why it happens:** GitHub requires labels to be created in the repo before they can be applied.
**How to avoid:** Service startup ensures labels `bug-report`, `auto-fix`, `needs-review` exist via `octokit.rest.issues.createLabel()` (idempotent: catch 422 "already exists").
**Warning signs:** Issues created without labels; no error thrown.

### Pitfall 7: Webhook content_type Must Be "json"
**What goes wrong:** `@octokit/webhooks` fails to parse payload.
**Why it happens:** If webhook is registered with `content_type: "form"`, GitHub sends URL-encoded body; `@octokit/webhooks` expects JSON.
**How to avoid:** Always set `content_type: "json"` when calling `octokit.rest.repos.createWebhook()`.
**Warning signs:** Webhook events received but event handlers never fire.

---

## Code Examples

### Issue Body Template
```typescript
// Source: cross-phase contract from ROADMAP.md + metadata from widget/src/types.ts
function buildIssueBody(args: {
  description: string;
  screenshotUrls: string[];
  metadata: BugMetadata;
  triageResult: TriageResult;
}): string {
  const screenshots = args.screenshotUrls
    .map((url, i) => `![Screenshot ${i + 1}](${url})`)
    .join("\n");

  return `## Bug Report

${args.description}

## Screenshots

${screenshots || "_No screenshots attached_"}

## Environment

| Property | Value |
|----------|-------|
| URL | ${args.metadata.url} |
| Browser | ${args.metadata.userAgent} |
| Screen | ${args.metadata.screenWidth}x${args.metadata.screenHeight} |
| Language | ${args.metadata.language} |
| Timestamp | ${args.metadata.timestamp} |

## Triage

| Property | Value |
|----------|-------|
| Verdict | ${args.triageResult.verdict} |
| Confidence | ${args.triageResult.confidence.toFixed(2)} |
| Reasoning | ${args.triageResult.reasoning} |
`;
}
```

### Health Check Endpoint (BACK-07)
```typescript
// Source: Railway docs (https://docs.railway.com/guides/healthchecks)
app.get("/health", (_, res) => res.status(200).json({ status: "ok" }));
```

### FormData Widget Contract (what backend receives)
The widget sends `multipart/form-data` with these fields (from `widget/src/submit.ts`):
- `projectId` (string)
- `subject` (string)
- `description` (string)
- `metadata` (JSON string — parse with `JSON.parse(req.body.metadata)`)
- `screenshots` (file[] — field name `"screenshots"`; auto-screenshot named `screenshot-auto.jpg`, attached named `screenshot-{i}.png`)

Use `upload.array("screenshots", 10)` — NOT `upload.fields()` — because the widget uses a single field name with multiple values.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Express 4 + manual async error handling | Express 5 native async propagation | v5.1.0 (2024) | No need for `try/catch` in every route; unhandled promise rejections auto-propagate to error handler |
| Manual JSON schema prompting + `JSON.parse` | `zodOutputFormat` + `client.messages.parse()` | Anthropic SDK 0.39+ | Guaranteed typed output; parse errors caught at SDK level |
| Webhooks.js separate package | `@octokit/webhooks` unified package | 2022 | Single package handles verification + event routing |
| Deprecated `body-parser` package | `express.json()` / `express.raw()` built-in | Express 4.16+ | body-parser is bundled; no separate install needed |

**Deprecated/outdated:**
- `express-rate-limit` `max` option: replaced by `limit` in v7+. Don't use `max`.
- `bodyParser` standalone package: use `express.json()` built-in.
- `multer` `fileFilter` for type validation: handle in route handler instead for better error messages.

---

## Open Questions

1. **ImgBB rate limits under load**
   - What we know: ImgBB free tier exists; no documented rate limits
   - What's unclear: Requests per minute/day; whether buffer-to-base64 approach hits multipart size limits
   - Recommendation: Implement graceful fallback (skip screenshot embedding if upload fails); add retry with 1s delay

2. **GitHub label creation timing**
   - What we know: Labels must exist before being applied to issues
   - What's unclear: Whether labels should be created once at startup or per-repo lazily
   - Recommendation: Create labels at startup for all configured repos; wrap in try/catch for "already exists" (422)

3. **Railway environment variable for service URL**
   - What we know: Railway injects `RAILWAY_PUBLIC_DOMAIN` for services with a public URL
   - What's unclear: Whether this is always set; exact format
   - Recommendation: Configure `SERVICE_URL` as explicit env var in Railway dashboard; use it for webhook registration

4. **Webhook registration idempotency**
   - What we know: `octokit.rest.repos.listWebhooks()` can check existing hooks
   - What's unclear: If multiple rapid restarts could create duplicate webhooks
   - Recommendation: Check by URL match before creating; a single webhook per repo URL is sufficient

---

## Sources

### Primary (HIGH confidence)
- `/websites/expressjs_en_5x` (Context7) — Express 5 routing, middleware, error handling
- `/expressjs/multer` (Context7) — memoryStorage, `upload.array()`, `req.files`
- `/octokit/rest.js` (Context7) — `issues.create`, `repos.createWebhook`, authentication
- `/anthropics/anthropic-sdk-typescript` (Context7) — `zodOutputFormat`, `messages.parse`, structured output
- `/express-rate-limit/express-rate-limit` (Context7) — rate limit config, trust proxy
- https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries — HMAC verification, `X-Hub-Signature-256` header
- https://github.com/octokit/webhooks.js — `createNodeMiddleware()`, `webhooks.on()`, Express integration
- https://api.imgbb.com/ — API endpoint, request format, response format

### Secondary (MEDIUM confidence)
- https://docs.railway.com/guides/healthchecks — Health check endpoint requirements, timeout, PORT env var
- https://docs.railway.com/guides/deploy-node-express-api-with-auto-scaling-secrets-and-zero-downtime — Railway auto-detect, start command, zero-config deployment
- https://station.railway.com (multiple) — Serverless sleep policy; disable for always-on
- https://github.com/TheRealBarenziah/imgbb-uploader/blob/master/README.md — base64string upload, Node-only caveat

### Tertiary (LOW confidence)
- ImgBB rate limits: undocumented — validate under load before production

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified via Context7 or official docs
- Architecture: HIGH — patterns derived from official library examples and widget source contract
- Pitfalls: HIGH — trust proxy, body stream consumption, and label creation issues are well-documented
- ImgBB rate limits: LOW — undocumented; flagged as open question

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (Anthropic SDK and express-rate-limit are fast-moving; re-verify versions before implementation)
