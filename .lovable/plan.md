# Make each chat its own data-aware ecosystem

## Goal

Yes — fully possible. Today the assistant only has "do" tools (create job, source candidates, draft posts, draft outreach, ask clarifying questions). It has no way to *read* what's already in the conversation, so if you ask "what's the salary range on this job?", "who are my top 5 candidates here?", or "what did the outreach draft say?", it can only guess from the chat transcript.

Fix: add a small set of read-only "context" tools, scoped to the current `conversation_id` + `user_id`, that the model can call on demand. The model already knows when to call tools — we just need to give it eyes into the conversation's data.

## What it will be able to answer (examples)

- "What's the JD for this role again?" → reads `jobs` row for this conversation
- "How many candidates did we source? What's the breakdown by location/seniority?" → aggregates `candidates`
- "Tell me about Maria Lopez" → reads that `candidates` row (experience, education, match breakdown)
- "What does the LinkedIn outreach say?" → reads `outreach_drafts`
- "What channels is the job post going to?" → reads `job_posts`
- "Who haven't we contacted yet?" / "Who's starred?" → filters `candidates`

## Implementation

### New read tools in `src/routes/api/chat.ts`

Add to the `tools` array (alongside the existing action tools), all scoped server-side to `conversation_id = :conv AND user_id = :user`:

1. **`get_conversation_context`** — no args. Returns a compact snapshot: job (title, location, salary, must/nice/screening), candidate count + stage breakdown, whether outreach + job_post exist. Cheap, used as the model's "what's in this chat?" probe.
2. **`get_job`** — returns the full `jobs` row for the conversation.
3. **`list_candidates`** — args: optional `stage`, `starred`, `min_match`, `limit` (default 20, max 50). Returns name, company, role, location, match, stage, starred, tags, source, contacted_at.
4. **`get_candidate`** — args: `candidate_id` OR `name` (fuzzy). Returns full profile incl. experience, education, match_breakdown, activity.
5. **`get_outreach_draft`** — returns the `outreach_drafts` row (subject, body, LinkedIn template, followups, tone, settings).
6. **`get_job_post`** — returns `job_posts` row (variants, channels, schedule, est_reach, status).

All execute via `supabaseAdmin` with explicit `eq("conversation_id", …).eq("user_id", …)` filters — never trust model-supplied ids without that scope. Results returned as the `tool` message in the existing loop, so the model can cite them in its reply.

### Prompt update (`chat.main`)

Append a short rule via a new migration to `prompts` (bumping version):

> You have read-only tools to inspect this conversation's data: `get_conversation_context`, `get_job`, `list_candidates`, `get_candidate`, `get_outreach_draft`, `get_job_post`. When the user asks anything about the job, candidates, outreach, or job post in this chat — even casually ("how many?", "who is X?", "what does the post say?") — call the relevant tool first, then answer in prose grounded in real data. Never invent counts, names, or content. If a tool returns empty, say so plainly.

Also: on the *first* user message of a session where any artifact exists, the model should call `get_conversation_context` once to ground itself.

### Guard interaction

The existing `looksLikeFollowUpQuestion` guard disables tools for "why/what/how" questions to keep the model from re-sourcing. These new read tools are safe and cheap — so we'll exempt them: when the guard fires, we'll pass `tools: [readTools]` (with `tool_choice: "auto"`) instead of `tools: undefined`. That way "why 12 candidates?" still won't trigger `source_candidates`, but the model *can* call `list_candidates` to actually look.

### No DB schema changes

All data already lives in `jobs`, `candidates`, `outreach_drafts`, `job_posts`, scoped by `conversation_id`. RLS already protects them; the admin client + explicit user_id filter keeps the server path safe.

## Out of scope (call out if you want them too)

- Cross-conversation queries ("across all my jobs, who's my best PM candidate?") — would need a separate global tool set.
- Editing data via chat ("mark Maria as contacted") — read-only for now; can add write tools in a follow-up.
- Vector/semantic search over candidates — current filters are SQL-only.

## Files touched

- `src/routes/api/chat.ts` — add 6 tool definitions + 6 handler branches in the tool-execution switch; tweak the guard branch to allow read tools through.
- `supabase/migrations/<new>.sql` — append the read-tools rule to the `chat.main` prompt and bump its version.
