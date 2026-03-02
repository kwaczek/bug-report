# Phase 3: Ralph Integration - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

GitHub webhook events for auto-fix issues trigger fix_plan.md generation and Ralph execution via a local relay server. Triage decisions are logged. The pipeline is idempotent. This phase delivers the bridge between the Railway backend and the local Ralph workspace — not Telegram notifications (Phase 4) or pipeline enhancements (v2).

</domain>

<decisions>
## Implementation Decisions

### Triage logging
- Append-only `.jsonl` log file at ralph-workspace root (`/ralph-workspace/triage.log`)
- Log all three lanes: auto-fix, review, and spam — full visibility into filtering decisions
- Each entry contains: timestamp, issue ID, repo, verdict, confidence, reasoning
- References only — no duplicate bug report content (that lives in the GitHub issue)

### Tunnel & relay setup
- Cloudflare Tunnel for exposing local relay to Railway (user has a Cloudflare-managed domain)
- Relay is a separate `relay/` package in this repo (alongside `backend/` and `widget/`)
- Started manually via `npm run relay` from ralph-workspace — not a daemon
- Shares types with backend from the same repo

### Failure & retry behavior
- Railway queues webhook payloads and retries when relay is unreachable
- Retry schedule: 1, 5, 15, 30, and 60 minutes — then give up
- On delivery failure after all retries: relabel GitHub issue from `auto-fix` to `needs-review`
- On Ralph fix failure: relabel issue from `auto-fix` to `needs-review` (escalate to manual)
- Failure notifications deferred to Phase 4 (Telegram)

### Multi-project routing
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

</decisions>

<specifics>
## Specific Ideas

- Relay is a lightweight bridge — it receives payloads from Railway, writes fix_plan.md to the correct project folder, and that's it. Ralph handles the rest.
- Convention-based routing means no config file to maintain — just name project folders to match their GitHub repo names.
- fix_plan.md format must be verified from Ralph's source code before implementation (roadmap precondition RALF-06).

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `webhook.ts`: `getWebhooksInstance()` already exposed for Phase 3/4 to register `issues.labeled` callbacks
- `types.ts`: `TriageResult`, `PendingApproval`, `ProjectConfig` interfaces defined and ready
- `config.ts`: `getRepo()` and `PROJECT_MAP` env var pattern for project → repo mapping
- `triage.ts`: Triage service with Zod-validated structured output — log entries can reuse `TriageResult` type

### Established Patterns
- Express 5 with TypeScript and ES modules (`"type": "module"`)
- Lazy initialization pattern (webhook.ts) for optional features
- Zod for runtime validation
- `@anthropic-ai/sdk` for AI calls, `@octokit/rest` for GitHub API
- Console logging with `[service]` prefix convention

### Integration Points
- Webhook handler: Register `issues.labeled` callback via `getWebhooksInstance().on(...)` in backend
- Backend → Relay: Backend POSTs to relay URL when auto-fix issue is created (or webhook fires)
- Relay → Ralph workspace: Relay writes fix_plan.md to `projects/<repo-name>/.ralph/fix_plan.md`
- Relay shares `TriageResult` and `ProjectConfig` types from backend package

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-ralph-integration*
*Context gathered: 2026-03-02*
