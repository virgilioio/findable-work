# Root cause: tasks become orphaned when the assistant-message link step is missed

## What's actually happening

In `src/routes/api/chat.ts` the turn lifecycle is currently:

1. Insert the user message (line 440).
2. Stream the model. Every time a task card fires we insert into `agent_tasks` with `conversation_id` set but **`message_id = null`** (e.g. lines 659, 731, 853, 909, 973). The `id` is sent to the client via `send("task", ...)` so it renders as a live card.
3. After the loop, insert the assistant message with the full content (lines 1232-1242).
4. Then update every task in `allTaskIds` to point at the new `assistantMsg.id` (lines 1244-1251).

The chat panel renders persisted tasks with `persistedTasks.filter(t => t.message_id === m.id)`. If step 4 is skipped or partially fails for **any** reason, the tasks stay in the DB with `message_id = null`, get fetched by `getConversation`, but match no message — so they vanish from the UI even though they're sitting right there in `agent_tasks`.

Step 4 silently fails or is skipped in several real situations:
- Stream `try` throws after inserting tasks but before the message insert (any error in the closing prose pass, the forced-no-tools pass, the title update, etc. lands in the `catch` at line 1254 — linkage code never runs).
- The assistant-message insert succeeds but returns no row (`assistantMsg` is null) — the guard `if (assistantMsg && allTaskIds.length > 0)` skips linkage.
- The `.update().in()` call returns an error: no error check, no retry.
- The client drops the connection partway (tab closed / refresh) — the request handler aborts mid-stream on the worker, message + linkage never happen, but the tasks are already in DB.

This is exactly the "used to be stable, now disappears" pattern — the orphan window has always been there, but it became more exposed once we added more error-prone steps (reasoning channel, leak detector, forced closing-prose pass).

## Fix (server, surgical)

All edits in `src/routes/api/chat.ts`.

### 1. Create the assistant message FIRST, link tasks from the start

Right after we insert the user message (around line 445), insert an empty assistant row and remember its id:

```ts
const { data: assistantRow } = await supabaseAdmin
  .from("messages")
  .insert({
    conversation_id: conversationId,
    user_id: userId,
    role: "assistant",
    content: "",          // filled in at the end
    tool_calls: null,
  })
  .select("id")
  .single();
const assistantMessageId = assistantRow?.id ?? null;
```

If `assistantMessageId` is null (rare DB failure), keep current behavior — but log loudly.

### 2. Set `message_id` on every `agent_tasks` insert during the turn

Each of the 5 task inserts at lines 659, 731, 853, 909, 973 currently passes `{ user_id, conversation_id, kind, label, ... }`. Add `message_id: assistantMessageId` to every one of those payloads. This guarantees the task is bound to the assistant message at the moment it's created — no "later linkage" step needed.

### 3. Replace the "insert assistant message" block at the end with an UPDATE

At lines 1232-1251, instead of `insert`, do:

```ts
await supabaseAdmin
  .from("messages")
  .update({ content: combinedText, tool_calls: toolCallsForDb })
  .eq("id", assistantMessageId);
// Linkage step is no longer needed — tasks were inserted with message_id already set.
send("done", { ok: true, candidates_added: candidatesAddedTotal, job: jobCreatedRow });
```

Drop the post-hoc `agent_tasks` UPDATE entirely. The `tasks_linked` SSE event also becomes unnecessary — the client doesn't need it once tasks are pre-linked.

### 4. Make the error path safe

Inside the existing `catch` at line 1254, also flush whatever prose has been accumulated so far into the assistant message UPDATE (don't leave it empty). Today an exception means the assistant row has `content = ""` and the user sees "no reply" — even if tasks succeeded. This costs us nothing and rescues partial turns.

## Why this fixes "tasks disappear"

- Tasks are linked atomically at creation, so any later failure cannot orphan them.
- The assistant row exists from the start, so even a fatal mid-stream error leaves a real message + linked tasks that render correctly on refetch.
- The "tasks_linked" race window goes to zero — no period where DB has tasks with `message_id = null`.

## Frontend safety net (one tiny render-only change)

In `src/routes/_authenticated/app.c.$id.tsx`, in the `messages.map` render, render any `persistedTasks` whose `message_id` matches OR (as a defensive fallback for any pre-existing orphan rows from before the fix) tasks with `message_id === null` attached to the **last** assistant message in the list. This is read-only, doesn't change DB, and immediately rescues any pre-existing orphans in the user's current conversations.

## Files touched

- `src/routes/api/chat.ts` — pre-create assistant message, set `message_id` on every task insert, switch end-of-stream insert → update, drop the linkage step.
- `src/routes/_authenticated/app.c.$id.tsx` — render orphan tasks under the most recent assistant message as a safety net.

## Out of scope

- Prompt/migration changes.
- Any change to ThinkingTicker, WorkingPill, TaskCard, ClarifyCard.
- Stream protocol changes beyond removing the now-redundant `tasks_linked` event.
