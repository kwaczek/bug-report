# Phase 3: Ralph Integration - Research

**Researched:** 2026-03-02
**Domain:** Local relay server, Ralph fix_plan.md protocol, Cloudflare Tunnel, webhook deduplication, job queue
**Confidence:** HIGH

## Summary

Phase 3 bridges the Railway backend to the local Ralph workspace. The core flow is: GitHub issues.labeled webhook fires → Railway backend POSTs payload to local relay → relay writes fix_plan.md → Ralph's loop picks it up next iteration (every 5 seconds after prior loop completes). The relay is a separate `relay/` package in this repo, exposed via Cloudflare Tunnel to a permanent public URL.

Ralph's fix_plan.md format is confirmed from source code inspection: markdown checkboxes (`- [ ]` uncompleted, `- [x]` completed) grouped under `##` headings. Ralph detects completion by counting zero `- [ ]` items with at least one `- [x]` item. Ralph does NOT watch the file system for changes — it re-reads fix_plan.md at the start of each loop iteration after a 5-second sleep. This means the relay writes the file and Ralph picks it up in the next loop cycle (near-real-time, not instantaneous).

The three hardest implementation problems are: (1) deduplication of webhook retries from GitHub/Railway, (2) idempotent fix_plan.md writes that do not clobber an in-progress Ralph job, and (3) Cloudflare Tunnel configuration with a named tunnel for a permanent URL. All three have well-understood solutions documented below.

**Primary recommendation:** Build relay as a minimal Express-based Node.js service (matching backend conventions), use a file-based lock + issue-ID deduplication via a `.seen` log, and configure Cloudflare Tunnel using `cloudflared tunnel create` with a DNS route for a permanent URL.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Triage logging
- Append-only `.jsonl` log file at ralph-workspace root (`/ralph-workspace/triage.log`)
- Log all three lanes: auto-fix, review, and spam — full visibility into filtering decisions
- Each entry contains: timestamp, issue ID, repo, verdict, confidence, reasoning
- References only — no duplicate bug report content (that lives in the GitHub issue)

#### Tunnel & relay setup
- Cloudflare Tunnel for exposing local relay to Railway (user has a Cloudflare-managed domain)
- Relay is a separate `relay/` package in this repo (alongside `backend/` and `widget/`)
- Started manually via `npm run relay` from ralph-workspace — not a daemon
- Shares types with backend from the same repo

#### Failure & retry behavior
- Railway queues webhook payloads and retries when relay is unreachable
- Retry schedule: 1, 5, 15, 30, and 60 minutes — then give up
- On delivery failure after all retries: relabel GitHub issue from `auto-fix` to `needs-review`
- On Ralph fix failure: relabel issue from `auto-fix` to `needs-review` (escalate to manual)
- Failure notifications deferred to Phase 4 (Telegram)

#### Multi-project routing
- All projects supported from day one — not single-project
- Convention-based mapping: GitHub repo name matches folder name in `projects/` (kwaczek/houbar → projects/houbar)
- Per-project job queue: one fix at a time per project, parallel across different projects
- Relay writes fix_plan.md only — assumes Ralph `--monitor` is already running per project

