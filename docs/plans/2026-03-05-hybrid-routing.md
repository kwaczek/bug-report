# Hybrid Bug Report Routing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Quick fix / Needs investigation" toggle to the bug report widget that routes simple bugs to Ralph (autonomous) and complex bugs to GSD todos (user picks up later).

**Architecture:** A `mode: 'ralph' | 'gsd'` field flows from widget → backend → relay. The relay branches: ralph mode uses the existing pipeline (Claude analyze → fix_plan.md → spawn Ralph); gsd mode has Claude build a rich description then spawns `claude -p` to run `/gsd:add-todo` from the project directory.

**Tech Stack:** TypeScript, Express, Vite, Zod, Claude CLI (`claude -p`)

---

### Task 1: Add `mode` to widget types

**Files:**
- Modify: `widget/src/types.ts:18-26`

**Step 1: Add mode to SubmitArgs**

In `widget/src/types.ts`, add `mode` field to `SubmitArgs`:

```typescript
export interface SubmitArgs {
  projectId: string;
  apiUrl: string;
  subject: string;
  description: string;
  metadata: BugMetadata;
  autoScreenshot: Blob | null;
  attachedImages: Blob[];
  mode: 'ralph' | 'gsd';
}
```

**Step 2: Commit**

```bash
git add widget/src/types.ts
git commit -m "feat(widget): add mode field to SubmitArgs type"
```

---

### Task 2: Add toggle UI to widget form

**Files:**
- Modify: `widget/src/widget.ts:89-184` (renderFormView function)
- Modify: `widget/src/styles/widget.css`

**Step 1: Add toggle CSS**

Append to `widget/src/styles/widget.css`:

```css
/* Mode toggle */
.brw-mode-toggle {
  display: flex;
  gap: 0;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  overflow: hidden;
}
.brw-mode-option {
  flex: 1;
  padding: 8px 12px;
  border: none;
  background: #fff;
  font-size: 13px;
  font-family: inherit;
  color: #374151;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.brw-mode-option:first-child {
  border-right: 1px solid #d1d5db;
}
.brw-mode-option:hover {
  background: #f9fafb;
}
.brw-mode-option[aria-pressed="true"] {
  background: #ef4444;
  color: #fff;
}
.brw-mode-option[aria-pressed="true"]:hover {
  background: #dc2626;
}
```

**Step 2: Add toggle to renderFormView**

In `widget/src/widget.ts`, inside `renderFormView()`, add the mode toggle after the description field (after line 118 where `panel.appendChild(descField)`). Also wire it into the submit handler.

Insert after the description field block:

```typescript
    // Mode toggle
    const modeField = el('div', { className: 'brw-field' });
    const modeLabel = el('label', { className: 'brw-label' }, 'Fix type');
    const modeToggle = el('div', { className: 'brw-mode-toggle' });
    const modeQuick = el('button', {
      className: 'brw-mode-option',
      type: 'button',
      'aria-pressed': 'true',
    }, 'Quick fix');
    const modeInvestigate = el('button', {
      className: 'brw-mode-option',
      type: 'button',
      'aria-pressed': 'false',
    }, 'Needs investigation');

    let selectedMode: 'ralph' | 'gsd' = 'ralph';

    modeQuick.addEventListener('click', () => {
      selectedMode = 'ralph';
      modeQuick.setAttribute('aria-pressed', 'true');
      modeInvestigate.setAttribute('aria-pressed', 'false');
    });
    modeInvestigate.addEventListener('click', () => {
      selectedMode = 'gsd';
      modeQuick.setAttribute('aria-pressed', 'false');
      modeInvestigate.setAttribute('aria-pressed', 'true');
    });

    modeToggle.appendChild(modeQuick);
    modeToggle.appendChild(modeInvestigate);
    modeField.appendChild(modeLabel);
    modeField.appendChild(modeToggle);
    panel.appendChild(modeField);
```

**Step 3: Wire mode into handleSubmit call**

In the same `renderFormView()` function, update the submit button click handler (around line 170-179) to pass `selectedMode`. Change the `handleSubmit` call:

```typescript
    submitBtn.addEventListener('click', () => {
      const subject = (subjectInput as HTMLInputElement).value.trim();
      const description = (descTextarea as HTMLTextAreaElement).value.trim();
      if (!subject) {
        (subjectInput as HTMLInputElement).focus();
        return;
      }
      handleSubmit(subject, description, selectedMode).catch((err: unknown) => {
        console.warn('[bug-report-widget] handleSubmit threw:', err);
      });
    });
```

**Step 4: Update handleSubmit signature and call**

Update the `handleSubmit` function (around line 217) to accept and pass `mode`:

```typescript
  async function handleSubmit(subject: string, description: string, mode: 'ralph' | 'gsd'): Promise<void> {
    const { submitReport } = await import('./submit.js');
    state = 'submitting';
    renderPanel();

    const metadata = collectMetadata();
    const result = await submitReport({
      projectId: config.projectId,
      apiUrl: config.apiUrl,
      subject,
      description,
      metadata,
      autoScreenshot,
      attachedImages: uploadHandler.getImages(),
      mode,
    }).catch((err: unknown) => {
      console.warn('[bug-report-widget] submitReport threw unexpectedly:', err);
      return { ok: false, message: 'Unexpected error' };
    });

    errorMessage = result.message || 'Submission failed. Please try again.';
    state = result.ok ? 'success' : 'error';
    renderPanel();
  }
```

