# Hybrid Bug Report Routing

Route bug reports to Ralph (autonomous) or GSD (queued todo) based on user selection in the widget.

## Data Flow

```
Widget (toggle: Quick fix / Needs investigation)
  -> adds mode: 'ralph' | 'gsd' to FormData
  -> Backend passes mode through to relay payload
  -> Relay branches:
     - mode='ralph': existing flow (Claude analyze -> fix_plan.md -> spawn Ralph)
     - mode='gsd': Claude analyze -> spawn `claude -p "/gsd:add-todo <description>"` from project dir
```

## Changes

### Widget (widget/src/)
- Toggle UI in form: "Quick fix" (default) / "Needs investigation"
- Add `mode` to SubmitArgs type
- Include `mode` in FormData

### Backend (backend/src/)
- Add `mode: 'ralph' | 'gsd'` to RelayFixPayload
- Pass through from report route, default to 'ralph' if missing

### Relay (relay/src/)
- Add `mode` to RelayFixRequest and Zod schema
- fix.ts branches on mode:
  - ralph: existing pipeline (analyze -> fix_plan -> spawnRalph)
  - gsd: analyze -> spawn `claude -p "/gsd:add-todo ..."` in project dir
- New gsd-todo.ts service for spawning the add-todo command

### CLAUDE.md
- Update Bug Report Handling to reflect both paths

## What stays the same
- Dedup, queue, project-resolver, fix-watcher
- Ralph runner (still used for simple bugs)
- Claude analyze step runs for both modes (screenshots need describing)
  - Ralph mode: output goes to fix_plan.md
  - GSD mode: output becomes the todo description