### Claude's Discretion
- fix_plan.md format and content (pending Ralph source code investigation — RALF-06 precondition)
- Relay server framework choice (Express, Fastify, plain HTTP)
- Job queue implementation details (in-memory vs file-based)
- Deduplication strategy for webhook retries (RALF-05)
- Cloudflare Tunnel configuration specifics

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRIA-05 | All triage decisions are logged with model reasoning | Triage service already returns TriageResult with verdict, confidence, reasoning. Add log-writer utility that appends JSONL to `/ralph-workspace/triage.log`. The logging hook goes in the `issues.labeled` webhook handler registered in backend's `webhook.ts`. |
| RALF-01 | Service generates fix_plan.md in Ralph's expected format for auto-fix verdicts | fix_plan.md format verified from Ralph source: markdown with `## Heading` sections and `- [ ] task` checkboxes. Each bug fix needs at minimum: a task to investigate the issue, implement the fix, run tests, and commit+push. |
| RALF-02 | Local relay server bridges Railway service to local Ralph workspace | Relay is a minimal Express app in `relay/` package. Receives POST from Railway backend with shared secret + triage payload. Writes fix_plan.md to `projects/<repo-name>/.ralph/fix_plan.md`. |
| RALF-03 | Relay server exposed via Cloudflare Tunnel or ngrok for Railway reachability | cloudflared v2025.5.0 is installed. Named tunnel approach: `cloudflared tunnel create`, `cloudflared tunnel route dns`, `cloudflared tunnel run --url localhost:<port>`. Produces stable permanent URL. |
| RALF-04 | Per-project job queue serializes fix_plan.md writes (no race conditions) | In-memory per-project queues (Map<repoName, Promise>) are sufficient for single-process relay. Each queue is a chained Promise. No file locking needed for same-process serialization. |
| RALF-05 | Issue-ID-based deduplication prevents duplicate fix_plan.md writes from webhook retries | Maintain an in-memory Set<string> of processed issue IDs (or persist to `.seen` file for restart safety). Check before enqueuing; skip if already seen. |
| RALF-06 | Ralph detects fix_plan.md change and executes fix → commit → push → auto-deploy | VERIFIED from Ralph source: Ralph re-reads fix_plan.md at the start of each loop iteration after a 5-second sleep. No file-watcher — polling every loop cycle. fix_plan.md must exist at `.ralph/fix_plan.md` within the project directory. Ralph exits gracefully when all items are `[x]`. |
| RALF-07 | Relay server validates a shared secret from Railway before processing any request | Simple `Authorization: Bearer <token>` header check. Token stored as env var on both Railway side (`RELAY_SECRET`) and relay side. Reject with 401 before any processing. |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | ^5.1.0 | Relay HTTP server | Matches backend; already in dependency graph; team familiar |
| zod | ^3.0.0 | Payload validation | Already used in backend; validates incoming Railway POST body |
| dotenv | ^16.0.0 | Environment config | Already used in backend; handles RELAY_SECRET, PORT, RALPH_WORKSPACE |
| tsx | ^4.0.0 | TypeScript execution | Already used in backend; no build step needed |
| typescript | ^5.0.0 | Type safety | Shared types from backend package |
| fs/promises | node built-in | Write fix_plan.md | No extra dep needed; atomic-enough for single-writer-per-project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:fs/promises | built-in | writeFile, appendFile | Writing fix_plan.md and triage.log |
| node:path | built-in | Path construction | Building `.ralph/fix_plan.md` path from repo name |
| node:crypto | built-in | HMAC if needed | Could verify Railway-to-relay signatures beyond bearer token |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Express 5 | Fastify | Fastify is faster but adds learning curve; Express matches existing backend exactly |
| In-memory queue (Promise chain) | Bull/BullMQ with Redis | Redis adds infrastructure complexity; in-memory is sufficient since relay is single-process |
| In-memory dedup Set | SQLite file | SQLite survives restarts but adds dependency; file-based `.seen` JSONL is middle ground |
| cloudflared named tunnel | `cloudflared tunnel --url` (quick tunnel) | Quick tunnels give random URLs that change on restart; named tunnels give permanent DNS-based URLs |

**Installation:**
```bash
# From repo root — relay is a new package
mkdir relay && cd relay
npm init -y
npm install express zod dotenv
npm install -D typescript tsx @types/express @types/node
```

---

## Architecture Patterns

### Recommended Project Structure

```
relay/
├── src/
│   ├── index.ts          # Entry point: listen on PORT, log startup
│   ├── app.ts            # Express app factory (mirrors backend/src/app.ts)
│   ├── routes/
│   │   └── fix.ts        # POST /fix — main relay endpoint
│   ├── services/
│   │   ├── queue.ts      # Per-project job queue (Map<string, Promise>)
│   │   ├── dedup.ts      # Issue-ID deduplication (in-memory + optional persist)
│   │   ├── fixplan.ts    # fix_plan.md writer + format builder
│   │   └── triage-log.ts # Append JSONL to /ralph-workspace/triage.log
│   └── types.ts          # Local types + re-exports from backend/src/types.ts
├── package.json
├── tsconfig.json
└── .env.example
```

