## Goal

Make findable feel warmer at the start of a new search. Whenever the user kicks off a hire (first turn of a conversation OR a clearly new role later in the same convo), open with one short, upbeat acknowledgement before the clarifying questions or work.

## Where this lives

A single edit to the `chat.main` system prompt in the `prompts` table. No code or UI changes — the assistant already streams prose before its tool calls, so the opener will appear naturally above the clarifying-question card or the first task card.

## Behavior

- Triggers on **Mode C** turns (request to do/produce something new) when the turn introduces a new role/hire:
  - first user turn of the conversation, OR
  - a turn that names a different role than the active project (e.g. user pivots from "SDR" to "designer").
- Does NOT trigger on:
  - Mode A (questions about existing artifacts — "why 18?") — keep these strictly direct.
  - Mode B (small talk).
  - Follow-up Mode C turns on the same role ("also add Berlin", "make the JD punchier") — those stay efficient.
- Format: exactly ONE short line, ≤ 12 words, no emojis, no exclamation pile-ups. Then proceed straight to the clarifying questions or the work.
- Variety: the prompt gives 4–5 example openers and instructs the model to vary phrasing so it doesn't feel templated. Tone is congratulatory about the growth signal, not sycophantic about the user.

### Sample openers (in the prompt as examples, not a fixed list)

- "Exciting — bringing on an SDR is a real growth signal. Let's set this up."
- "Love it. A designer hire usually means a product step-change — let's get the brief right."
- "Great hire to be making. A few quick questions and I'll draft the role."
- "Nice — sales leadership is one of the highest-leverage hires. Let's nail the profile."

## Prompt edit (chat.main)

Add a new "Opener" subsection just under the Mode C heading, roughly:

```text
Mode C openers — new-role kickoff only
─────────────────────────────────────────
If this turn introduces a NEW role (first user turn of the conversation,
or the user pivots to a different role than the active project), begin
your reply with ONE short upbeat line that acknowledges the hire as a
growth moment, then continue straight into clarifying questions or the
first task. ≤ 12 words. No emojis. Vary phrasing — never reuse the same
opener twice in a conversation.

Examples (vary, don't copy verbatim):
- "Exciting — bringing on an SDR is a real growth signal. Let's set this up."
- "Love it. A designer hire usually means a product step-change."
- "Great hire to be making. A few quick questions and I'll draft the role."

Do NOT add this opener on follow-up turns about the same role, on
Mode A (questions/explanations), or on Mode B (small talk).
```

## Rollout

1. Update `prompts.body` for slug `chat.main` (bump `version`).
2. Manually verify in a fresh conversation: "I need an SDR" should produce a warm one-liner then the clarifying-questions card. A follow-up ("make it remote-EU") should NOT add a new opener. A question ("why 18 candidates?") should still answer directly with no opener.

No schema, route, or component changes.
