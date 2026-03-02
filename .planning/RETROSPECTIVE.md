# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Bug Report Pipeline

**Shipped:** 2026-03-02
**Phases:** 3 | **Plans:** 10 | **Timeline:** 2 days

### What Was Built
- Embeddable widget (22KB IIFE) with Shadow DOM isolation, screenshot capture, and multi-image upload
- Express 5 backend on Railway with spam triage, ImgBB upload, and GitHub issue creation
- Local relay server with dedup, queue, Claude Code bug analysis, and Ralph auto-fix spawning
- Full E2E pipeline: widget → backend → GitHub issue → relay → Claude → fix_plan.md → Ralph

### What Worked
- Phase-by-phase execution with clear contracts between phases prevented integration surprises
- Shadow DOM decision eliminated all CSS isolation concerns upfront
- Verification reports caught the BACK-07 (railway.toml) gap before deployment
- Fire-and-forget relay notification pattern kept HTTP responses fast without blocking on downstream
- Local spam filter replaced paid API triage — simpler, faster, cost-free

### What Was Inefficient
- Phase 3 required a post-checkpoint refactor (03-03) to switch from paid Anthropic triage to local spam filter — should have questioned the cost assumption earlier
- Widget plan 01-03 took 20 min (longest) due to browser verification checkpoint — could have deferred human checks to phase verification
- RELAY_URL path ambiguity (must include /fix) could have been caught with a URL validation at startup

### Patterns Established
- `createApp()` factory pattern for both backend and relay (testability, consistent structure)
- Bearer auth with `timingSafeEqual` for service-to-service communication
- Promise-chain queue per project for serialized file writes (no Redis needed)
- Claude Code CLI as a describe-only tool (never fix, just describe) — Ralph handles the fix with full context
- repo-map.json for mismatches only (default = repo name)
- JSONL append-only files for triage logs and dedup state

### Key Lessons
1. Local heuristic triage beats paid API when the decision boundary is simple (spam vs. not-spam). Save AI for complex classification.
2. Shadow DOM is the right isolation strategy for embeddable widgets — eliminates an entire class of CSS bugs.
3. Fire-and-forget with retry + relabel is the right pattern for relay delivery — keeps the HTTP layer responsive.
4. Verification reports pay for themselves — the BACK-07 gap was caught and fixed before it became a production incident.
5. Claude Code describe-only mode + Ralph fix mode is a clean separation of concerns — the describer doesn't need codebase context, the fixer does.

### Cost Observations
- Model mix: ~60% sonnet (execution, verification), ~30% haiku (research, planning), ~10% opus (audit)
- Sessions: ~6 sessions across 2 days
- Notable: Local spam filter eliminated recurring Anthropic API costs for triage

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Timeline | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | 2 days | 3 | Initial pipeline — widget to auto-fix |

### Cumulative Quality

| Milestone | Requirements | Coverage | Verification Score |
|-----------|-------------|----------|--------------------|
| v1.0 | 29/29 | 100% | 33/33 truths verified |

### Top Lessons (Verified Across Milestones)

1. Verification reports catch gaps that execution misses — always verify before shipping
2. Simple heuristics beat complex AI when the decision boundary is clear