### Pattern 1: Per-Project Promise-Chain Queue

**What:** A `Map<string, Promise<void>>` where each project name maps to its current queue tail. New jobs chain onto the tail via `.then()`, making them execute serially per project while different projects run in parallel.

**When to use:** Any time you need serialized execution per key with parallel execution across keys, in a single Node.js process.

**Example:**
```typescript
// Source: standard Node.js async queue pattern
const queues = new Map<string, Promise<void>>();

export function enqueue(projectName: string, job: () => Promise<void>): void {
  const current = queues.get(projectName) ?? Promise.resolve();
  const next = current.then(job).catch((err) => {
    console.error(`[queue] job failed for ${projectName}:`, err);
  });
  queues.set(projectName, next);
}
```

Errors in individual jobs are caught and logged — they do NOT prevent the next job from running.

### Pattern 2: fix_plan.md Format (Verified from Ralph Source)

**What:** Ralph reads `.ralph/fix_plan.md` and counts items matching `^[[:space:]]*- \[ \]` (uncompleted) and `^[[:space:]]*- \[[xX]\]` (completed). Ralph exits gracefully when `completed == total` and `total > 0`. The file MUST be at `.ralph/fix_plan.md` within the project directory.

**Format verified from:** `/Users/miro/.ralph/ralph_loop.sh` lines 573-581, `/Users/miro/.ralph/templates/fix_plan.md`

```markdown
# Bug Fix: <issue title>

**Issue:** <GitHub issue URL>
**Reported:** <timestamp>
**Repo:** <owner/repo>

## Investigation
- [ ] Read the bug report at <issue URL> — understand the exact failure, reproduce steps, and affected code paths

## Implementation
- [ ] Identify the root cause in the codebase
- [ ] Implement the minimal fix — do not refactor unrelated code
- [ ] Run the test suite to verify no regressions

## Delivery
- [ ] Commit the fix with message: "fix: <brief description> (closes #<issueId>)"
- [ ] Push to main branch — Railway auto-deploys on push
```

**Key constraints from Ralph source:**
- Ralph reads fix_plan.md at the START of each loop, after the 5-second sleep between loops
- Ralph is NOT a file watcher — it polls on loop entry
- If `.ralph/fix_plan.md` does NOT exist, Ralph still starts (it's not required at startup)
- If fix_plan.md has zero checkbox items, Ralph does NOT exit on that condition
- Ralph counts only `- [ ]` and `- [x]` patterns — NOT `[2026-01-29]` date entries (fixed in Ralph source)

### Pattern 3: Deduplication Strategy

**What:** An in-memory `Set<string>` keyed by `${owner}/${repo}#${issueId}`. Checked before enqueuing. Optional: persist to `.seen` file for restart recovery.

```typescript
// In-memory deduplication (fast, no I/O)
const seen = new Set<string>();

export function isDuplicate(owner: string, repo: string, issueId: number): boolean {
  const key = `${owner}/${repo}#${issueId}`;
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}
```

For restart safety, persist the seen set to a file:
```typescript
// Persist on write; load on startup
import { appendFileSync, readFileSync } from 'node:fs';

const SEEN_FILE = path.join(RALPH_WORKSPACE, '.relay-seen.jsonl');

export function markSeen(key: string): void {
  seen.add(key);
  appendFileSync(SEEN_FILE, JSON.stringify({ key, ts: Date.now() }) + '\n');
}

