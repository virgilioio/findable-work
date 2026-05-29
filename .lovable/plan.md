## What's happening

The chat agent (`src/routes/api/chat.ts`) uses one big system prompt stored in the DB (`prompts.chat.main`, editable at `/admin/prompts`). That prompt is heavily weighted toward *driving the recruiting flow forward*:

- "Before sourcing you MUST have title/location/seniority — otherwise call `ask_clarifying_questions` and STOP."
- "Never end a turn with only a summary. Always end with a question or a one-line proposed next move."
- Tool descriptions also nudge: `ask_clarifying_questions` says "use after an empty/limited search to broaden the brief."

There is **no rule for "the user is asking a question about results that already exist."** So when you asked *"why 18 instead of 20?"*, the model pattern-matched on "limited results" → fired `ask_clarifying_questions` to broaden the brief. Technically on-prompt, behaviorally wrong.

A second contributing factor: the `source_candidates` tool result returned to the model is just `{ added, skipped, ... }`. The model doesn't get a clean explanation it can quote back ("we requested 20, pool returned 18 unique matches after dedupe vs your existing pipeline"), so even if it *wanted* to answer factually, it has thin material.

## The fix — two layers

### 1. Teach the prompt to distinguish "drive the flow" vs "answer a question"

Add an explicit **conversation-mode** section near the top of `chat.main`, before the mandatory flow rules. Roughly:

> **First, classify the user's turn:**
> - **Question about existing artifacts / results / numbers / why something happened** → answer directly in prose using the conversation + tool history. Do NOT call `ask_clarifying_questions`. Do NOT call `source_candidates`. End with a light next-step nudge *only if natural*; a plain answer with no question is fine here.
> - **Small talk / acknowledgement** → reply briefly, no tools, no forced next-step.
> - **Request to do/produce something new** → follow the mandatory flow below.
>
> Clarifying questions and the "always end with a proposal" rule apply to the third case only.

Also soften the absolute "never end with a summary" line so it doesn't override answering a factual question.

And tighten `ask_clarifying_questions`'s tool description: *"Only call when the user has asked for new sourcing / a new artifact and required info is missing, or after an empty/limited result when the user has explicitly asked you to try again. Never call it to answer a question about results already on screen."*

### 2. Give the model better material to answer "why N?"

In `src/lib/sourcing/agent.server.ts`, the `source_candidates` handler returns counts but loses the "why fewer than requested" reason. Enrich the tool-result JSON the model sees with:

- `requested` (the limit asked for)
- `added`, `skipped_duplicates`, `pool_limited` (already tracked internally)
- a one-line `summary` string the model can quote, e.g. `"Requested 20, added 18 (2 already in your pipeline)"` or `"Pool only had 18 matching profiles for this brief"`.

This is the single source of truth for the "why 18 instead of 20" answer, so the model isn't guessing.

### 3. Lightweight guardrail (optional, recommended)

In `src/routes/api/chat.ts`, when the latest user message is short and clearly interrogative (heuristic: `?` present, no imperative verbs like *find/source/draft/post*), skip injecting tools other than read-only ones, OR pass `tool_choice: "none"` to the gateway for that turn. This makes it structurally impossible for a follow-up question to trigger `ask_clarifying_questions` / `source_candidates`. Cheap insurance against prompt drift.

## How to keep behavior natural over time

- **The prompt is the contract.** All behavior tuning happens in `/admin/prompts` against `chat.main` — it's versioned and hot-reloaded (60s cache). Treat it like product copy: when you notice an unnatural turn, capture the exact transcript, add or sharpen one rule, save, re-test.
- **Tool descriptions are part of the prompt.** OpenAI/Gemini read them. Keep "when to call" and "when NOT to call" tight in `src/routes/api/chat.ts` next to each tool definition.
- **Tool results are part of the prompt.** Anything the user might ask about afterward ("why?", "how many?", "from where?") should be returned in the tool result JSON in a form the model can quote — don't make it re-derive facts.
- **Test matrix:** keep a short list of canonical follow-ups to spot-check after any prompt edit — "why N candidates?", "can you explain this candidate?", "what's in the JD?", "thanks", "actually let's also add Berlin". Run them in a fresh conversation; if any feel unnatural, that's a prompt bug, not a model bug.

## Files touched

- `prompts.chat.main` row in the DB (edit via `/admin/prompts`) — add conversation-mode classifier, soften "always end with a question".
- `src/routes/api/chat.ts` — sharpen `ask_clarifying_questions` tool description; optionally add the interrogative-turn guardrail (`tool_choice: "none"`).
- `src/lib/sourcing/agent.server.ts` — enrich the `source_candidates` tool-result JSON with `requested`, `skipped_duplicates`, `pool_limited`, and a human `summary` string.

No schema changes, no new deps.