# Feature Research

**Domain:** Bug reporting widget + automated AI triage + automated fix pipeline
**Researched:** 2026-03-01
**Confidence:** MEDIUM (widget features HIGH, AI pipeline patterns MEDIUM, automated deploy risk LOW)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Screenshot capture on submit | Every competing widget (Marker.io, Gleap, Sentry, BugHerd) includes this — users will not trust a bug report without visual proof | LOW | Use html2canvas or Screen Capture API; html2canvas has CORS limitations with externally hosted images — test per-project |
| Auto-captured page URL | Reporter shouldn't have to type where the bug is — all major tools do this automatically | LOW | `window.location.href` at widget mount time; trivial |
| Auto-captured browser/OS/screen metadata | Developers can't reproduce without environment info — this is the entire value-add over email | LOW | `navigator.userAgent`, `screen.width/height`, `window.devicePixelRatio`; no API needed |
| Free-text description field | Reporters need to explain what they expected vs. what happened | LOW | Single textarea, required field |
| "What were you doing?" context prompt | Reduces "the page is broken" reports to something actionable | LOW | Placeholder text / label guidance only |
| GitHub Issue created on submit | The whole pipeline assumes GitHub Issues as source of truth — no issue means no fix | MEDIUM | Requires GitHub API auth with Miro's token; per-project repo routing |
| Rate limiting on submissions | Any public widget without rate limiting will be spammed to death within days | MEDIUM | IP-based + token-bucket per project; server-side only — no client-side trust |
| Graceful failure when service is down | If the backend is unreachable, must not break the host app | LOW | Try/catch in widget, silent fail with optional retry; no host-app JS errors |
| Confirmation to reporter | Reporter needs to know the report was received — otherwise they submit twice | LOW | Widget success state (toast/message), no email needed |
| Per-project routing | Bug reports from rohlik-web must go to the rohlik-web repo, not houbar | MEDIUM | Widget initialized with a `projectId` config; backend maps projectId → GitHub repo |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI triage before creating fix_plan | Prevents Ralph wasting cycles on spam, duplicate reports, or vague/unfixable issues — this is the core differentiator vs every other tool | HIGH | LLM prompt evaluates: is it a real bug? Is it actionable? Is it risky to auto-fix? Produces verdict + risk score |
| fix_plan.md auto-generation | Translates bug report into a Ralph-executable task description — no human write-up needed | HIGH | LLM generates a structured fix_plan following Ralph's expected format using bug details + AI triage output |
| Telegram approve/reject for uncertain bugs | Human-in-the-loop without requiring a laptop — quick phone interaction for borderline cases | MEDIUM | Bot sends message with inline buttons; callback updates pipeline state; proven pattern with n8n and Telegram |
| Auto-deploy after successful fix | Closes the loop: report → fix → deployed, zero human touch for clear bugs | LOW | Ralph already pushes to main; existing CI/CD handles deploy — this "feature" is mostly about not blocking after merge |
| AI spam auto-detection | Automatically bins obvious junk (lorem ipsum, keyboard mashing, test submissions) before creating any GitHub issue | MEDIUM | Sentry does this with GCP LLM; same approach viable — classify before GitHub API call |
| Console log capture | Gives developers the JS error stack alongside the screenshot — dramatically speeds up diagnosis | MEDIUM | Intercept `window.onerror` and `console.error` in widget before submit; buffer last N errors |
| Duplicate detection before issue creation | Avoids cluttering GitHub Issues with 10 reports of the same bug | MEDIUM | Semantic similarity check against recent open issues using embeddings or LLM; GitHub search API for keyword pre-filter |
| Script-tag zero-config embed | Works in any framework without NPM install — drop in one line and done | LOW | IIFE bundle, no dependencies; widget auto-initializes from `data-project-id` attribute |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| User accounts for reporters | "Track who submitted what" | Kills anonymous submission, adds auth complexity, violates the "no user data collected" constraint, adds a login barrier | Keep fully anonymous; optionally accept an email field (no account required) for follow-up |
| Custom bug tracking dashboard | "See all bugs in one place" | GitHub Issues already does this; building a second dashboard duplicates storage, creates sync issues, and competes with GitHub's UI | Use GitHub Issues labels and milestones as the dashboard; link reporters there if needed |
| Screenshot annotation in-widget | "Let reporters draw on screenshots" | Adds significant JS weight (canvas drawing library), complex UX, and most reporters don't annotate anyway | Capture full screenshot automatically; let developers annotate in GitHub if needed |
| Session replay recording | "See what the user did" | Large payload (MB-range), complex storage, significant privacy risk for users of host apps, out of scope | Console log capture + page URL + description is sufficient for Ralph to reproduce |
| Real-time bug status updates to reporter | "Tell me when my bug is fixed" | Requires reporter identity/contact, notification infrastructure, and ongoing communication loop | Auto-close GitHub issues after fix is deployed; reporters who care can watch the issue |
| Multi-project global dashboard | "See all bugs across all my projects" | Extra UI surface with marginal value; GitHub already shows cross-repo issues if you own the org | Telegram notifications give Miro cross-project visibility without a separate dashboard |
| Bug severity/priority input from reporter | "Let users set priority" | Reporters always mark everything P1/Critical; defeats AI triage purpose | AI triage sets severity based on description content and risk assessment |
| Manual assignment workflow | "Route bugs to specific team members" | Single-developer context (Miro + Ralph); assignment logic is overhead | AI triage routes: auto-fix (Ralph) or human-approve (Miro via Telegram) |

