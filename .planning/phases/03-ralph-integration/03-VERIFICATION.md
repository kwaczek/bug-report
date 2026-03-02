---
phase: 03-ralph-integration
verified: 2026-03-02T14:00:00Z
status: human_needed
score: 16/16 must-haves verified
re_verification: false
human_verification:
  - test: "Cloudflare Tunnel reachability from Railway to relay"
    expected: "POST to https://relay.botur.fun/fix (or configured tunnel URL) with valid RELAY_SECRET returns 202 from the local relay server"
    why_human: "RALF-03 is infrastructure — tunnel daemon must be running, DNS must resolve, Railway env must have RELAY_URL set. Cannot verify a live tunnel connection statically."
  - test: "End-to-end pipeline: widget submit -> fix_plan.md written with real codebase references"
    expected: "After submitting a bug report via widget, a fix_plan.md appears in projects/<repo>/.ralph/ with Claude's description of the specific bug (not a generic template)"
    why_human: "Requires running relay, running tunnel, and a real project directory. Verified live in post-checkpoint but depends on environment state."
  - test: "Ralph spawns and executes fix_plan.md checklist items"
    expected: "After fix_plan.md is written, Ralph is spawned and begins ticking off checklist items, ultimately committing and pushing a fix"
    why_human: "RALF-06 depends on Ralph being installed and the project having a working test suite. The relay correctly spawns ralph -- the execution outcome depends on runtime environment."
---

# Phase 3: Ralph Integration Verification Report

