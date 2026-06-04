## Goal

Today, when the agent sources candidates inside a new conversation and a profile is already in another conversation of the same user, it is silently filtered out (counted in `skipped_duplicates`). The user wants to keep that smart filtering, **but be offered a choice**: include those duplicates in the current conversation too, or not.

## Where the filtering happens

`src/lib/sourcing/agent.server.ts` (lines ~445‑463):

- Selects `candidates.apollo_id` / `pdl_id` for the whole user (`eq("user_id", userId)`).
- Builds `apolloAlready` / `pdlAlready` sets → drops them from `apolloToFetch` / `pdlToInsert`.
- Bumps `skipped` by the number removed.

Right now both kinds of skips (same conversation and other conversation) collapse into one `skipped` count.

## Plan

### 1. Backend — distinguish "skipped in this conversation" vs "skipped from other conversations"

In `agent.server.ts` `runSourcingAgent`:

- Change the dedupe SELECT to also pull `conversation_id, id, name, role, company` (still scoped to this user).
- Build two sets per source:
  - `inThisConv` (apollo_id / pdl_id already attached to `conversationId`) → keep filtering as today.
  - `inOtherConv` (in some other conversation, not this one) → collect a small list `dupesFromOtherConvs: Array<{ source, external_id, candidate_id, name, role, company }>` and **still skip** them by default (preserve current behaviour).
- Subtract these from `apolloToFetch` / `pdlToInsert` exactly like today.
- Return `dupes_from_other_convs` in the agent result alongside `added`, `skipped`, etc.

### 2. Surface the choice in the chat tool result

In `src/routes/api/chat.ts` around line 1011 (`source_candidates` tool result):

- Pass through `dupes_from_other_convs` (id + name + role + company).
- Adjust `summary` so the model mentions: "N profiles from other projects were skipped — ask the user if they want to include them here too." (Just guidance for the model so it phrases it naturally; the actual UI affordance comes from the next step.)

### 3. New server function: `includeExistingCandidatesInConversation`

New file `src/lib/sourcing/include-duplicates.functions.ts`:

- Input: `{ conversationId: uuid, candidateIds: uuid[] (max 50) }`.
- `requireSupabaseAuth`; verify each source candidate belongs to `userId` and is NOT already in `conversationId`.
- Reuse the `cloneInternal` pattern from `source-more.functions.ts` (lines 124‑156) — copy each source row into the conversation with `source: "Internal"`, no credit charge.
- Return `{ added, skipped }`.

### 4. UI affordance — "Also include duplicates" card

Render a lightweight inline action card inside the assistant's `source_candidates` tool result rendering (whatever component shows the sourcing task summary today — find via `task-card.tsx` or wherever the agent task results render). When `dupes_from_other_convs.length > 0` AND none have been included yet for this task:

- One-line copy: "N profile(s) you've already sourced in other projects were skipped" + small list of up to 3 names ("Jane Doe, John Smith and 4 more").
- Two buttons:
  - **Add them here** → calls `includeExistingCandidatesInConversation` with the ids → on success, invalidates the candidates query so they appear in the pipeline; replaces the card with "Added N to this project."
  - **Skip** → dismisses the card locally (persists nothing; can re-decide if they re-source).

No new chat turn is required — this is a pure side-action.

### 5. Out of scope

- `source-more` (already clones internal duplicates by design — that flow is fine).
- `search.functions.ts` previews (preview UI already shows `display_source: "internal"`).
- Any change to credit accounting; clones stay free.
- Visual / brand changes beyond the small inline action card.

## Files touched

- `src/lib/sourcing/agent.server.ts` — return `dupes_from_other_convs`.
- `src/routes/api/chat.ts` — pass new field through tool result + tune `summary`.
- `src/lib/sourcing/include-duplicates.functions.ts` — new server fn.
- One UI component (the agent task / sourcing result card) — render the action card and call the new server fn.