export function loadSeen(): void {
  try {
    const lines = readFileSync(SEEN_FILE, 'utf8').trim().split('\n');
    for (const line of lines) {
      const { key } = JSON.parse(line);
      seen.add(key);
    }
  } catch { /* file doesn't exist yet */ }
}
```

### Pattern 4: Triage Log (TRIA-05)

**What:** Append-only JSONL file at `RALPH_WORKSPACE/triage.log`. Written by the backend's `issues.labeled` webhook handler (or the relay on receipt). One JSON object per line.

**Where to add the log hook:** The triage decision is made in `triageReport()` inside `routes/report.ts`. The cleanest approach is to log at the `issues.labeled` webhook handler registration point in `backend/src/middleware/webhook.ts`, since that's where the Phase 3 integration callback will be registered. Alternatively, log in `relay/src/routes/fix.ts` since the relay receives the full triage result from Railway.

**Log entry format:**
```typescript
interface TriageLogEntry {
  timestamp: string;        // ISO 8601
  issueId: number;
  owner: string;
  repo: string;
  verdict: "auto-fix" | "review" | "spam";
  confidence: number;       // 0.0 - 1.0
  reasoning: string;        // Claude's explanation
}
```

```typescript
// Append to triage.log
async function appendTriageLog(entry: TriageLogEntry): Promise<void> {
  const line = JSON.stringify(entry) + '\n';
  await fs.appendFile(TRIAGE_LOG_PATH, line, 'utf8');
}
```

### Pattern 5: Shared Secret Validation (RALF-07)

**What:** Railway adds `Authorization: Bearer <RELAY_SECRET>` header to every POST. Relay validates before any processing.

```typescript
// Middleware in relay/src/app.ts
app.use((req, res, next) => {
  const expected = `Bearer ${process.env.RELAY_SECRET}`;
  const actual = req.headers['authorization'] ?? '';
  if (actual !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});
```

Use `timingSafeEqual` from `node:crypto` if timing attacks are a concern (they aren't for internal service-to-service calls, but it's good practice):
```typescript
import { timingSafeEqual } from 'node:crypto';

function validateSecret(actual: string): boolean {
  const expected = `Bearer ${process.env.RELAY_SECRET ?? ''}`;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
```

### Pattern 6: Backend → Relay Webhook Integration

**What:** The `issues.labeled` event fires when GitHub labels an issue (including at creation time via `createGitHubIssue()`). The backend webhook handler checks for the `auto-fix` label and POSTs to the relay.

**Where:** Register callback in `backend/src/middleware/webhook.ts` via the already-exported `getWebhooksInstance()`:

```typescript
// In a new backend/src/services/relay.ts
export async function notifyRelay(payload: RelayPayload): Promise<void> {
  const relayUrl = process.env.RELAY_URL; // e.g. https://relay.mydomain.com/fix
  if (!relayUrl) {
    console.warn('[relay] RELAY_URL not set — skipping relay notification');
    return;
  }
  const response = await fetch(relayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RELAY_SECRET}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`[relay] HTTP ${response.status} from relay`);
  }
}
```

Register via `getWebhooksInstance().on('issues.labeled', ...)` in a new backend startup call.

### Anti-Patterns to Avoid

- **Writing fix_plan.md without checking if Ralph is running:** The relay writes the file regardless — Ralph picks it up when its next loop starts. Do NOT add a "wait for Ralph" mechanism; it violates the locked decision that "relay writes fix_plan.md only."
- **Using `fs.writeFile` without queuing:** Two simultaneous writes to the same project's fix_plan.md will corrupt it. Always use the per-project queue.
- **Logging triage decisions twice:** If logging in both the backend webhook handler AND the relay, entries will be duplicated on retry. Log in one place only. Recommendation: log in the relay (it's the authoritative point where auto-fix jobs are accepted).
- **Naming the relay package with the same name as backend:** Use `"name": "bug-report-relay"` in relay's package.json to avoid confusion.
- **Quick tunnels (`cloudflared tunnel --url`):** Quick tunnels generate random subdomains that change on restart. Use named tunnels with `cloudflared tunnel create` for a permanent URL.
- **Blocking the relay endpoint during fix_plan.md write:** The enqueue function returns immediately; the actual write is async. Always return 202 Accepted, not 200 with a body containing write confirmation.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job queue | Custom queue class with locks | Promise-chain per project (Map<string, Promise>) | Node.js is single-threaded; Promise chains ARE the lock — no race conditions possible within a single process |
| Secret comparison | String equality with `===` | `timingSafeEqual` from node:crypto (or simple string equality for internal traffic) | Timing attacks are irrelevant for internal services behind Cloudflare Tunnel — but using `timingSafeEqual` costs nothing |
| File path construction | String concatenation | `path.join(RALPH_WORKSPACE, 'projects', repoName, '.ralph', 'fix_plan.md')` | `path.join` handles OS separators and double-slashes |
| Tunnel setup | Custom HTTP proxy | `cloudflared tunnel run` | Cloudflare handles TLS, reconnection, load balancing across multiple connections |

**Key insight:** Node.js's event loop guarantees that Promise `.then()` callbacks execute sequentially — chaining Promises is a zero-dependency, zero-complexity queue for single-process serialization.

---

## Common Pitfalls

### Pitfall 1: fix_plan.md Overwrites an In-Progress Job

**What goes wrong:** Relay receives a second issue while Ralph is already working on the first. The relay writes a new fix_plan.md (overwriting the in-progress one). Ralph's next loop reads the new file and abandons the first job.

**Why it happens:** fix_plan.md is a single file per project. Writing to it while Ralph is reading/executing it corrupts the in-progress state.

**How to avoid:** The per-project queue (Pattern 1) serializes writes. But more importantly: do NOT overwrite an in-progress fix_plan.md. Instead, queue the second job and only write when the previous job's fix_plan.md is all `[x]`. Detection: check if fix_plan.md has any `- [ ]` items before writing.

**Warning signs:** Ralph logs show "All fix_plan.md items completed" prematurely, or Ralph exits without completing visible work.

### Pitfall 2: Duplicate fix_plan.md Writes from GitHub Webhook Retries

**What goes wrong:** GitHub delivers the `issues.labeled` webhook. Railway queues it and retries if the relay is down. On relay restart, the same webhook is delivered again. Without deduplication, two fix_plan.md writes are enqueued for the same issue.

**Why it happens:** GitHub webhook delivery has at-least-once semantics. Railway adds its own retry layer on top. The relay must be idempotent.

**How to avoid:** Deduplication Set keyed by `owner/repo#issueId`. Check before enqueuing. Persist to `.relay-seen.jsonl` for restart safety (load on startup). Return 200 on duplicate — do NOT 4xx (that would trigger more retries).