**Step 5: Commit**

```bash
git add widget/src/widget.ts widget/src/styles/widget.css
git commit -m "feat(widget): add Quick fix / Needs investigation toggle"
```

---

### Task 3: Pass mode through widget submit

**Files:**
- Modify: `widget/src/submit.ts:13`

**Step 1: Add mode to FormData**

In `submitReport()`, add the mode field to the form data. After `form.append('metadata', JSON.stringify(metadata));` (line 17), add:

```typescript
    form.append('mode', mode);
```

**Step 2: Commit**

```bash
git add widget/src/submit.ts
git commit -m "feat(widget): include mode in report FormData"
```

---

### Task 4: Pass mode through backend

**Files:**
- Modify: `backend/src/services/relay.ts:4-20`
- Modify: `backend/src/routes/report.ts:36-41,125-144`

**Step 1: Add mode to RelayFixPayload**

In `backend/src/services/relay.ts`, add `mode` to the `RelayFixPayload` interface:

```typescript
export interface RelayFixPayload {
  issueId: number;
  issueUrl: string;
  issueTitle: string;
  owner: string;
  repo: string;
  mode: 'ralph' | 'gsd';
  triageResult: {
    verdict: "auto-fix";
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

**Step 2: Extract mode from request body**

In `backend/src/routes/report.ts`, update the field extraction (around line 36) to include `mode`:

```typescript
      const { projectId, subject, description, mode } = req.body as {
        projectId?: string;
        subject?: string;
        description?: string;
        metadata?: string;
        mode?: string;
      };
```

**Step 3: Pass mode in notifyRelay call**

In the same file, update the `notifyRelay()` call (around line 126) to include mode:

```typescript
        notifyRelay({
          issueId,
          issueUrl,
          issueTitle: subject,
          owner: repo.owner,
          repo: repo.repo,
          mode: mode === 'gsd' ? 'gsd' : 'ralph',
          triageResult: {
            verdict: "auto-fix",
            confidence: triageResult.confidence,
            reasoning: triageResult.reasoning,
          },
          reportData: {
            subject,
            description,
            screenshotUrls,
          },
        });
```

**Step 4: Also update the webhook handler default**

In `backend/src/services/relay.ts`, in the `registerRelayWebhook` function (around line 139), add `mode: 'ralph'` to the relay payload (webhooks are always Ralph — only widget submissions can choose GSD):

```typescript
      const relayPayload: RelayFixPayload = {
        issueId,
        issueUrl,
        issueTitle,
        owner,
        repo,
        mode: 'ralph',
        triageResult: { ... },
        ...
      };
```

**Step 5: Commit**

```bash
git add backend/src/services/relay.ts backend/src/routes/report.ts
git commit -m "feat(backend): pass mode through relay payload"
```

---

### Task 5: Create GSD todo service in relay

**Files:**
- Create: `relay/src/services/gsd-todo.ts`

**Step 1: Create the service**

```typescript
import { spawn } from 'node:child_process';
import type { RelayFixRequest } from '../types.js';

const CLAUDE_TIMEOUT_MS = 5 * 60_000; // 5 minutes

/**
 * Builds a todo description from the bug report data.
 * Includes all context the user will need when picking up the todo.
 */
function buildTodoDescription(data: RelayFixRequest): string {
  const screenshots = data.reportData.screenshotUrls.length > 0
    ? data.reportData.screenshotUrls.map((u) => `- ${u}`).join('\n')
    : 'None provided';

  return [
    `Fix bug: ${data.issueTitle}`,
    '',
    `Issue: ${data.issueUrl}`,
    `Repo: ${data.owner}/${data.repo}`,
    '',
    `What was reported:`,
    `Subject: ${data.reportData.subject}`,
    data.reportData.description,
    '',
    `Screenshots:`,
    screenshots,
    '',
    `AI Triage: ${data.triageResult.reasoning} (confidence: ${data.triageResult.confidence})`,
  ].join('\n');
}

/**
 * Spawns Claude CLI to run /gsd:add-todo in the project directory.
 * Runs detached so the relay doesn't wait for it.
 */
