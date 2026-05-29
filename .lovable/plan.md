# Limit clarify cards to one per assistant turn

The Job-tab refinement just produced two clarify cards at once. The model can emit multiple `ask_clarifying_questions` tool calls in a single streaming pass (or across MAX_ITERS iterations within one turn), and `src/routes/api/chat.ts` happily inserts an `agent_tasks` row for every one of them, so the chat ends up rendering two stacked refinement cards.

The user's rule: **at most one clarify card per assistant turn.** If the model decides it needs more info after the user answers the first card, that's a fresh turn and a fresh card — which is already how it works.

## Change

`src/routes/api/chat.ts` only.

1. Introduce a single `clarifyEmittedThisTurn` flag at the top of the per-turn block (alongside `allTaskIds`, `toolsRanAny`, etc.).
2. **Real tool call path** (`call.name === "ask_clarifying_questions"`, ~line 910):
   - If `clarifyEmittedThisTurn` is already true, **skip** the insert + `send("task", …)`. Push a `toolResults` entry explaining the model asked again — `{ ok: false, reason: "already_asked", message: "A clarify card was already shown this turn. Wait for the user's answers before asking again." }` — so the model can adapt.
   - Otherwise, perform the insert as today and flip the flag to true.
3. **Leak-recovery path** (`extractLeakedClarify`, ~line 678): same gate. If the flag is already true, drop the leaked payload silently (still strip the JSON from `pass.text` so the user doesn't see the raw blob), and do not insert a second task.
4. Also strengthen the tool description for `ask_clarifying_questions` to say: "Call at most once per turn. If you need follow-up details after the user answers, ask in the next turn." This nudges the model in addition to the hard server-side cap.

No frontend changes — the chat already renders whatever tasks the server emits.

## Out of scope

- Onboarding/guest clarify flow (separate route, separate file).
- ThinkingTicker/WorkingPill, task persistence, JD-structure work from prior turns.
- Changing how/whether the model is allowed to ask follow-up clarifies on a later turn.
