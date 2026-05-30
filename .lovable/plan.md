## What we're building

After the AI finishes Job + Candidates (or any batch of work), it posts a **proposal block** of clickable pills in the chat for the remaining optional steps. Clicking a pill kicks off that step (Job Posts or Outreach), the AI confirms, then re-posts a fresh proposal with one fewer pill — until nothing is left.

Free text always works in parallel; pills are just a visual shortcut.

## Scope vs the spec

The uploaded spec lists 3 optional steps: **Job Posts, Outreach, Interviews**. Findable today only has tabs for Job Posts and Outreach — there is no Interviews tab/feature yet. I'll wire pills only for steps that exist (Job Posts, Outreach). Adding Interviews is a separate feature.

## UX

A new task card type `proposal` renders as a vertical stack of pill cards inside the chat (reusing the existing `TaskCard` chrome with icon tile + title + subtitle + arrow). Differences vs current artifact cards:
- "Recommended" badge on the first pill.
- Hairline border, rounded 12px, hover state shifts border/bg.
- Faint hint below: *"Pick one, or just tell me what you'd like to do."*
- Disabled while `sending` is true.
- **Only the most recent `proposal` task is interactive** — earlier ones render nothing (computed at render time by finding the last proposal index across persistedTasks + liveTasks).
- When the remaining-step set is empty, render `"✓ Everything's set up — tell me what to refine."` with no pills.

## Backend changes (`src/routes/api/chat.ts`)

1. After the agent loop finishes a turn, compute which optional tabs the conversation is missing (`job_posts`, `outreach`) by checking the existing `jobPost` / `outreach` rows for the conversation.
2. If at least one is missing AND the turn produced new artifacts (job created OR candidates added OR posts/outreach created), emit a new task event:
   ```
   { kind: "proposal", label: "Suggested next steps", status: "done",
     data: { steps: [{ key: "job_posts", title, subtitle, recommended: true }, ...] } }
   ```
3. Persist it in the `chat_tasks` table like other tasks so it survives reload.
4. Add an internal prompt note instructing the model to keep its closing assistant text short (one line) — the pills do the work.

## Frontend changes

**`src/components/chat/task-card.tsx`**
- Add `proposal` branch that renders a stack of pill buttons.
- Each pill: icon tile (Megaphone for job_posts, Send for outreach), bold title, muted subtitle, trailing arrow, optional "Recommended" badge.
- Props: `onProposalClick(step: { key, prompt })`, `interactive: boolean`, `disabled: boolean`.

**`src/routes/_authenticated/app.c.$id.tsx`**
- In `ChatPanel`, when rendering tasks compute `lastProposalIndex` across the combined task list; pass `interactive` only to that one. Older proposal tasks render nothing.
- Add `onProposalClick(step)` handler that calls `sendMessage(prompt)` with a canned per-step prompt:
  - `job_posts`: "Draft the job posts for this role."
  - `outreach`: "Set up the outreach messages for the shortlist."
- Pass `disabled={sending}` so pills lock during streaming.

## State & invalidation

- Reuses existing pulse + tab-spawn animations (Job Posts / Outreach already pulse when their event fires) — no new animation work.
- Reuses `chat_tasks` table — no migration needed; `proposal` is just a new `kind` string and a `data` JSON shape.

## Files touched

- `src/routes/api/chat.ts` — emit + persist `proposal` task events after each turn.
- `src/components/chat/task-card.tsx` — render `proposal` kind as pill block.
- `src/routes/_authenticated/app.c.$id.tsx` — collapse older proposals, wire click handler.

## Out of scope

- Interviews tab/feature (would need its own panel, DB table, builder).
- Changing the agent's clarifying-question behavior (separate ongoing work).
- Any DB migration — `chat_tasks.data` already accepts arbitrary JSON.