---

## Feature Dependencies

```
[Script-tag widget embed]
    └──requires──> [Per-project routing config]
                       └──requires──> [Backend project registry]
                                          └──requires──> [GitHub API auth]

[Screenshot capture]
    └──requires──> [html2canvas or Screen Capture API in widget bundle]

[GitHub Issue creation]
    └──requires──> [GitHub API auth]
    └──requires──> [Per-project routing config]

[AI triage]
    └──requires──> [GitHub Issue creation] (issue exists to evaluate)
    OR
    └──requires──> [Pre-issue triage] (evaluate before creating issue — preferred to avoid noise)

[AI spam detection]
    └──enhances──> [AI triage] (can be same LLM call)

[fix_plan.md auto-generation]
    └──requires──> [AI triage] (only runs if triage verdict = auto-fix)
    └──requires──> [GitHub Issue creation]

[Telegram approve/reject]
    └──requires──> [AI triage] (only fires for uncertain/risky verdicts)
    └──enhances──> [fix_plan.md auto-generation] (human approval gates Ralph execution)

[Auto-deploy after fix]
    └──requires──> [Existing CI/CD on projects] (already present — no work needed)
    └──requires──> [Ralph successful fix + push to main]

[Console log capture]
    └──enhances──> [GitHub Issue creation] (adds log data to issue body)
    └──requires──> [Widget JS error buffer before submit]

[Duplicate detection]
    └──enhances──> [AI triage] (can be pre-triage filter)
    └──requires──> [GitHub Issues search API]

[Rate limiting]
    └──requires──> [Backend service] (never client-side)

[Graceful failure]
    └──requires──> [Widget error handling] (independent of backend)
```

### Dependency Notes

- **AI triage requires GitHub Issue creation OR pre-issue evaluation:** Pre-issue triage is strongly preferred — create the GitHub Issue only after deciding it's worth keeping. This avoids polluting the repo with spam issues that then need closing.
- **fix_plan.md generation requires triage verdict:** Never generate a fix plan for a spam or invalid report. Triage is the gate.
- **Telegram approval is conditional:** Only fires when triage confidence is low or risk is high. High-confidence, low-risk bugs go straight to Ralph without human review.
- **Auto-deploy has zero implementation cost:** The existing CI/CD on all projects handles deploy after push to main. This "feature" is just about not adding any merge blockers in the pipeline.
- **Console logs enhance but don't block:** Capture is best-effort; if no errors occurred, there are no logs. Issue creation proceeds regardless.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept end-to-end.

- [ ] Script-tag embeddable widget with screenshot capture and free-text description — the entry point without which nothing works
- [ ] Auto-captured metadata (URL, browser, OS, screen size) — mandatory for actionable reports
- [ ] Rate limiting (IP-based, simple token bucket) — without this the widget cannot be public
- [ ] Backend receiver that creates a GitHub Issue in the correct project repo — the handoff to GitHub
- [ ] AI triage: spam detection + validity assessment + risk scoring (single LLM call, pre-issue) — the core value proposition
- [ ] fix_plan.md auto-generation for auto-fix verdicts — what makes this different from just a widget
- [ ] Telegram notification + approve/reject for uncertain cases — human oversight without a laptop
- [ ] Graceful widget failure when backend is down — safety requirement from PROJECT.md constraints

### Add After Validation (v1.x)

Features to add once core pipeline is proven working.

- [ ] Console log capture — add after first few real bug reports to see if it's actually used in diagnosis; implementation is straightforward once the rest is working
- [ ] Duplicate detection — add after issue volume grows; premature optimization for a single-developer shop with a handful of projects
- [ ] Widget success/error state polish — v1 can be rough; refine UX based on real usage
- [ ] Per-project Telegram channel routing — start with one channel, split when volume warrants it

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Replay / session recording — complexity and privacy concerns outweigh value for this use case
- [ ] Optional reporter email field for follow-up — defer until there's actual demand to notify reporters
- [ ] Multi-tenant (other developers beyond Miro) — out of scope per PROJECT.md, revisit only if there's demand

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Script-tag widget embed | HIGH | LOW | P1 |
| Screenshot capture | HIGH | LOW | P1 |
| Auto-captured metadata (URL, browser, OS) | HIGH | LOW | P1 |
| Free-text description field | HIGH | LOW | P1 |
| Rate limiting | HIGH | MEDIUM | P1 |
| Graceful failure | HIGH | LOW | P1 |
| GitHub Issue creation | HIGH | MEDIUM | P1 |
| Per-project routing | HIGH | MEDIUM | P1 |
| AI triage (spam + validity + risk) | HIGH | HIGH | P1 |
| fix_plan.md auto-generation | HIGH | HIGH | P1 |
| Telegram approve/reject | HIGH | MEDIUM | P1 |
| Console log capture | MEDIUM | MEDIUM | P2 |
| Duplicate detection | MEDIUM | HIGH | P2 |
| Widget UX polish (animations, branding) | LOW | MEDIUM | P3 |
| Screenshot annotation in-widget | LOW | HIGH | P3 (anti-feature) |
| Session replay | LOW | HIGH | P3 (anti-feature) |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have / future consideration

