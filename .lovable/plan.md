## Goal

A ChatGPT/Claude-style app dedicated to recruiting. Left sidebar lists conversations. Each conversation opens a workspace with a Chat tab; as the AI works, it progressively reveals additional tabs (starting with **Job** in v1). Pipeline, Job Posts, etc. are stubs we'll build in later rounds.

## Stack

- **Lovable Cloud** (Supabase) — auth (email/password), database, RLS.
- **Lovable AI Gateway** — `google/gemini-3-flash-preview` for chat, tool-calling for structured Job creation.
- **Resend** — wired now via secret; first real use lands when we build the Job Posts tab. We'll add the API key and a tiny test server function.
- TanStack Start, shadcn/ui, Tailwind.

## v1 scope

1. Auth (email/password, single user).
2. Conversations sidebar (create, list, rename, delete, select).
3. Conversation workspace with tabs: **Chat** always present; **Job** appears when the AI creates one.
4. Streaming AI chat with a `create_job` tool. When the model calls it, we insert a job row tied to the conversation and the Job tab activates.
5. Job tab: editable form (title, description, requirements, location, employment type, salary range, status). Edits save to DB.

Out of scope for v1: pipeline, candidates, job posts publishing, team/multi-tenant, Resend sends.

## Data model (Lovable Cloud)

```text
profiles(id uuid pk → auth.users, created_at)
conversations(id, user_id, title, created_at, updated_at)
messages(id, conversation_id, role, content, tool_calls jsonb, created_at)
jobs(id, conversation_id unique, user_id, title, description,
     requirements text[], location, employment_type, salary_min,
     salary_max, currency, status, created_at, updated_at)
```

RLS on every table: `user_id = auth.uid()`. Grants for `authenticated` + `service_role`. Profile auto-created via trigger on signup.

## Server side (TanStack `createServerFn`, protected by `requireSupabaseAuth`)

- `listConversations`, `createConversation`, `renameConversation`, `deleteConversation`
- `getConversation` → messages + job (if any) + which tabs are active
- `getJob(conversationId)`, `updateJob(...)`
- **`/api/chat` server route** (streaming SSE): receives conversation history, calls Lovable AI Gateway with the `create_job` tool definition, streams deltas back. When a tool call resolves, the server inserts/updates the `jobs` row via `supabaseAdmin` scoped by `user_id` then emits a `tab:job` event so the client activates the Job tab.

System prompt frames the assistant as a recruiting agent that asks scoping questions, then calls `create_job` once it has enough info.

## Frontend

- `/login` — email/password.
- `/_authenticated` layout: sidebar (conversations) + outlet.
- `/_authenticated/c/$id` — workspace. Tabs component: Chat (always), Job (rendered when `job` exists on the conversation).
- Chat UI: react-markdown for assistant messages, token-by-token streaming via SSE, optimistic user message.
- Job tab: form bound to `jobs` row, autosave on blur via `updateJob`.
- New conversation → empty Chat tab, auto-titled from the first user message.

## Secrets

- `LOVABLE_API_KEY` — auto-provisioned.
- `RESEND_API_KEY` — request via secrets tool (used later, but wired now since you asked).

## Build order

1. Enable Lovable Cloud + auth scaffolding (email/password).
2. DB migration: profiles, conversations, messages, jobs + RLS + grants + signup trigger.
3. Server fns for conversations + messages + jobs.
4. `/api/chat` streaming route with `create_job` tool.
5. Sidebar + login + workspace shell with tabs.
6. Chat tab (streaming, markdown).
7. Job tab (form + autosave), wired to activate when AI creates the job.
8. Request `RESEND_API_KEY`.

## Notes / non-goals

- Conversations are private to the signed-in user (no sharing).
- Only one Job per conversation in v1 (unique constraint).
- Pipeline / Job Posts tabs are deliberately deferred — we'll repeat the same "AI tool → new tab" pattern for each.

Ready to switch to build mode when you approve.