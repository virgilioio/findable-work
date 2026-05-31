
# Migrate Findable to your own Supabase project

Goal: move the entire backend (schema, data, storage, auth users, config) from the Lovable-managed Supabase project (`srznzxyhaomvzwqgaego`) to a Supabase project in your own account. Lovable will continue to build the app against the new project via standard credentials.

---

## What you'll need to provide

Once we're in build mode, I'll ask you for these as Lovable secrets:

1. **`MY_SUPABASE_URL`** — e.g. `https://abcdefg.supabase.co`
2. **`MY_SUPABASE_ANON_KEY`** — the publishable / anon key
3. **`MY_SUPABASE_SERVICE_ROLE_KEY`** — service role key (used only for the migration script and server functions)
4. **`MY_SUPABASE_DB_URL`** — the Postgres connection string from your project's Database settings (used for `pg_dump` / `pg_restore`)

I'll never write the service role key or DB URL into the repo. They go into Lovable's secret store and are read as `process.env.*` at runtime.

---

## Steps

### 1. Pre-flight (read-only, on the current Cloud project)
- Snapshot a manifest of everything that needs to move: 22 tables, 4 functions (`set_updated_at`, `handle_new_user`, `increment_sourcing_usage`, `has_role`), the `app_role` enum, all RLS policies, the `resumes` storage bucket, and the `auth.users` table.
- Count rows per table so we can verify row-counts match post-migration.

### 2. Schema migration
- Run `pg_dump --schema-only --schema=public --schema=auth` against the source DB to capture exact DDL, then apply it to your new project. This preserves:
  - Tables, columns, defaults, constraints
  - The `app_role` enum
  - All 4 `public` functions (including `SECURITY DEFINER` and `search_path` settings)
  - All RLS policies and `GRANT`s
  - The `on_auth_user_created` trigger that calls `handle_new_user` (needs to be recreated on `auth.users` in the new project)

### 3. Data migration
- `pg_dump --data-only --schema=public` from source, `psql` into target. Order respects FK-free design (no FKs in this schema, so order is only about logical dependencies — conversations/jobs/etc. before children).
- Disable triggers during load to avoid double-firing `handle_new_user`.

### 4. Auth users migration
- Dump `auth.users`, `auth.identities`, `auth.mfa_factors` from source via `pg_dump --schema=auth`.
- Restore into the new project. Passwords are preserved because `encrypted_password` is a bcrypt hash — Supabase will accept existing sessions/passwords without forcing resets.
- Existing user UUIDs are preserved, so all `user_id` foreign references in public tables stay valid.

### 5. Storage migration (`resumes` bucket)
- Create the `resumes` bucket in the new project with the same privacy (private).
- Recreate the bucket's RLS storage policies.
- Use a Node script with both service-role keys: list every object in the source bucket, stream-download, re-upload to target preserving paths.

### 6. Auth configuration
- Recreate in your new Supabase dashboard (these don't migrate via SQL):
  - **Google OAuth provider** — add your Google client ID/secret, set the redirect URL to `https://<your-ref>.supabase.co/auth/v1/callback`, and update Google Cloud Console authorized redirect URIs.
  - **Email auth settings** — site URL, redirect URLs (`https://findable.work`, `https://www.findable.work`, `https://findable-work.lovable.app`, preview URL), email templates if customized.
  - **Auth email hook** (if used) — re-point at the same endpoint and set `AUTH_EMAIL_HOOK_SECRET`.

### 7. Repoint the app
- Add the 4 secrets above to Lovable's secret store.
- Update `src/integrations/supabase/client.ts`, `client.server.ts`, and `auth-middleware.ts` to read from `MY_SUPABASE_*` (or override the existing `VITE_SUPABASE_URL` / `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` env vars at the Lovable secret layer so no code changes are needed — preferred).
- Regenerate `src/integrations/supabase/types.ts` against the new project.
- Re-create non-Supabase secrets in your new project's Edge Function secrets only if you migrate edge functions too — this app uses TanStack server functions, so `OPENAI_API_KEY`, `APOLLO_API_KEY`, `PDL_API_KEY`, `RESEND_API_KEY`, `LOVABLE_API_KEY` stay as Lovable runtime secrets and don't need to move.

### 8. Verify, then cut over
- Smoke test on preview: sign in (existing user), open a conversation, view candidates, check `resumes` downloads.
- Compare row counts source vs. target for every table.
- Once green: publish.
- Disable Lovable Cloud on this project (Connectors → Lovable Cloud → Disable) so the old DB is no longer used.

### 9. Post-cutover
- Old Lovable Cloud database stays read-only on Lovable's side for a grace period; export a final `pg_dump` to keep as a local backup.
- You now manage Supabase billing, backups, point-in-time recovery, and dashboard access directly.

---

## Technical details

```text
Source (Lovable Cloud)               Target (your Supabase)
─────────────────────────            ─────────────────────────
ref: srznzxyhaomvzwqgaego     ───►   ref: <yours>
public schema (22 tables)     ───►   pg_dump --schema=public
auth.users + identities       ───►   pg_dump --schema=auth (selected tables)
storage.objects (resumes/)    ───►   node migrate-storage.mjs
on_auth_user_created trigger  ───►   recreated manually on target
Google OAuth provider config  ───►   reconfigured in Supabase dashboard
Lovable secret store (keys)   ───►   stays in Lovable (no move needed)
```

Risks & mitigations:
- **Auth users with active sessions**: existing JWTs signed by the old project will be invalidated on cutover (different JWT secret). Users will need to sign in again once — passwords still work.
- **Realtime subscriptions**: any `ALTER PUBLICATION supabase_realtime` we've set up needs to be re-applied on the target (none currently in use based on the schema, but we'll re-check).
- **Lovable Cloud-specific files** (`client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `types.ts`) are normally auto-managed. After cutover they become repo-owned — Lovable will stop auto-regenerating them. I'll regenerate `types.ts` manually when the schema changes.
- **Downtime estimate**: ~5–15 minutes for the cutover window (dump → restore → flip env vars → redeploy).

Approve this plan and I'll switch to build mode and ask you for the 4 secrets to start.