**Warning signs:** Two fix_plan.md writes for the same issue, or Ralph running the same fix twice.

### Pitfall 3: Ralph Not Picking Up fix_plan.md

**What goes wrong:** Relay writes fix_plan.md successfully, but Ralph never picks it up.

**Why it happens:** Ralph is NOT a file-watcher. It reads fix_plan.md at loop entry. If Ralph's loop is NOT running (`ralph --monitor` not started in that project directory), the file is written but never consumed.

**How to avoid:** This is a human operational requirement — Ralph must be started manually in each project. The relay can log a warning if the project directory doesn't exist, but cannot start Ralph. Document this in the relay's README and startup logs.

**Warning signs:** fix_plan.md file exists with `- [ ]` items, but no git commits from Ralph in that project.

### Pitfall 4: Cloudflare Tunnel URL Changes on Restart

**What goes wrong:** Using `cloudflared tunnel --url localhost:PORT` (quick tunnel). Each restart generates a new random URL. Railway's `RELAY_URL` env var becomes stale.

**Why it happens:** Quick tunnels are ephemeral. Named tunnels with DNS routes are permanent.

**How to avoid:** Use named tunnel workflow:
```bash
cloudflared tunnel login
cloudflared tunnel create bug-report-relay
cloudflared tunnel route dns bug-report-relay relay.yourdomain.com
cloudflared tunnel run --url localhost:3001 bug-report-relay
```
Once configured, `relay.yourdomain.com` is permanent regardless of restarts.

**Warning signs:** Railway webhook deliveries fail with connection refused or SSL certificate errors after relay restart.

### Pitfall 5: Triage Log Written Before Deduplication Check

**What goes wrong:** A retried webhook causes a duplicate triage.log entry.

**Why it happens:** If the log write happens before the dedup check, or the dedup check is bypass-able.

**How to avoid:** Always check dedup FIRST, then log, then enqueue. The log entry represents a successful relay acceptance, not just a receipt.

### Pitfall 6: Relay Blocks on fix_plan.md Write

**What goes wrong:** The relay's `POST /fix` endpoint awaits the fix_plan.md write before responding. If the write is slow (NFS, spinning disk) or the queue is backed up, Railway times out and retries.

**Why it happens:** Synchronous write inside the request handler.