**Phase Goal:** Connect the bug report pipeline to Ralph — triage decisions trigger fix_plan.md generation and relay to local workspace for autonomous fixing.
**Verified:** 2026-03-02T14:00:00Z
**Status:** human_needed — all automated checks pass; 3 items need human/runtime verification
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every triage decision (auto-fix, review, spam) is logged with timestamp, verdict, confidence, and reasoning | VERIFIED | `appendTriageLog` called in spam path (line 83) with `issueId: null` and in non-spam path (line 112) with real `issueId`; both paths log all required fields |
| 2 | Log entries are append-only JSONL at the ralph-workspace root (triage.log) | VERIFIED | `triage-log.ts:19-34` uses `fs.appendFile(path.join(RALPH_WORKSPACE, 'triage.log'), line)` — append-only, never overwrites |
| 3 | Spam decisions are logged even though no GitHub issue is created | VERIFIED | `report.ts:81-93` — spam verdict logged with `issueId: null` BEFORE early return at line 92; no GitHub issue created |
| 4 | Backend POSTs to RELAY_URL when an auto-fix issue is created, with full triage context | VERIFIED | `report.ts:125-145` — `notifyRelay()` called fire-and-forget with `screenshotUrls`, `subject`, `description`, full `triageResult` |
| 5 | Backend issues.labeled webhook handler fires relay notification for auto-fix label | VERIFIED | `relay.ts:126-163` — `getWebhooksInstance().on('issues.labeled', ...)` checks `payload.label?.name === 'auto-fix'` then calls `notifyRelay()` |
| 6 | Missing RELAY_URL env var causes a console warning, not a crash | VERIFIED | `relay.ts:79-83` — `if (!relayUrl) { console.warn(...); return; }` — no throw |
| 7 | On relay delivery failure after retries (1, 5, 15, 30, 60 min), backend relabels issue from auto-fix to needs-review | VERIFIED | `relay.ts:31-68` — `RETRY_DELAYS_MS = [1,5,15,30,60]min`, after exhaustion calls `relabelIssue(owner, repo, issueId, 'auto-fix', 'needs-review')` |
| 8 | Relay server starts on configurable PORT and validates RELAY_SECRET on every request | VERIFIED | `relay/src/app.ts:14-35` — timing-safe Bearer auth middleware applied to ALL routes below health; `relay/src/index.ts:9` reads `process.env.PORT ?? '3001'` |
| 9 | POST /fix accepts a triage payload, deduplicates by issue ID, and returns 202 Accepted immediately | VERIFIED | `fix.ts:31-85` — Zod validates, `isDuplicate()` checked, `markSeen()` called, `enqueue()` fires async job, `res.status(202).json(...)` returned without awaiting queue |
| 10 | fix_plan.md is written to projects/<repoName>/.ralph/fix_plan.md in Ralph's verified format | VERIFIED | `fixplan.ts:63-78` — `appendToFixPlan` writes to `resolveProjectDir(repoName) + '/.ralph/fix_plan.md'`; `claude-analyze.ts` instructs Claude to write the verified Ralph checklist format |
| 11 | Per-project Promise-chain queue serializes writes — two simultaneous requests for the same project never corrupt fix_plan.md | VERIFIED | `queue.ts:11-19` — `Map<string, Promise<void>>`, each project chains new job onto existing tail |
| 12 | Duplicate webhook deliveries (same owner/repo#issueId) are silently accepted with 200, not re-enqueued | VERIFIED | `fix.ts:42-46` — `isDuplicate(dedupeKey)` returns `res.status(200).json({ status: 'duplicate', key })` |
| 13 | Relay resolves GitHub repo name to local project folder via repo-map.json with fallback to repo name | VERIFIED | `project-resolver.ts:31-52` — `repoMap[repoName] ?? repoName`; `repo-map.json` has `"rohlik-stats": "rohlik-web"` |
| 14 | Relay spawns Claude Code CLI to describe bug reports — reads screenshots, appends to fix_plan.md | VERIFIED | `claude-analyze.ts:114-191` — spawns `claude -p <prompt> --allowedTools Read,Edit,Write,...` from `RALPH_WORKSPACE`; downloads screenshots to temp files; 10-min timeout with fallback |
| 15 | Relay spawns Ralph in background after fix_plan.md is written | VERIFIED | `ralph-runner.ts:37-81` — `spawn('ralph', [...], { detached: true })` with `ralph.unref()`; called from `fix.ts:76` |
| 16 | Requests without valid Authorization header receive 401 before any processing | VERIFIED | `app.ts:14-35` — auth middleware checks `timingSafeEqual(actual, expected)` before any route handler; returns 401 on mismatch |

**Score:** 16/16 truths verified

---

## Required Artifacts

### Plan 03-01 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `backend/src/services/triage-log.ts` | VERIFIED | Exports `TriageLogEntry` interface and `appendTriageLog()`. Substantive: 34 lines, JSONL append with try/catch guard. Wired: imported and called in `report.ts` lines 7, 83, 112 |
| `backend/src/services/relay.ts` | VERIFIED | Exports `notifyRelay()` and `registerRelayWebhook()`. Substantive: 164 lines, retry loop, relabeling. Wired: imported in `report.ts` (line 8, called line 126) and `index.ts` (line 5, called line 15) |
| `backend/src/services/issue-relabel.ts` | VERIFIED | Exports `relabelIssue()`. Substantive: 48 lines, Octokit remove+add label with try/catch. Wired: imported and called in `relay.ts` line 61 |

### Plan 03-02 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `relay/package.json` | VERIFIED | Name: `bug-report-relay`, all required deps present (express, zod, @octokit/rest, dotenv) |
| `relay/src/app.ts` | VERIFIED | Exports `createApp()`. Substantive: health-no-auth, timingSafeEqual auth, json, fixRouter mounted at `/fix`. Wired: imported in `index.ts` line 3 |
| `relay/src/routes/fix.ts` | VERIFIED | Exports `fixRouter`. Substantive: Zod validation, dedup, markSeen, enqueue with smart pipeline. Wired: mounted in `app.ts` line 41 |
| `relay/src/services/queue.ts` | VERIFIED | Exports `enqueue()`. Substantive: Promise-chain Map per project. Wired: imported and called in `fix.ts` line 56 |
| `relay/src/services/dedup.ts` | VERIFIED | Exports `isDuplicate`, `markSeen`, `loadSeen`. Substantive: in-memory Set + JSONL file persistence. Wired: `loadSeen()` called in `index.ts` line 6; `isDuplicate`/`markSeen` in `fix.ts` lines 42, 50 |
| `relay/src/services/fixplan.ts` | VERIFIED | Exports `buildBugReportSection`, `appendToFixPlan`, `isProjectBusy`. Substantive: uses `resolveProjectDir`, reads/appends file. Wired: used in `fix.ts` lines 5, 68-69 and `fix-watcher.ts` line 4 |
| `relay/src/services/fix-watcher.ts` | VERIFIED | Exports `watchFix`, `cancelWatch`. Substantive: setTimeout + setInterval pair, relabels via Octokit on timeout. Wired: called in `fix.ts` line 79 |

### Plan 03-03 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `relay/repo-map.json` | VERIFIED | Contains `{"rohlik-stats": "rohlik-web"}` — only mismatch entry |
| `relay/src/services/project-resolver.ts` | VERIFIED | Exports `resolveProjectDir()`. Substantive: loads repo-map.json, statSync dir check, throws on missing. Wired: imported in `fixplan.ts`, `fix.ts`, `fix-watcher.ts` |
| `relay/src/services/claude-analyze.ts` | VERIFIED | Exports `analyzeBugAndCreatePlan()`. Substantive: downloads screenshots, spawns Claude CLI from RALPH_WORKSPACE, 10-min timeout, cleanup on exit. Wired: imported and called in `fix.ts` line 64 |
| `relay/src/services/ralph-runner.ts` | VERIFIED | Exports `spawnRalph()`. Substantive: `isRalphRunning()` check via status.json, `spawn('ralph', [...], {detached:true})`, `ralph.unref()`. Wired: imported and called in `fix.ts` line 76 |

---

## Key Link Verification

### Plan 03-01 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `report.ts` | `triage-log.ts` | `appendTriageLog()` after triage | WIRED | Lines 7 (import), 83 (spam path), 112 (auto-fix/review path) |
| `relay.ts` | `webhook.ts` | `getWebhooksInstance().on('issues.labeled', ...)` | WIRED | `relay.ts:126` — exact pattern present |
| `relay.ts` | `issue-relabel.ts` | `relabelIssue()` after retry exhaustion | WIRED | `relay.ts:61` — called inside `retryRelayDelivery()` after loop exhaustion |
| `index.ts` | `relay.ts` | `registerRelayWebhook()` at startup | WIRED | `index.ts:5` (import), `index.ts:15` (call in try/catch) |

### Plan 03-02 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `fix.ts` | `dedup.ts` | `isDuplicate()` before enqueue | WIRED | `fix.ts:42` — dedup checked, returns 200 on hit |
| `fix.ts` | `queue.ts` | `enqueue()` for async write | WIRED | `fix.ts:56` |
| `queue.ts` job | `fixplan.ts` | `appendToFixPlan()` inside queued job | WIRED | `fix.ts:69` (fallback path) and via `claude-analyze.ts` (primary path writes via Claude) |
| `app.ts` | `fix.ts` | `app.use('/fix', fixRouter)` | WIRED | `app.ts:41` |
| `fix.ts` | `fix-watcher.ts` | `watchFix()` after pipeline runs | WIRED | `fix.ts:79` |

### Plan 03-03 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `report.ts` (auto-fix verdict) | relay POST /fix | `notifyRelay()` with screenshotUrls | WIRED | `report.ts:125-144` — called fire-and-forget for auto-fix |
| `fix.ts` | Claude Code CLI | `spawn('claude', ['-p', prompt, ...])` in `claude-analyze.ts` | WIRED | `claude-analyze.ts:128-143` — spawns from RALPH_WORKSPACE |
| relay (after Claude) | Ralph loop | `spawn('ralph', [...], {detached:true})` in `ralph-runner.ts` | WIRED | `ralph-runner.ts:43-55`, called from `fix.ts:76` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| TRIA-05 | 03-01 | All triage decisions logged with model reasoning | SATISFIED | `triage-log.ts` append-only JSONL; called in both spam and non-spam paths of `report.ts` with timestamp, verdict, confidence, reasoning |
| RALF-01 | 03-02 | Service generates fix_plan.md in Ralph's expected format for auto-fix verdicts | SATISFIED | `claude-analyze.ts` instructs Claude to write Ralph's exact checklist format; `fixplan.ts:buildBugReportSection` provides fallback with same format |
| RALF-02 | 03-02 | Local relay server bridges Railway service to local Ralph workspace | SATISFIED | `relay/` Express server on PORT 3001 receives payloads from backend and writes fix_plan.md to local ralph-workspace |
| RALF-03 | 03-03 | Relay server exposed via Cloudflare Tunnel or ngrok for Railway reachability | NEEDS HUMAN | `relay/.env.example` has full Cloudflare Tunnel setup docs (commit 764fd1b); docs only — tunnel daemon must be running in production |
| RALF-04 | 03-02 | Per-project job queue serializes fix_plan.md writes (no race conditions) | SATISFIED | `queue.ts` — Promise-chain Map; tested in `fix.ts` with per-project `enqueue(data.repo, ...)` |
| RALF-05 | 03-02 | Issue-ID-based deduplication prevents duplicate fix_plan.md writes | SATISFIED | `dedup.ts` in-memory Set + JSONL persistence; checked before enqueue in `fix.ts:42` |
| RALF-06 | 03-03 | Ralph detects fix_plan.md change and executes fix (precondition: verify Ralph --monitor behavior) | NEEDS HUMAN | Ralph binary is spawned correctly (`ralph-runner.ts:43-55`); Ralph's polling loop behavior depends on runtime environment and fix_plan.md content |
| RALF-07 | 03-02 | Relay server validates a shared secret from Railway before processing any request | SATISFIED | `app.ts:14-35` — `timingSafeEqual` Bearer auth middleware applied to all routes after health |

---

## Notable Implementation Deviation (Non-Gap)

**Triage engine replaced with local spam filter (Plan 03-03):** The original plan expected triage to produce three lanes (auto-fix, review, spam). The implementation replaced the Anthropic API triage with a local length-based filter: text < 10 chars = spam, everything else = auto-fix. The "review" verdict is still handled in `report.ts` (pendingApprovals map, line 148) but is never produced by the current `triage.ts`. This was a deliberate architectural decision documented in 03-03-SUMMARY (deviation #4). All three lanes are still logged correctly if ever produced; TRIA-05 is fully satisfied.

---

## Anti-Patterns Scan

Files scanned: all created/modified files across plans 03-01, 03-02, 03-03.

| File | Pattern | Severity | Assessment |
|------|---------|----------|-----------|
| `relay/src/services/project-resolver.ts:21` | Hardcoded fallback path `'/Users/miro/Workspace/PERSONAL/ralph-workspace'` | Info | Expected for local-only relay; documented in `.env.example`; no issue in this context |
| `relay/src/services/claude-analyze.ts:9` | Same hardcoded fallback path | Info | Same as above — acceptable for local relay |
| `relay/src/routes/fix.ts` | No `writeFixPlan` direct call (Claude writes via CLI) | Info | By design — Claude Code appends to fix_plan.md itself; fallback uses `appendToFixPlan` |

No blocker anti-patterns found. No TODO/FIXME/placeholder comments in production paths.

---

## Human Verification Required

### 1. Cloudflare Tunnel Live Reachability (RALF-03)

**Test:** With relay running (`cd relay && npm run dev`) and tunnel running (`cloudflared tunnel run --url http://localhost:3001 bug-report-relay`), POST to the tunnel URL:
```bash
curl -s -X POST https://relay.botur.fun/fix \
  -H "Authorization: Bearer $RELAY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"issueId":1,"issueUrl":"https://github.com/kwaczek/houbar/issues/1","issueTitle":"Test","owner":"kwaczek","repo":"houbar","triageResult":{"verdict":"auto-fix","confidence":1.0,"reasoning":"test"},"reportData":{"subject":"Test","description":"Test description","screenshotUrls":[]}}'
```
**Expected:** HTTP 202 response with `{"status":"accepted","key":"kwaczek/houbar#1"}`
**Why human:** Tunnel is a daemon process; DNS must resolve; cannot verify statically.

### 2. Smart Pipeline End-to-End Quality (RALF-01 + RALF-06)

**Test:** Submit a real bug report via the widget for a configured project. Wait ~2-5 minutes for Claude Code analysis to complete.
```bash
cat /Users/miro/Workspace/PERSONAL/ralph-workspace/projects/houbar/.ralph/fix_plan.md
```
**Expected:** fix_plan.md contains a "Bug Report" section with Claude's actual description of the specific bug (not a generic template), references to what the reporter described, and uncompleted checklist items
**Why human:** Requires running services, configured project directory, and real Claude Code execution.

### 3. Ralph Autonomous Execution (RALF-06)

**Test:** After fix_plan.md is written with uncompleted items, verify Ralph was spawned and is processing the fix.
```bash
# Check if Ralph process is running
ps aux | grep ralph
# Check status file
cat /Users/miro/Workspace/PERSONAL/ralph-workspace/projects/houbar/.ralph/status.json
```
**Expected:** Ralph process appears in process list; status.json shows `"status":"running"` or `"executing"`; eventually checklist items get marked `[x]`
**Why human:** Depends on Ralph binary installation, project test suite, and autonomous Claude Code execution over multiple loop iterations.

---

## Gaps Summary

No gaps blocking goal achievement. All 16 must-have truths verified in code. All key links confirmed wired. All artifacts are substantive (not stubs).

The 3 human verification items are runtime/environment checks, not code gaps:
- RALF-03 (tunnel) is properly documented and the relay correctly validates the secret — tunnel daemon operation is an ops concern
- RALF-06 (Ralph execution) depends on the Ralph binary and project setup — the relay correctly spawns Ralph; execution outcome is environment-dependent
- The live E2E test was completed during post-checkpoint (houbar issue #2) per the 03-03 SUMMARY, confirming the pipeline works in practice

---

_Verified: 2026-03-02T14:00:00Z_
_Verifier: Claude (gsd-verifier)_
