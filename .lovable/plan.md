# Split the two pills by phase

Today both pills render whenever `sending` is true, so they stack. Make them mutually exclusive by phase:

- **Thinking** = pre-tool reasoning phase. Show the live ThinkingTicker pill only while `sending` is true AND no tasks have started yet (`liveTasks.length === 0`). Once any task appears, the ticker collapses to its existing "Thought for Ns" chip (still expandable to show full reasoning).
- **Working** = task/tool phase. Show WorkingPill only while `sending` is true AND `liveTasks.length > 0`. Label remains the running task's `label`, falling back to "Working" when no task is currently `running` (e.g. between tasks or while the closing prose is being composed).

Net effect: only one of the two pills is ever animating at the same time. The collapsed "Thought for Ns" chip from ThinkingTicker can coexist with the Working pill — that's fine; it's a static chip, not an animation.

## Implementation

One file: `src/routes/_authenticated/app.c.$id.tsx`.

1. In the live render block, change the ThinkingTicker condition from `(sending || reasoning)` to: show when `reasoning` exists OR (`sending` and no live tasks). Pass `answered = Boolean(streaming) || liveTasks.length > 0` so the ticker collapses to chip as soon as the first task arrives.
2. Change the WorkingPill condition from `sending` to `sending && liveTasks.length > 0`.
3. No changes to ThinkingTicker, TaskCard, or styles.

## Out of scope

- Server stream changes, prompt edits, migrations.
- Visual restyle of either pill.
