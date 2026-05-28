## Goal
Move all LLM system prompts out of scattered server files into a single, admin-editable registry stored in the database. Prompts are composable from reusable partials, versioned, and only visible/editable to admin users — never reachable by regular users or the browser bundle.

## Architecture

```text
┌──────────────────────────┐        ┌────────────────────────────┐
│ /admin/prompts (UI)      │        │ server fns (chat, agent,   │
│ — admin-only             │        │ normalize, research, …)    │
└────────────┬─────────────┘        └──────────────┬─────────────┘
             │ admin server fns                   │ getPrompt("chat.main")
             ▼                                    ▼
   ┌──────────────────────────────────────────────────────────┐
   │ src/lib/prompts/registry.server.ts                       │
   │  • resolve(slug)  → composes partials → final string     │
   │  • short in-memory cache (per worker)                    │
   └────────────────────────┬─────────────────────────────────┘
                            ▼
                ┌────────────────────────┐
                │ prompts (DB)           │
                │ prompt_partials (DB)   │
                │ user_roles (DB)        │
                └────────────────────────┘
```

## Database (one migration)

1. **`app_role` enum** (`admin`, `user`) + **`user_roles`** table + `has_role(uuid, app_role)` SECURITY DEFINER fn — standard pattern from the user-roles guide. Roles are NEVER on `profiles`.
2. **`prompts`**: `slug` (unique, e.g. `chat.main`, `guest.main`, `sourcing.normalize`, `sourcing.research`, `sourcing.agent_normalize`, `sourcing.refine`), `title`, `body` (text — supports `{{partial:slug}}` and `{{var:name}}` placeholders), `description`, `is_active`, `version` (int, bumped on each save), timestamps.
3. **`prompt_partials`**: `slug` (unique, e.g. `brand.voice`, `output.format`, `tool.guardrails`, `base.knowledge`), `title`, `body`, `description`, timestamps.
4. **`prompt_revisions`**: append-only history of `prompts` saves (`prompt_id`, `version`, `body`, `edited_by`, `created_at`) so we can roll back.
5. **RLS**: all three tables — SELECT/INSERT/UPDATE/DELETE permitted only when `public.has_role(auth.uid(), 'admin')`. The publishable-key client never gets to read them. Server-side reads happen via `supabaseAdmin`.
6. **GRANTs**: `user_roles` → SELECT to authenticated (read by `has_role`); prompts tables → all to `service_role` only (no anon, no authenticated grants needed since the admin UI calls server fns that use `supabaseAdmin`).

## Server: the registry

`src/lib/prompts/registry.server.ts` — server-only (filename guarded):
- `getPrompt(slug, vars?)` → fetches active prompt row via `supabaseAdmin`, recursively expands `{{partial:slug}}` (with cycle detection + depth cap of 5) and `{{var:name}}` substitutions, returns the final string.
- Small in-memory LRU keyed by `(slug, version)` with a 60s TTL; bumped versions invalidate naturally. Cache is per-worker — acceptable.
- Throws if the slug is missing or inactive (loud failure beats silent prompt drift).

`src/lib/prompts/prompts.functions.ts` — `createServerFn` endpoints, all wrapped in an `requireAdmin` middleware (built on top of `requireSupabaseAuth` + `has_role` check):
- `listPrompts`, `getPromptDraft(slug)`, `savePrompt({ slug, body, title?, description?, is_active? })` (creates a new revision + bumps version),
- `listPartials`, `savePartial(...)`,
- `previewPrompt({ slug, vars })` so admins can render the composed result without saving.

## Migrate existing prompts

Seed the registry in the same migration with the current strings extracted verbatim from:
- `src/routes/api/chat.ts:SYSTEM_PROMPT` → slug `chat.main`
- `src/routes/api/public/guest-chat.ts:SYSTEM_PROMPT` → `guest.main`
- `src/lib/sourcing/normalize.functions.ts:SYSTEM` → `sourcing.normalize`
- `src/lib/sourcing/agent.server.ts:NORMALIZE_SYSTEM` + research system → `sourcing.agent_normalize`, `sourcing.agent_research`
- `src/lib/sourcing/research.functions.ts` inline → `sourcing.research`
- `src/lib/sourcing/project.functions.ts:REFINE_SYSTEM` → `sourcing.refine`

Initial shared partials (extracted from repeated patterns):
- `brand.voice` — "you are findable…" identity block
- `output.format` — JSON/tool-output rules
- `tool.guardrails` — when to call which tool
- `base.knowledge` — recruiting domain knowledge

Then update each call site to `const system = await getPrompt("chat.main")` instead of the inline constant. The constants are removed.

## Admin UI

New route `src/routes/_authenticated/admin/prompts.tsx` (and `.partials.tsx`, `.$slug.tsx` for editor). Gated two ways:
1. `beforeLoad` checks `has_role` via a server fn and `throw redirect({ to: "/app" })` if not admin (no UI peek).
2. Every mutation server fn re-checks `has_role` server-side (defense in depth).

UI features (minimal, functional):
- Table of prompts + partials with slug, title, version, last edited, active toggle.
- Monaco-free textarea editor with a "Preview" pane that calls `previewPrompt` and shows the fully composed string, with sample vars.
- Save → bumps version, writes revision row.
- Revisions list per prompt with restore-to-version action.

No public navigation links to `/admin/*`.

## Security boundaries (what the user cares about)

- Prompt bodies live in DB rows readable only by `service_role` (no anon, no authenticated grants). Browser bundle never sees them.
- All reads/writes go through server fns. `getPrompt` is server-only and called from existing server fns/routes — same trust boundary as today, just centralized.
- Admin UI gated by `_authenticated` layout + `has_role('admin')` check in both `beforeLoad` and every server fn.
- `user_roles` table prevents privilege escalation (separate from `profiles`).
- Promotion to admin: done manually in DB by you (or via a one-off SQL); no self-serve "make me admin" path.

## Out of scope (call out, don't build)
- A/B testing different prompt versions per user.
- Per-user/per-tenant prompt overrides.
- Markdown rendering / rich editor (plain textarea is enough to start).
- Auto-syncing prompt edits to running streams already in flight.

## Implementation order
1. Migration (roles + prompts + partials + revisions + RLS + seed data).
2. After you make yourself admin, build `registry.server.ts` + `getPrompt`.
3. Replace inline constants in the 6 call sites with `getPrompt(slug)`.
4. Build `requireAdmin` middleware + prompt CRUD server fns.
5. Build `/admin/prompts` UI.
6. Verify end-to-end: edit a prompt → save → next chat call uses the new text.