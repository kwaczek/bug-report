---
phase: 02-backend-triage
verified: 2026-03-01T20:30:00Z
status: human_needed
score: 12/12 must-haves verified
re_verification: true
  previous_status: gaps_found
  previous_score: 11/12
  gaps_closed:
    - "The Railway service restarts automatically and stays always-on; health check returns 200 (BACK-07)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Submit a clear spam report (e.g. subject: 'asdfjkl', description: 'test test') via the widget pointing at the backend"
    expected: "Response is 200 with { success: true, message: 'Report received' }, no GitHub issue created in the project repo, and backend logs show triage verdict 'spam'"
    why_human: "Cannot verify AI triage output or GitHub issue absence without live API keys and a running server"
  - test: "Submit a legitimate bug report with a specific subject and description of a reproducible issue"
    expected: "GitHub issue created in the correct project repo with labels 'bug-report' and 'auto-fix' or 'needs-review', issue body contains environment table, triage section, and any screenshot URLs"
    why_human: "Requires live GITHUB_TOKEN, IMGBB_API_KEY, ANTHROPIC_API_KEY and a configured PROJECT_MAP"
  - test: "Send more than 10 POST /report requests from the same IP within one hour"
    expected: "Requests 1-10 succeed with 200; request 11 returns 429 with { success: false, message: 'Too many reports...' }"
    why_human: "Requires a live server with trust proxy configured correctly for the test environment"
  - test: "POST a GitHub webhook event to /webhook/github with a valid HMAC-SHA256 signature, then repeat with an invalid signature"
    expected: "Valid signature: 200 response. Invalid signature: 400 or 401 response. Verify in server logs that HMAC check ran."
    why_human: "Requires GITHUB_WEBHOOK_SECRET set and live server; HMAC behavior cannot be fully traced statically"
---

# Phase 02: Backend + Triage Verification Report

**Phase Goal:** Bug reports submitted by the widget are triaged by AI before any GitHub issue is created — spam is silently discarded, valid/uncertain reports become properly labeled GitHub issues in the correct project repo
**Verified:** 2026-03-01T20:30:00Z
**Status:** human_needed — all 12/12 automated checks pass; 4 items require live credentials to confirm end-to-end behavior
**Re-verification:** Yes — after gap closure via Plan 02-04 (created `backend/railway.toml`)

---

## Re-Verification Summary

**Previous status:** gaps_found (11/12, BACK-07 missing railway.toml)
**Current status:** human_needed (12/12, no automated gaps remain)

### Gap Closed

**BACK-07 — Railway deployment configuration**

- Commit `ee4b130` created `backend/railway.toml` (10 lines, substantive)
- Commit touched only `backend/railway.toml` — zero source file modifications
- All 11 previously-passing truths confirmed regression-free (source files unmodified by 02-04)

### Regressions

None. The 02-04 commit exclusively added `backend/railway.toml`.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `npm run dev` in backend/ starts an Express 5 server on PORT | VERIFIED | `backend/src/index.ts` calls `createApp()` then `app.listen(port)`. `package.json` scripts.dev = `tsx watch src/index.ts`. Express 5.1.0 in dependencies. |
| 2 | GET /health returns 200 with { status: 'ok' } | VERIFIED | `backend/src/routes/health.ts` L5-7: GET "/" returns `res.status(200).json({ status: "ok" })`. Mounted via `app.use("/health", healthRouter)` in `app.ts`. |
| 3 | Project ID mapping loadable from PROJECT_MAP env var | VERIFIED | `backend/src/config.ts`: `loadProjectsFromEnv()` parses `"projectId:owner/repo"` format. Called at startup in `index.ts`. `getRepo()` and `getAllRepos()` exported. |
| 4 | All shared types (TriageResult, ReportPayload, PendingApproval, ProjectConfig, BugMetadata) are importable from types.ts | VERIFIED | `backend/src/types.ts`: all five interfaces exported. TypeScript compiles cleanly (tsc --noEmit). |
| 5 | uploadToImgBB() converts a Buffer to base64 and POSTs to api.imgbb.com | VERIFIED | `imgbb.ts`: `buffer.toString("base64")`, `fetch("https://api.imgbb.com/1/upload", ...)`. Returns `json.data.url`. |
| 6 | uploadScreenshots() uses Promise.allSettled and returns placeholder on failure | VERIFIED | `imgbb.ts`: `Promise.allSettled(...)`, rejected branches return `"[screenshot unavailable]"`. |
| 7 | triageReport() sends subject+description+metadata to Claude and returns TriageResult | VERIFIED | `triage.ts`: `client.messages.create({model:"claude-sonnet-4-5",...})`. Response validated via `TriageSchema.safeParse()`. Returns validated.data. |
| 8 | triageReport() defaults to 'review' verdict when AI parse fails | VERIFIED | `triage.ts`: `FALLBACK = {verdict:"review", confidence:0.5, ...}`. Entire function body in try/catch returning FALLBACK on any error. |
| 9 | createGitHubIssue() creates issue with markdown body and verdict labels | VERIFIED | `github.ts`: `octokit.rest.issues.create({..., labels:["bug-report", verdictLabel]})`. `buildIssueBody()` generates Bug Report + Screenshots + Environment + Triage sections. |
| 10 | POST /report accepts multipart FormData, runs triage before issue creation, returns { success: true } | VERIFIED | `report.ts` L72: `triageReport()` called before `createGitHubIssue()` at L89. Spam exits at L79 before any upload or issue creation. |
| 11 | Rate limiter enforces 10 requests/IP/hour and returns 429 | VERIFIED | `rateLimit.ts`: `windowMs:3600000, limit:10`. Mounted in `app.ts` before reportRouter. `trust proxy:1` set. |
| 12 | The Railway service restarts automatically and stays always-on; health check returns 200 | VERIFIED | `backend/railway.toml` (commit ee4b130): `builder=NIXPACKS`, `startCommand="npm start"`, `healthcheckPath="/health"`, `restartPolicyType="ON_FAILURE"`, `restartPolicyMaxRetries=10`. `npm start` in `package.json` = `node --import tsx src/index.ts` — exact match to startCommand. |