---

## Competitor Feature Analysis

| Feature | Sentry User Feedback | Marker.io | Gleap | Our Approach |
|---------|---------------------|-----------|-------|--------------|
| Screenshot capture | Yes (SDK v8+) | Yes | Yes | Yes — html2canvas; CORS edge cases need testing |
| Screenshot annotation | No in-widget | Yes | Yes | No — deliberate anti-feature, unnecessary complexity |
| Console log capture | Via Sentry SDK | Yes | Yes | Yes — buffered window.onerror capture |
| Session replay | Yes (attached automatically) | No | Yes | No — anti-feature, privacy/size concerns |
| AI spam detection | Yes (GCP LLM) | No | No | Yes — LLM call before issue creation |
| Auto issue creation | GitHub + Jira integrations | 20+ integrations | Yes | GitHub only — fits the single-platform constraint |
| AI triage / fix routing | No | No | No | Yes — core differentiator |
| Automated code fix | No | No | No | Yes — via Ralph; unique to this project |
| Human-in-the-loop approval | No | No | No | Yes — Telegram bot |
| Anonymous reporters | Yes | Yes | Optional | Yes — fully anonymous per PROJECT.md |
| Script-tag embed | Yes | Yes | Yes | Yes |
| Rate limiting | Not exposed | Not exposed | Not exposed | Yes — explicit requirement |
| Auto-deploy after fix | No | No | No | Yes — via existing CI/CD |

---

## Sources

- [Sentry User Feedback docs](https://docs.sentry.io/product/user-feedback/) — HIGH confidence (official docs)
- [Sentry User Feedback Widget screenshots changelog](https://sentry.io/changelog/user-feedback-widget-screenshots/) — HIGH confidence (official)
- [Marker.io features page](https://marker.io/features) — HIGH confidence (official)
- [Marker.io console logs docs](https://help.marker.io/en/articles/1669763-console-logs) — HIGH confidence (official)
- [Gleap bug reporting getting started](https://help.gleap.io/en/articles/32-getting-started-with-gleap-s-bug-reporting) — MEDIUM confidence (official docs, anonymous-reporter specifics unconfirmed)
- [Visual Bug Reporting Trends — Gleap Blog](https://www.gleap.io/blog/visual-bug-reporting-trends) — MEDIUM confidence (vendor blog)
- [25 Best Bug Tracking Tools 2026 — Marker.io Blog](https://marker.io/blog/bug-tracking-tools) — MEDIUM confidence (vendor blog, broad survey)
- [html2canvas CORS limitations — Monday Engineering](https://engineering.monday.com/capturing-dom-as-image-is-harder-than-you-think-how-we-solved-it-at-monday-com/) — MEDIUM confidence (engineering case study)
- [AI bug triage accuracy — Ranger.net](https://www.ranger.net/post/how-ai-improves-bug-triaging-accuracy) — LOW confidence (single vendor source, 85-90% accuracy claim unverified)
- [Semgrep AppSec AI accuracy](https://semgrep.dev/blog/2025/building-an-appsec-ai-that-security-researchers-agree-with-96-of-the-time/) — MEDIUM confidence (Semgrep official blog, specific to security triage)
- [Telegram HITL approval patterns — n8n](https://n8n.io/workflows/9039-create-secure-human-in-the-loop-approval-flows-with-postgres-and-telegram/) — MEDIUM confidence (working template, widely used pattern)
- [GitHub Agentic Workflows technical preview](https://github.blog/changelog/2026-02-13-github-agentic-workflows-are-now-in-technical-preview/) — HIGH confidence (official GitHub changelog)
- [Auto PR merge risk analysis — Apiiro](https://apiiro.com/blog/4x-velocity-10x-vulnerabilities-ai-coding-assistants-are-shipping-more-risks/) — MEDIUM confidence (security research blog)
- [BugHerd vs Marker.io comparison](https://bugherd.com/article/bugherd-vs-marker-io-2025) — MEDIUM confidence (vendor comparison, cross-referenced with G2)

---

*Feature research for: Bug reporting widget + AI triage + automated fix pipeline*
*Researched: 2026-03-01*
