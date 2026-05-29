# Two chat-panel bugs, both in `src/routes/_authenticated/app.c.$id.tsx`

## Bug 1 — Nothing visible after submitting a clarify card

The ThinkingTicker is the only "something is happening" indicator. It hides itself once the answer starts streaming (`answered = Boolean(streaming)` and `reasoning === ""` → returns `null`). Real turn shape is:

1. short pre-tool prose → `streaming` becomes truthy → ticker collapses/hides
2. tools run for many seconds (task cards stream, but no text deltas)
3. post-tool prose

During step 2 there is no indicator. After the clarify card submit this is the entire visible experience for ~10s, so it looks dead.

## Bug 2 — Task cards "disappear suddenly" at end of stream

In the stream `finally`:

```ts
setStreamEnd(Date.now());
setStreaming("");
setLiveTasks([]);                 // ← cleared immediately
await qc.invalidateQueries(...);  // ← refetch happens AFTER
```

Live cards are wiped the instant the stream closes. The refetched messages + `persistedTasks` arrive one tick (or more) later, so the cards blink out and then back in. Previously stable because the old code refetched-then-cleared; the reasoning/leak refactor changed the order.

# Plan (UI only, single file)

All edits in `src/routes/_authenticated/app.c.$id.tsx`. No server, prompt, or migration changes.

## 1. Keep tasks visible across the handoff

- Do **not** call `setLiveTasks([])` in the stream `finally`.
- After `await qc.invalidateQueries(...)` resolves, then clear: `setLiveTasks([])`.
- In the render block, dedupe so a task that already exists in `persistedTasks` for the just-persisted assistant message is not double-rendered. Simplest: when rendering `liveTasks`, filter out any `t.id` that already appears in `persistedTasks`. This handles the rare overlap window cleanly.
- Also clear `liveTasks` at the top of `sendMessage` (already done) so the next turn starts fresh.

## 2. Always show a "working" indicator while the backend is active

Introduce a small, always-on activity row that renders whenever `sending === true`, independent of the ThinkingTicker's collapse logic:

- Render a compact pill ("Working" + 3 dots, reusing the existing `thinking-dot` style) at the **bottom** of the live block whenever `sending` is true and the turn is not obviously idle (i.e. always, while `sending`).
- The ThinkingTicker keeps its current behavior for reasoning (live ticker → collapsed "Thought for Ns" chip). The new pill is a separate, smaller "still working" signal that survives across pre-text → tools → post-text transitions.
- Hide the pill the instant `sending` flips to false (stream finished). Because of fix #1, task cards remain on screen during the brief invalidate window, so the transition looks clean.

Optional polish: if `liveTasks` has a task with `status === "running"`, label the pill with that task's `label` (e.g. "Sourcing candidates…") instead of generic "Working". Falls back to "Working" when no running task is present.

## 3. Confirm nothing else regressed

After the edit, sanity-check the render block at lines ~541-575:

- Empty-state branch (`empty`) untouched.
- `messages.map` block untouched (persisted history rendering).
- Live block now: ThinkingTicker (existing) → streaming `before` text → live task cards (filtered) → streaming `after` text → new "working" pill (while `sending`).

# Files touched

- `src/routes/_authenticated/app.c.$id.tsx` — reorder cleanup in `sendMessage` `finally`, dedupe `liveTasks` against `persistedTasks` in render, add persistent "Working" pill while `sending`.

# Out of scope

- Server stream changes, prompt edits, migrations.
- Any change to TaskCard, ClarifyCard, or ThinkingTicker components.