**Score:** 12/12 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/package.json` | Express 5 project with all dependencies | VERIFIED | All runtime + devDeps present. ESM type:module. |
| `backend/tsconfig.json` | ES2022/ESNext strict TypeScript | VERIFIED | target:ES2022, module:ESNext, strict:true |
| `backend/.env.example` | All env vars documented | VERIFIED | PORT, GITHUB_TOKEN, GITHUB_WEBHOOK_SECRET, IMGBB_API_KEY, ANTHROPIC_API_KEY, SERVICE_URL |
| `backend/src/types.ts` | 5 shared interfaces | VERIFIED | BugMetadata, TriageResult, ReportPayload, ProjectConfig, PendingApproval all exported |
| `backend/src/config.ts` | getRepo(), getAllRepos(), loadProjectsFromEnv() | VERIFIED | All three functions exported and substantive |
| `backend/src/app.ts` | Express app factory, full middleware wiring | VERIFIED | createApp() exported; webhook -> CORS -> express.json -> /report order confirmed |
| `backend/src/index.ts` | Server entry point with startup label ensurance | VERIFIED | loadProjectsFromEnv(), createApp(), app.listen() with ensureLabelsExist() per repo |
| `backend/src/routes/health.ts` | healthRouter GET / -> 200 | VERIFIED | Substantive, wired via app.use("/health", healthRouter) |
| `backend/src/routes/report.ts` | POST /report triage-first pipeline | VERIFIED | 131 lines, full pipeline with spam exit, pendingApprovals Map exported |
| `backend/src/middleware/rateLimit.ts` | reportLimiter 10/IP/hour | VERIFIED | Substantive, wired via app.use("/report", reportLimiter, ...) |
| `backend/src/middleware/webhook.ts` | HMAC webhook middleware with lazy init | VERIFIED | 60 lines, lazy getWebhooks() pattern, getWebhooksInstance() exported for Phase 3 |
| `backend/src/services/imgbb.ts` | uploadToImgBB + uploadScreenshots | VERIFIED | 79 lines, Promise.allSettled pattern, placeholder on failure |
| `backend/src/services/triage.ts` | triageReport with zod validation and fallback | VERIFIED | 83 lines, TriageSchema, full try/catch, FALLBACK constant |
| `backend/src/services/github.ts` | buildIssueBody + createGitHubIssue + ensureLabelsExist | VERIFIED | 163 lines, all three functions exported and substantive |
| `backend/railway.toml` | Railway deployment configuration | VERIFIED | 10 lines: NIXPACKS builder, npm start command, /health check, ON_FAILURE restart, 10 max retries, 300s healthcheck timeout. Commit ee4b130. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `index.ts` | `app.ts` | `import createApp` | WIRED | L2: `import { createApp } from "./app.js"`, called L9 |
| `app.ts` | `routes/health.ts` | `app.use("/health", healthRouter)` | WIRED | L1 imports healthRouter, L14 mounts it |
| `app.ts` | `middleware/webhook.ts` | mounted BEFORE express.json() | WIRED | L5 imports webhookMiddleware, L20 mounts it; express.json() at L34 |
| `app.ts` | `routes/report.ts` + `middleware/rateLimit.ts` | `app.use("/report", reportLimiter, reportRouter)` | WIRED | L3-4 imports both, L39 mounts with correct order |
| `routes/report.ts` | `services/triage.ts` | `triageReport()` called FIRST | WIRED | L5 imports triageReport, L72 calls it; createGitHubIssue not called until L89 |
| `routes/report.ts` | `services/imgbb.ts` | `uploadScreenshots()` after triage passes | WIRED | L4 imports uploadScreenshots, L86 calls it after spam-exit guard |
| `routes/report.ts` | `services/github.ts` | `createGitHubIssue()` after screenshots | WIRED | L6 imports createGitHubIssue, L89 calls it after uploadScreenshots |
| `index.ts` | `services/github.ts` | `ensureLabelsExist()` at startup | WIRED | L4 imports ensureLabelsExist, L20 calls it inside app.listen callback |
| `services/triage.ts` | Anthropic API | `client.messages.create()` with zod validation | WIRED | `client.messages.create({model:"claude-sonnet-4-5",...})`, TriageSchema.safeParse() |
| `services/imgbb.ts` | api.imgbb.com | `fetch POST with base64 image` | WIRED | `fetch("https://api.imgbb.com/1/upload", {method:"POST", body:params})` |
| `services/github.ts` | GitHub API | `octokit.rest.issues.create()` | WIRED | `octokit.rest.issues.create({owner, repo, title, body, labels})` |
| `railway.toml` | `backend/` npm start | `startCommand = "npm start"` | WIRED | railway.toml startCommand = "npm start"; package.json scripts.start = "node --import tsx src/index.ts" — exact match |
| `railway.toml` | `routes/health.ts` | `healthcheckPath = "/health"` | WIRED | railway.toml healthcheckPath = "/health"; healthRouter mounted at app.use("/health", ...) in app.ts |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| BACK-01 | 02-01, 02-03 | Express 5 service receives bug reports at POST /report | SATISFIED | `routes/report.ts` implements POST /report; `app.ts` mounts it; Express 5.1.0 installed |
| BACK-02 | 02-02 | Service uploads screenshots to ImgBB and embeds permanent URLs in issue body | SATISFIED | `services/imgbb.ts` uploads to api.imgbb.com; `buildIssueBody()` embeds URLs in markdown |
| BACK-03 | 02-03 | Service rate-limits by IP (10 reports/IP/hour minimum) | SATISFIED | `rateLimit.ts` limit:10 windowMs:3600000; `trust proxy:1` for correct IP behind Railway |
| BACK-04 | 02-01 | Service maps project IDs to GitHub repos for correct issue routing | SATISFIED | `config.ts` getRepo() + loadProjectsFromEnv() provide ID->repo mapping |
| BACK-05 | 02-02, 02-03 | Service creates GitHub issues via Octokit with labels, screenshots, and metadata | SATISFIED | `github.ts` createGitHubIssue() applies ["bug-report", verdictLabel]; buildIssueBody() includes screenshots and metadata table |
| BACK-06 | 02-03 | Service registers and handles GitHub webhooks with HMAC signature verification | SATISFIED | `webhook.ts` uses @octokit/webhooks createNodeMiddleware which verifies HMAC-SHA256 on every delivery |
| BACK-07 | 02-01, 02-04 | Service deploys to Railway with always-on configuration | SATISFIED | `backend/railway.toml` (commit ee4b130): NIXPACKS builder, startCommand="npm start", healthcheckPath="/health", restartPolicyType="ON_FAILURE", restartPolicyMaxRetries=10. Gap closed by Plan 02-04. |
| BACK-08 | 02-01, 02-03 | Zero GitHub API calls originate from the browser | SATISFIED | No api.github.com references in widget/src/. All Octokit calls are in backend/src/services/github.ts. |
| TRIA-01 | 02-02, 02-03 | AI triage runs pre-issue — before GitHub issue creation, not after | SATISFIED | `report.ts` L72 calls triageReport() before L89 calls createGitHubIssue(); spam exits at L79 before any side effects |
| TRIA-02 | 02-02 | Triage produces three-lane output: auto-fix (>0.8), review (0.4-0.8), spam (<0.4) | SATISFIED | `triage.ts` TriageSchema validates verdict as enum ["auto-fix","review","spam"]; system prompt defines three-lane thresholds |
| TRIA-03 | 02-03 | Spam reports are discarded without creating a GitHub issue | SATISFIED | `report.ts` L79-82: `if (triageResult.verdict === "spam") { res.json({success:true,...}); return; }` — exits before uploadScreenshots or createGitHubIssue |
| TRIA-04 | 02-02, 02-03 | Valid and uncertain reports create GitHub issues with triage labels | SATISFIED | `github.ts` L87-98: verdictLabel = "auto-fix" or "needs-review"; labels:["bug-report", verdictLabel] applied at issue creation |

**All 12 requirement IDs satisfied. No orphaned requirements.**

Notes:
- TRIA-05 (triage decisions logged with model reasoning): Mapped to Phase 3 in REQUIREMENTS.md. Not claimed by any Phase 2 plan. Correctly deferred — not a Phase 2 gap.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `imgbb.ts` | 54, 58 | Word "placeholder" in JSDoc comments | Info | JSDoc documentation language only — not a stub or TODO. No impact. |
| `webhook.ts` | 39 | Comment: "Phase 3/4 will register event callbacks here" | Info | Expected extension point for future phases. Phase 2 contract is complete. |
| `config.ts` | 7-9 | `projects` starts as empty `{}` | Info | By design — loaded at runtime via PROJECT_MAP env var. `loadProjectsFromEnv()` is wired at startup. |

No blocker anti-patterns found. No new anti-patterns introduced by Plan 02-04 (file is pure TOML config with no code).

---

## Human Verification Required

### 1. Spam Triage End-to-End

**Test:** Submit a clearly spam report (e.g. subject "asdf", description "lkjhgf qwerty") through the widget pointing at the running backend with a configured PROJECT_MAP and ANTHROPIC_API_KEY.
**Expected:** HTTP 200 returned to widget, no GitHub issue created in the target repo, backend logs show `[triage]` verdict "spam".
**Why human:** Cannot verify AI model response or GitHub issue absence without live credentials.

### 2. Legitimate Bug Report Issue Creation

**Test:** Submit a detailed bug report (clear subject, steps to reproduce) via the widget.
**Expected:** GitHub issue created in the correct project repo with labels "bug-report" and either "auto-fix" or "needs-review", issue body contains screenshot image embeds, an Environment table with URL/browser/screen/language/timestamp, and a Triage table with verdict/confidence/reasoning.
**Why human:** Requires live ANTHROPIC_API_KEY, GITHUB_TOKEN, IMGBB_API_KEY, and PROJECT_MAP.

### 3. Rate Limiting Enforcement

**Test:** Send 11 POST /report requests from the same IP within one hour to the running server.
**Expected:** Requests 1-10 return 200. Request 11 returns 429 with `{ success: false, message: "Too many reports, please try again later" }`.
**Why human:** Requires a live server with correct Railway reverse proxy or local `trust proxy:1` configuration.

### 4. Webhook HMAC Signature Verification

**Test:** POST a simulated GitHub issues.labeled webhook to `/webhook/github` with (a) a valid HMAC-SHA256 signature and (b) an invalid signature, with GITHUB_WEBHOOK_SECRET set.
**Expected:** Valid signature: 200. Invalid signature: 400 or 401 rejection with no processing.
**Why human:** Requires GITHUB_WEBHOOK_SECRET, computing HMAC manually to test both paths.

---

## Gap Closure Detail

**Gap from initial verification:** BACK-07 — Railway deployment configuration missing

**How it was closed (Plan 02-04, commit ee4b130):**

`backend/railway.toml` was created with:
- `builder = "NIXPACKS"` — auto-detects Node.js from package.json
- `buildCommand = "npm install"` — no separate tsc step (tsx handles TypeScript at runtime)
- `startCommand = "npm start"` — matches `package.json` scripts.start exactly (`node --import tsx src/index.ts`)
- `healthcheckPath = "/health"` — wired to the existing Express GET /health endpoint returning 200
- `healthcheckTimeout = 300` — accommodates npm install + server startup time in Railway environment
- `restartPolicyType = "ON_FAILURE"` — restarts on crashes, does not restart on clean SIGTERM during redeployment
- `restartPolicyMaxRetries = 10` — bounded retry count prevents unbounded restart loops

The `startCommand` to `package.json#scripts.start` link was confirmed directly. The `healthcheckPath` to `routes/health.ts` link was confirmed via `app.ts` mounting (`app.use("/health", healthRouter)`). No source files were modified — the 02-04 commit is a pure addition of the config artifact.

---

_Verified: 2026-03-01T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification after Plan 02-04 gap closure_
