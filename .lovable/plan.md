## Problem

The toast `Could not find the table 'public.oauth_pkce_state' in the schema cache` means the migration that adds the direct-Google-OAuth schema (`oauth_pkce_state` table + token columns on `user_gmail_connections` / `user_calendar_connections`) never actually ran against the database. The current live schema still shows `connection_id NOT NULL` with no `access_token` / `refresh_token` columns, and no `oauth_pkce_state` table — confirming the previous migration file (`20260531120000_direct_google_oauth.sql`) was added to the repo but not executed.

## Fix

Create a new timestamped migration that re-applies the same DDL idempotently. All statements use `IF NOT EXISTS` / `DROP NOT NULL`, so it is safe even on databases where the prior migration partially ran.

The new migration will:

1. On `public.user_gmail_connections` and `public.user_calendar_connections`:
   - Drop `NOT NULL` from `connection_id` (no-op if already dropped)
   - Add `access_token`, `refresh_token`, `token_expires_at`, `scope` columns if missing
   - Create a unique index on `user_id` to support upserts

2. Create `public.oauth_pkce_state`:
   - `state text PRIMARY KEY`, `user_id uuid`, `code_verifier text`, `kind text`, `return_to text`, `created_at timestamptz`
   - Grant ALL to `service_role` only (server-only table, no anon/authenticated grants)
   - Enable RLS with no policies (admin client bypasses RLS; users never touch this table directly)

No code changes are needed — `gmail.functions.ts`, `calendar.functions.ts`, and `google-oauth.server.ts` already target this schema.

## After applying

Retry the "Connect" button in Settings → Connections → Gmail. You should now be redirected to Google's consent screen.