export function spawnGsdTodo(projectDir: string, data: RelayFixRequest): void {
  const description = buildTodoDescription(data);
  const tag = `${data.owner}/${data.repo}#${data.issueId}`;

  const prompt = `Run /gsd:add-todo with this description:\n\n${description}`;

  const claude = spawn(
    'claude',
    [
      '-p',
      prompt,
      '--output-format',
      'text',
      '--allowedTools',
      'Read,Write,Glob,Skill',
    ],
    {
      cwd: projectDir,
      detached: true,
      stdio: 'ignore',
    }
  );

  claude.on('close', (code) => {
    console.log(`[gsd-todo] claude exited for ${tag} (code: ${code})`);
  });

  claude.on('error', (err) => {
    console.error(`[gsd-todo] spawn error for ${tag}: ${err}`);
  });

  claude.unref();
  console.log(`[gsd-todo] spawned for ${tag} (pid: ${claude.pid})`);
}
```

**Step 2: Commit**

```bash
git add relay/src/services/gsd-todo.ts
git commit -m "feat(relay): add gsd-todo service for spawning add-todo via Claude CLI"
```

---

### Task 6: Add mode to relay types and route branching

**Files:**
- Modify: `relay/src/types.ts:1-17`
- Modify: `relay/src/routes/fix.ts`

**Step 1: Add mode to RelayFixRequest**

In `relay/src/types.ts`, add `mode` to the interface:

```typescript
export interface RelayFixRequest {
  issueId: number;
  issueUrl: string;
  issueTitle: string;
  owner: string;
  repo: string;
  mode: 'ralph' | 'gsd';
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

**Step 2: Add mode to Zod schema**

In `relay/src/routes/fix.ts`, add `mode` to `FixRequestSchema`:

```typescript
const FixRequestSchema = z.object({
  issueId: z.number(),
  issueUrl: z.string().url(),
  issueTitle: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  mode: z.enum(['ralph', 'gsd']).default('ralph'),
  triageResult: z.object({
    verdict: z.literal('auto-fix'),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  }),
  reportData: z.object({
    subject: z.string(),
    description: z.string(),
    screenshotUrls: z.array(z.string()),
  }),
});
```

**Step 3: Add import for gsd-todo**

Add to imports at top of `relay/src/routes/fix.ts`:

```typescript
import { spawnGsdTodo } from '../services/gsd-todo.js';
```

**Step 4: Branch on mode in the queue handler**

Replace the queue handler body (lines 56-81) with mode-aware branching:

```typescript
  enqueue(data.repo, async () => {
    const projectDir = resolveProjectDir(data.repo);

    if (data.mode === 'gsd') {
      // GSD path: spawn Claude to add a todo — no fix_plan, no Ralph
      console.log(`[fix] ▶ GSD todo path for ${dedupeKey}`);
      spawnGsdTodo(projectDir, data);
      console.log(`[fix] ▶ GSD todo spawned for ${dedupeKey}`);
    } else {
      // Ralph path: existing flow
      console.log(`[fix] ▶ starting Claude analysis for ${dedupeKey}`);
      try {
        await analyzeBugAndCreatePlan(projectDir, data);
      } catch (err) {
        console.error(`[fix] Claude analysis failed for ${dedupeKey}: ${err}`);
        const section = buildBugReportSection(data);
        await appendToFixPlan(data.repo, section);
        console.log(`[fix] appended fallback bug report to fix_plan.md for ${data.repo}`);
      }

      spawnRalph(projectDir, data.repo);
      watchFix(data.owner, data.repo, data.issueId, data.repo);
      console.log(`[fix] ▶ pipeline active for ${dedupeKey} — watcher started`);
    }
  });
```

Note: GSD path skips `watchFix` since there's no autonomous runner to time out — the user picks up the todo manually.

**Step 5: Commit**

```bash
git add relay/src/types.ts relay/src/routes/fix.ts
git commit -m "feat(relay): route bugs to Ralph or GSD based on mode"
```

---

### Task 7: Update CLAUDE.md

**Files:**
- Modify: `/Users/miro/Workspace/PERSONAL/ralph-workspace/CLAUDE.md:44-75`

**Step 1: Update Bug Report Handling section**

Replace the Bug Report Handling section to document both paths:

```markdown
## Bug Report Handling

Bug reports are routed based on the `mode` field set in the widget:

- **`ralph` (Quick fix):** Claude analyzes the bug → appends to `fix_plan.md` → Ralph fixes autonomously
- **`gsd` (Needs investigation):** Claude spawns `/gsd:add-todo` in the project dir → user picks up with `/gsd:check-todos`

The relay handles routing automatically. Each project must have:
- `.ralph/` directory (for Ralph mode)
- `.planning/` with GSD initialized in YOLO mode (for GSD mode)
```

**Step 2: Commit**

```bash
git add /Users/miro/Workspace/PERSONAL/ralph-workspace/CLAUDE.md
git commit -m "docs: update CLAUDE.md for hybrid Ralph/GSD routing"
```

---

### Task 8: Build and verify

**Step 1: Build widget**

```bash
cd /Users/miro/Workspace/PERSONAL/ralph-workspace/bug-report/widget && npm run build
```

Expected: Clean build, no TypeScript errors.

**Step 2: Build relay**

```bash
cd /Users/miro/Workspace/PERSONAL/ralph-workspace/bug-report/relay && npx tsc --noEmit
```

Expected: No type errors.

**Step 3: Build backend**

```bash
cd /Users/miro/Workspace/PERSONAL/ralph-workspace/bug-report/backend && npx tsc --noEmit
```

Expected: No type errors.

**Step 4: Commit final build artifacts if any**

```bash
git add -A && git commit -m "chore: rebuild widget dist"
```
