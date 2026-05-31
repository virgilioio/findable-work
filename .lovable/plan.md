**1. Recommended badge → solid black pill**
File: `src/components/chat/task-card.tsx`
In the proposal card, change the "Recommended" badge classes from the muted outlined style to a solid dark pill using semantic tokens (`bg-text text-bg`, no border), so it pops like in the reference render.

**2. Always render "Suggested next steps" after the wrap-up text**
File: `src/routes/_authenticated/app.c.$id.tsx`
Today, all tasks for an assistant message (artifact cards + the `proposal` card) render between the `before` text and the `after` wrap-up text. So the proposal pills appear before the model's closing line.

Update the two rendering blocks (persisted messages ~L557–589 and the live stream ~L605–634) to split tasks into:
- `artifactTasks` = `kind !== "proposal"`
- `proposalTasks` = `kind === "proposal"`

New per-message order:
1. `before` text
2. artifact task cards
3. `after` text (model wrap-up)
4. proposal card (Suggested next steps)

No backend changes — `src/routes/api/chat.ts` already emits the proposal correctly; this is purely a render-order change so the next-steps card always feels like the next decision, not something buried mid-message.