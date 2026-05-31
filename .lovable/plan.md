# Migration Plan: Lovable Cloud Supabase → Your Own Supabase Project

## Source & Target (verified)

- **Source** (Lovable Cloud, ref `srznzxyhaomvzwqgaego`) — reachable via `SUPABASE_DB_URL` as restricted `sandbox_exec` role + `SUPABASE_SERVICE_ROLE_KEY` for admin operations.
- **Target** (your project, ref `oqkgofqwgurvhzluuvsm`) — reachable via `MY_SUPABASE_DB_URL` as `postgres` (full privileges) + `MY_SUPABASE_SERVICE_ROLE_KEY`.

Because the sandbox's source DB role cannot read `auth.*` or `storage.*` schemas, we cannot use `pg_dump` of the whole source. Instead we migrate each layer using the right API.

## Phase 1 — Schema (tables, RLS, functions, triggers, indexes)

Apply the project's existing migration history (`supabase/migrations/*.sql`) to the target DB in order, via `psql` against `MY_SUPABASE_DB_URL`. This recreates:
- 22 public tables with columns, defaults, constraints
- RLS policies (already in the migrations)
- Functions: `handle_new_user`, `set_updated_at`, `increment_sourcing_usage`, `has_role`
- The `app_role` enum and `user_roles` setup
- The `handle_new_user` trigger on `auth.users` (needs to be (re)created on target)
- Storage buckets (`resumes`) and storage policies

Verify schema parity at the end with a table/column diff between source and target.

## Phase 2 — Auth users

Use the Supabase Admin API (Node script in `/tmp`, never committed):
1. Paginate `auth.admin.listUsers()` on source using `SUPABASE_SERVICE_ROLE_KEY`.
2. For each user, call `auth.admin.createUser()` on target using `MY_SUPABASE_SERVICE_ROLE_KEY`, preserving `id`, `email`, `phone`, `email_confirmed_at`, `phone_confirmed_at`, `user_metadata`, `app_metadata`, `created_at`.
3. Password hashes: migrate via `password_hash` field on `createUser` (Supabase accepts bcrypt hashes exported from source). If a hash can't be exported, users keep their account but must use "Forgot password" to set a new one — we'll confirm which behavior you want before running.
4. Identities (Google OAuth links from `auth.identities`) get re-linked after first sign-in automatically.

Run order matters: **auth users must exist before data import** because `public.profiles.id` and every `user_id` column references them.

## Phase 3 — Public data (existing rows)

For each public table (in FK-safe order), stream rows from source → target using `psql` `COPY ... TO STDOUT` piped to `COPY ... FROM STDIN` on the target. Order: `profiles, user_roles, conversations, messages, jobs, candidates, applications, agent_tasks, job_posts, outreach_drafts, outreach_threads, outreach_messages, sourcing_projects, sourcing_preview_candidates, sourcing_credits_usage, credit_ledger, user_gmail_connections, user_calendar_connections, prompts, prompt_partials, prompt_revisions`.

Triggers like `handle_new_user` will be temporarily disabled during import to avoid duplicate-profile conflicts, then re-enabled.

## Phase 4 — Storage buckets + files

1. Recreate buckets on target via SQL (`resumes`, private) — done in Phase 1.
2. List all objects in source `resumes` bucket via `storage.from('resumes').list()` recursively (service role).
3. Download each file → upload to target with the same path, content-type, and metadata.
4. Verify object counts match.

## Phase 5 — Cutover

Hard cutover per your earlier choice:
1. Update the Lovable project's connected Supabase project to point at `oqkgofqwgurvhzluuvsm`. **This is a manual step you do in Lovable's Cloud / Connectors UI** — the agent cannot reassign the connected project for you. After it's reassigned, `src/integrations/supabase/client.ts`, `.env` (`VITE_SUPABASE_*`), and `types.ts` regenerate automatically against the new project.
2. Re-enable Google OAuth provider on the new project (`supabase--configure_social_auth`) — provider config does not migrate.
3. Re-add any auth redirect URLs / Site URL on the new project to match `findable.work`, `www.findable.work`, `findable-work.lovable.app`, and preview URLs.
4. Re-create the `handle_new_user` trigger on `auth.users` in the new project (included in Phase 1).
5. Smoke-test: sign in (Google + email), load `/app`, open a conversation, view candidates, upload a resume.

## Things that do NOT auto-migrate (you'll need to redo on the new project)

- **Auth provider config** (Google OAuth client/secret, redirect URLs, email templates, SMTP settings)
- **Edge Function secrets / project secrets** — the `MY_*`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `APOLLO_API_KEY`, `PDL_API_KEY`, `AUTH_EMAIL_HOOK_SECRET`, `GOOGLE_APP_USER_CONNECTOR_CLIENT_ID` need to be set on the new project too if any server functions still rely on them at the Supabase layer (this project uses TanStack server functions, so most secrets stay in Lovable, but confirm).
- **Webhooks, cron jobs (pg_cron), auth hooks** — none detected, but we'll double-check.
- **Custom domain on Supabase Auth** (if any) — re-point.

## Confirmations needed before I start (in build mode)

1. **Passwords**: migrate bcrypt hashes when possible (silent transition), OR force all users to reset password? Default: **migrate hashes**.
2. **Email confirmation status**: preserve `email_confirmed_at` from source so users stay confirmed? Default: **yes**.
3. **Downtime window**: can the app be in read-only / "we're migrating" mode for ~15 min during Phases 2–4 to avoid drift? If not, we accept that rows created during migration on the source will be lost.
4. **Project reassignment**: after I finish Phases 1–4 and verify, you'll do the one-click Cloud project reassignment in Lovable, then I'll do the Google OAuth re-enable and smoke tests.

Reply with any changes to defaults, otherwise I'll proceed with the defaults above once you switch me to build mode.