**How to avoid:** Enqueue the job and return `202 Accepted` immediately. The actual write happens asynchronously in the queue.

---

## Code Examples

### Relay Request Payload (Backend → Relay)

```typescript
// relay/src/types.ts
export interface RelayFixRequest {
  issueId: number;
  issueUrl: string;
  issueTitle: string;
  owner: string;
  repo: string;
  triageResult: {
    verdict: 'auto-fix';
    confidence: number;
    reasoning: string;
  };
  reportData: {
    subject: string;
    description: string;
    screenshotUrls: string[];
  };
}
```

### fix_plan.md Writer

```typescript
// relay/src/services/fixplan.ts
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const RALPH_WORKSPACE = process.env.RALPH_WORKSPACE ?? '/Users/miro/Workspace/PERSONAL/ralph-workspace';

export function buildFixPlan(req: RelayFixRequest): string {
  return [
    `# Bug Fix: ${req.issueTitle}`,
    ``,
    `**Issue:** ${req.issueUrl}`,
    `**Reported:** ${new Date().toISOString()}`,
    `**Repo:** ${req.owner}/${req.repo}`,
    ``,
    `## Investigation`,
    `- [ ] Read the bug report at ${req.issueUrl} — understand the exact failure, reproduce steps, and identify affected code paths`,
    ``,
    `## Implementation`,
    `- [ ] Identify the root cause in the codebase`,
    `- [ ] Implement the minimal fix — do not refactor unrelated code`,
    `- [ ] Run the test suite to verify no regressions`,
    ``,
    `## Delivery`,
    `- [ ] Commit the fix with message: "fix: ${req.issueTitle} (closes #${req.issueId})"`,
    `- [ ] Push to main branch — Railway auto-deploys on push`,
  ].join('\n');
}

export async function writeFixPlan(repoName: string, content: string): Promise<void> {
  const fixPlanPath = path.join(
    RALPH_WORKSPACE,
    'projects',
    repoName,
    '.ralph',
    'fix_plan.md',
  );
  await writeFile(fixPlanPath, content, 'utf8');
  console.log(`[fixplan] wrote fix_plan.md for ${repoName} at ${fixPlanPath}`);
}
```

### POST /fix Route

```typescript
// relay/src/routes/fix.ts
import { Router } from 'express';
import { z } from 'zod';
import { enqueue } from '../services/queue.js';
import { isDuplicate } from '../services/dedup.js';
import { buildFixPlan, writeFixPlan } from '../services/fixplan.js';
import { appendTriageLog } from '../services/triage-log.js';
import type { RelayFixRequest } from '../types.js';

const FixRequestSchema = z.object({
  issueId: z.number(),
  issueUrl: z.string().url(),
  issueTitle: z.string(),
  owner: z.string(),
  repo: z.string(),
  triageResult: z.object({
    verdict: z.literal('auto-fix'),
    confidence: z.number(),
    reasoning: z.string(),
  }),
  reportData: z.object({
    subject: z.string(),
    description: z.string(),
    screenshotUrls: z.array(z.string()),
  }),
});

export const fixRouter = Router();

fixRouter.post('/', async (req, res): Promise<void> => {
  const parsed = FixRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });
    return;
  }

  const data = parsed.data;
  const dedupeKey = `${data.owner}/${data.repo}#${data.issueId}`;

  if (isDuplicate(dedupeKey)) {
    console.log(`[relay] duplicate ignored: ${dedupeKey}`);
    res.status(200).json({ status: 'duplicate', key: dedupeKey });
    return;
  }

  // Log triage decision (TRIA-05)
  await appendTriageLog({
    timestamp: new Date().toISOString(),
    issueId: data.issueId,
    owner: data.owner,
    repo: data.repo,
    verdict: data.triageResult.verdict,
    confidence: data.triageResult.confidence,
    reasoning: data.triageResult.reasoning,
  });

  // Enqueue fix_plan.md write (RALF-04)
  enqueue(data.repo, async () => {
    const content = buildFixPlan(data);
    await writeFixPlan(data.repo, content);
  });

  // Return immediately — don't await the queue
  res.status(202).json({ status: 'accepted', key: dedupeKey });
});
```

### Cloudflare Tunnel Setup Commands

```bash
# One-time setup (requires cloudflared login first)
cloudflared tunnel login
cloudflared tunnel create bug-report-relay
cloudflared tunnel route dns bug-report-relay relay.yourdomain.com

