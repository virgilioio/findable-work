# Agentic chat + working sourcing pipeline

## Goals

1. **Agentic UI**: When findable works, the chat shows live "task cards" inline (one per step) that animate from `running → done` (or `failed`), with a short label, optional sub-status, and a result summary. Multiple tasks can run/queue in a single assistant turn. This matches the recording feel.
2. **Sourcing actually works**: From a normal chat ("find me 20 SDRs in Mexico City"), the agent runs the full Apollo+PDL pipeline and lands real rows in the Candidates tab — no new buttons or panels required (golden rule: no UI redesign).

## How a turn flows after this change

```text
User: "Find 20 SDRs for the HR-Tech SDR role, Mexico, remote"
findable: (streams text) "On it — scoping and sourcing now."
  [task] Normalize the brief                ✓
  [task] Research titles + companies        ✓  (12 titles, 8 companies)
  [task] Search Apollo + PDL                ✓  (847 candidates, 312 after dedupe)
  [task] Collect top 20 into Candidates     ✓  (20 added, 0 skipped)
findable: "Added 20 candidates to the Candidates tab. Want me to filter for SaaS background?"
```

The Candidates tab pulse-highlights (same pattern as the Job tab today) when new rows arrive.

## What we build

### 1. Task records (backend + stream)

New table `agent_tasks` (RLS by `user_id`):
- `id`, `user_id`, `conversation_id`, `message_id` (parent assistant msg), `kind` (enum: `normalize | research | search | collect | create_job`), `label`, `status` (`running | done | failed`), `summary` (short result text), `data` jsonb (counts, ids), `started_at`, `finished_at`.
- Server emits SSE `event: task` payloads on create/update so the UI can render and animate without a refetch.
- On reconnect / page refresh, tasks are reloaded from the table next to messages.

### 2. Agent tools wired into `/api/chat`

Add three tools (the model can call them in any order, in parallel with `create_job`):

- `source_candidates({ brief?: string, refine?: string, limit?: number })` — creates/reuses a `sourcing_projects` row for this conversation, runs normalize → research → `runSourcingSearch` → auto-`collectCandidates` for top N (default 20, cap 50). Streams one task per stage. Returns `{ added, skipped, preview_total }`.
- `refine_search({ add_titles?: [], add_companies?: [], add_keywords?: [], locations?: [] })` — updates `search_criteria`, reruns search, re-collects new top-N delta. (Same task pattern.)
- Keep `create_job` as-is.

The model's system prompt is updated so it knows: "When the user asks to source / find / pull candidates, call `source_candidates`. Don't ask 10 questions first — call it with what you have, then refine."

### 3. Stream protocol additions

The existing SSE stream already emits `delta`, `job`, `error`, `done`. We add:
- `event: task` with `{ id, kind, label, status, summary, data }` — sent on insert and on every status change. UI upserts by `id`.
- `event: candidates_added` with `{ count }` — triggers the Candidates tab pulse + query invalidation, same way `job` triggers the Job tab pulse today.

### 4. UI: inline task cards

In `app.c.$id.tsx` `ChatPanel`:
- Group tasks under the assistant message they belong to (by `message_id`; live tasks during streaming attach to the in-flight assistant bubble).
- New `<TaskCard>` component (small, dense, monospace counters): icon + label on the left, status pill on the right, animated shimmer while `running`, check on `done`, subtle red on `failed`. `summary` shown when present.
- Tasks fade-in (`animate-fade-in`) and the status pill scale-pulses on transition. No external animation libs — uses the existing tailwind keyframes (`fade-in`, `scale-in`, `pulse`).
- Persisted tasks are loaded by `getConversation` and rendered the same way for history.

### 5. Candidates pulse

When the stream emits `candidates_added`, the conversation page invalidates `["candidates", id]` and briefly pulses the Candidates tab — mirrors the existing `jobCreated` flow for the Job tab. Zero changes to `CandidatesPanel` internals.

## Files touched

- **DB migration** (new): `agent_tasks` table + RLS + grants.
- `src/lib/conversations.functions.ts`: include `agent_tasks` in `getConversation`.
- `src/routes/api/chat.ts`: add `source_candidates` + `refine_search` tools, task insert/update helpers, stream `event: task` and `event: candidates_added`, updated system prompt.
- `src/lib/sourcing/agent.server.ts` (new): orchestrator that ties `normalize → research → runSourcingSearch → collectCandidates` together and emits task callbacks. Reuses every existing file in `src/lib/sourcing/`.
- `src/routes/app.c.$id.tsx`: parse `task` + `candidates_added` SSE events, group tasks by assistant message, render `<TaskCard>` inside the assistant bubble, pulse Candidates tab.
- `src/components/chat/task-card.tsx` (new): small presentational component.

## Explicitly NOT in scope

- No redesign of Chat / Job / Candidates panels — only inline task cards inside existing assistant bubbles + a tab pulse.
- No new top-level routes, no sidebar changes, no "Sourcing" page.
- No credit limits (still no enforcement, per earlier decision).
- No phone webhook, no standard lookup tables.

## Order of work

1. Migration: `agent_tasks` + grants + RLS.
2. `src/lib/sourcing/agent.server.ts` orchestrator with task callbacks.
3. `/api/chat`: register `source_candidates` + `refine_search`, emit `task` / `candidates_added` events, update system prompt.
4. `getConversation`: include tasks.
5. `app.c.$id.tsx`: parse new events, render task cards, pulse Candidates tab.
6. `TaskCard` component + animations.
7. Smoke test: send "find 5 SDRs in Mexico City"; verify tasks appear, complete, and Candidates tab fills.
