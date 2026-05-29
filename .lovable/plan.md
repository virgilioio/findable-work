# Plan — Stop the clarify JSON from leaking into chat text

The model emitted the clarify payload as **plain assistant text** instead of calling `ask_clarifying_questions`. Result: the user saw raw JSON in the chat, no pill-shaped card. Fix on both ends — make it less likely to happen (prompt), and bullet-proof it when it does (server-side guard).

## 1. Prompt hardening (`prompts.slug = 'chat.main'`)

Add an explicit "how to ask" rule near the existing clarify rules:

> When you need to ask the user a structured question (countries to target, seniority levels, languages, etc.), you MUST call the `ask_clarifying_questions` tool. NEVER write the question JSON in your assistant message. NEVER paste `{"intro":...,"questions":[...]}` or any tool-shaped payload into chat text. If you find yourself about to type that JSON, stop and emit a tool call instead. Do not narrate "I sent a picker" before the tool actually runs.

Apply via a migration that appends to the chat.main body and bumps `version` (same shape as the formatting-rule migration we did earlier).

## 2. Server-side safety net (`src/routes/api/chat.ts`)

When the model leaks the clarify payload as text, recover it instead of showing it.

After `streamCompletion` returns on each iteration, scan the assistant `text` for an embedded clarify JSON object (a `{...}` blob containing a `questions` array whose items look like `{id,label,type}`). If found:

- Parse + validate it with the same normalization used in the `ask_clarifying_questions` branch (id/label/type/options/placeholder/allow_other, max 4 questions).
- Insert a real `agent_tasks` row with `kind: 'clarify'` and emit `send("task", ...)` so the pretty card renders, exactly like a real tool call.
- Strip the JSON blob from the assistant text before it gets accumulated into `preText` / `postText` and persisted. Also strip any adjacent "I sent a quick picker…" sentence that references it (simple: drop the line containing the JSON, and trim trailing/leading blank lines).
- Re-emit a `delta` correction is too messy; instead, after stripping, send a new SSE event (e.g. `text_replace`) carrying the cleaned text so the client can replace what it already streamed.

To avoid client churn: simplest is to detect the leak **before** the first `delta` is forwarded — buffer text until we know whether it looks like a clarify leak. That adds latency to every message. Better trade-off: send deltas live as today, and on detection send a single `clarify_recovered` SSE event with `{ cleaned_text, task }`; the client replaces the in-flight assistant bubble's content with `cleaned_text` and inserts the task card. Persisted DB row uses the cleaned text.

### Detection regex / shape

Match `\{[^{}]*"questions"\s*:\s*\[[\s\S]*?\]\s*[^{}]*\}` with brace-balance verification (count `{` / `}`). Validate parsed object has `Array.isArray(obj.questions)` and at least one item with string `id` and `label`. Reject if it doesn't validate.

### Client change (`src/routes/_authenticated/app.c.$id.tsx`)

Handle the new SSE event:
- On `clarify_recovered`: replace the currently-streaming assistant message's content with `cleaned_text`; append the recovered task into the per-message task list (same path as `task` events).

No new dependencies. No DB schema changes.

## Technical notes

- Files touched: `src/routes/api/chat.ts` (detection + new SSE event), `src/routes/_authenticated/app.c.$id.tsx` (handle new event), plus a prompt migration row.
- Same recovery logic applies to any future tool-shaped JSON leaks, but for now we only handle clarify (the only case observed).
- Public guest chat (`src/routes/api/public/guest-chat.ts`) is a separate handler — out of scope unless the same leak shows up there; flag it for later if needed.