# Start tunnel (run alongside relay server)
cloudflared tunnel run --url http://localhost:3001 bug-report-relay

# Or use a config file at ~/.cloudflared/config.yml:
# tunnel: bug-report-relay
# credentials-file: ~/.cloudflared/<tunnel-id>.json
# ingress:
#   - hostname: relay.yourdomain.com
#     service: http://localhost:3001
#   - service: http_status:404
```

### npm run relay script (package.json pattern)

```json
{
  "scripts": {
    "relay": "concurrently \"tsx watch relay/src/index.ts\" \"cloudflared tunnel run --url http://localhost:3001 bug-report-relay\""
  }
}
```

Or as separate commands:
```bash
# Terminal 1
cd relay && npm run dev

# Terminal 2
cloudflared tunnel run --url http://localhost:3001 bug-report-relay
```

---

## Ralph --monitor Behavior (RALF-06 Precondition — VERIFIED)

This is the critical precondition. Research findings from direct source code inspection of `/Users/miro/.ralph/ralph_loop.sh`:

**Key verified facts:**

1. **No file-watching.** Ralph uses a `while true` loop with `sleep 5` between iterations. It does NOT use inotify/fswatch/chokidar. The relay writes fix_plan.md and Ralph picks it up on its next loop entry (within ~5 seconds of the loop completing).

2. **fix_plan.md location.** Must be at `.ralph/fix_plan.md` within the project directory (i.e., `RALPH_DIR=".ralph"`, `"$RALPH_DIR/fix_plan.md"`). Full path: `<project_dir>/.ralph/fix_plan.md`.

3. **Completion detection.** Ralph exits gracefully ("plan_complete") when:
   - `fix_plan.md` exists
   - `total_items > 0` (at least one checkbox)
   - `completed_items == total_items` (all checkboxes are `[x]` or `[X]`)

4. **Checkpoint timing.** Completion is checked in `should_exit_gracefully()` which runs BEFORE each loop's Claude invocation. So Ralph checks completion at the top of each loop, not after Claude writes `[x]` items.

5. **--monitor flag.** Starts a tmux session with 3 panes: left = ralph loop, right-top = live output log, right-bottom = status monitor. The loop itself is identical to non-monitor mode.

6. **Context injection.** Each loop, Ralph receives `--append-system-prompt "Loop #N. Remaining tasks: M."` where M is the count of `- [ ]` items. This is how Claude inside Ralph knows what's left to do.

7. **Session continuity.** Ralph uses `--continue` flag with Claude CLI across loops (unless `--no-continue` is set). This means Claude retains context of what it did in previous loops. This is important: when writing fix_plan.md, Claude will see it fresh on the first loop it reads it.

8. **PROMPT.md is the always-present directive.** Ralph feeds the entire content of `.ralph/PROMPT.md` as the `-p` (prompt) argument to Claude. fix_plan.md is read by Claude as a file in the project directory — Claude is instructed to "Review .ralph/fix_plan.md for current priorities" via PROMPT.md.

**Implication for relay:** The relay just needs to write the file. Ralph's next loop will see it, inject the remaining task count into the system prompt, and Claude will read and execute it. No signaling or process communication needed.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ngrok (ephemeral URLs) | Cloudflare Tunnel (named, permanent) | Decided in Phase 3 context | Stable URL — no need to update Railway env on restart |
| Single global queue | Per-project Promise-chain queue | Phase 3 design | Parallel projects, serialized per-project writes |
| Webhook direct to file | Relay with dedup + queue | Phase 3 design | Idempotent under retries |

**Deprecated/outdated:**
- Quick tunnels (`cloudflared tunnel --url`): Still works but generates random URLs — use named tunnels for production.
- `cloudflared access` (old name): Now called Cloudflare Tunnel. CLI is `cloudflared tunnel`.

---

## Open Questions

1. **fix_plan.md conflict with in-progress Ralph job**
   - What we know: If Ralph is mid-execution on a job and relay writes a new fix_plan.md, Ralph's NEXT loop will see the new file (not the old one). The previous job's checked-off items are lost.
   - What's unclear: Should the relay check if fix_plan.md has `- [ ]` items (Ralph is busy) before writing? If so, it should re-queue with a delay.
   - Recommendation: Add a "busy check" to the queue job: before writing, read current fix_plan.md and if uncompleted items exist, re-enqueue with a 60-second delay. This prevents job collisions without blocking the endpoint.

2. **RELAY_SECRET env var on Railway**
   - What we know: Railway env vars must be set via Railway dashboard or CLI. The backend needs `RELAY_URL` and `RELAY_SECRET` set.
   - What's unclear: Does the backend's current `.env.example` need updating?
   - Recommendation: Add `RELAY_URL=` and `RELAY_SECRET=` to `backend/.env.example` as part of Phase 3.

3. **Triage logging location (backend vs relay)**
   - What we know: TRIA-05 requires all three lanes logged. The backend already runs triage in `routes/report.ts`. Spam is discarded before the webhook fires — so the relay will NEVER receive spam events.
   - What's unclear: Where should spam be logged? The relay only receives auto-fix verdicts. Review verdicts are stored in `pendingApprovals` (Phase 4).
   - Recommendation: Log ALL three lanes in the backend's `routes/report.ts` immediately after `triageReport()` returns. This captures spam (which never reaches the relay). The relay logs only the auto-fix events it accepts (as a delivery confirmation). This means TRIA-05 is implemented in the backend, not the relay — simpler architecture.

4. **How to handle GitHub issue relabeling on failure (locked decision)**
   - What we know: On delivery failure after all retries, relabel from `auto-fix` to `needs-review`. The backend must handle this.
   - What's unclear: How does the backend KNOW all retries have failed? Railway doesn't send a "max retries exceeded" callback.
   - Recommendation: Implement a timeout-based approach in the backend: after posting to relay fails, use an exponential backoff loop (matching Railway's 1, 5, 15, 30, 60 min schedule). After the final retry fails, call `octokit.rest.issues.update()` to relabel. This is a backend concern, not a relay concern.

---

## Sources

### Primary (HIGH confidence)
- `/Users/miro/.ralph/ralph_loop.sh` — Direct source code inspection of Ralph's fix_plan.md reading logic (lines 573-583, 680-695), loop timing (sleep 5), and completion detection
- `/Users/miro/.ralph/templates/fix_plan.md` — Official fix_plan.md template with format
- `/Users/miro/Workspace/PERSONAL/ralph-workspace/projects/houbar/.ralph/fix_plan.md` — Real-world example of fix_plan.md in production use
- `/Users/miro/Workspace/PERSONAL/ralph-workspace/bug-report/backend/src/middleware/webhook.ts` — Existing `getWebhooksInstance()` extension point for Phase 3
- `/Users/miro/Workspace/PERSONAL/ralph-workspace/bug-report/backend/src/types.ts` — TriageResult and other shared types
- `cloudflared tunnel --help`, `cloudflared --version` — cloudflared v2025.5.0 confirmed installed

### Secondary (MEDIUM confidence)
- Cloudflare Tunnel documentation pattern (named tunnels) — consistent with `cloudflared tunnel --help` output
- Node.js `fs/promises.appendFile` for JSONL append — standard Node.js built-in behavior
- Express 5 + TypeScript + tsx pattern — verified from existing backend implementation

### Tertiary (LOW confidence)
- "Within seconds" pickup claim for Ralph — based on `sleep 5` in source + typical Claude CLI execution time; actual time depends on Claude API response time for previous loop

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all choices match existing backend patterns, verified from source
- Architecture: HIGH — fix_plan.md format verified from Ralph source code directly
- Ralph --monitor behavior: HIGH — verified from direct source code inspection
- Cloudflare Tunnel setup: MEDIUM — CLI confirmed installed and functional; DNS/credential setup requires runtime verification
- Pitfalls: HIGH — derived from code analysis and known async/queue patterns

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable domain — Ralph source is local, Cloudflare Tunnel CLI is stable)
