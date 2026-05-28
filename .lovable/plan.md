## Problem

Your latest search returned no candidates because the chat handler ran **only one tool pass**. The model called `create_job`, then in its second-pass narration said "Now I'll source candidates…" — but that pass is treated as the final summary, so `source_candidates` was never executed. No sourcing project, no previews, no candidates.

Verified in DB: assistant message for conversation `1852b70a…` has `tool_calls = [create_job]` only; no `sourcing_projects` row exists for it.

## Fix

Two small, surgical changes in `src/routes/api/chat.ts`:

### 1. Agent loop (primary fix)

Replace the current "first pass → tool exec → second pass for summary" flow with a bounded loop:

```text
messages = baseMessages
for i in 0..MAX_ITERS (5):
  result = streamCompletion(messages)
  if result.toolCalls is empty: break
  execute tools, collect tool results
  messages = [...messages, assistantMsg(result.toolCalls), ...toolResults]
combinedText = concatenation of all streamed text segments
persist final assistant message with the toolCalls from the FIRST pass
  (keeps existing UI behavior — task cards still link to that message)
```

- Re-use the existing `create_job` / `source_candidates` / `ask_clarifying_questions` execution branches as-is.
- Keep emitting `delta`, `task`, `job`, `candidates_added` SSE events unchanged.
- Cap iterations (5) to prevent runaway loops.
- Emit a `"\n\n"` delta between passes (same visual split we have today).

### 2. Prompt nudge (belt-and-suspenders)

Add one line to `SYSTEM_PROMPT` step 2:

> When you call `create_job` and `source_candidates` in the same turn, emit them as **parallel tool calls in the same response** — do not narrate between them.

This pushes gpt-5-mini to batch the two calls, which the loop will also cover if it doesn't.

## Out of scope

- No changes to `runSourcingAgent`, Apollo/PDL search, or the candidates UI.
- No DB/schema changes.
- No model swap.

## Verification

- New conversation: "Find GTM marketing managers in LATAM" → expect both a Job card and a Sourced-candidates card in one turn, and a `sourcing_projects` row to appear.
- Existing flows (clarifying questions only, job-only edits) still work because the loop simply exits when there are no more tool calls.
