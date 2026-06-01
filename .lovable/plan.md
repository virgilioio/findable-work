## Why nothing applied

Your `src/integrations/supabase/client.ts` points at your own Supabase project (`oqkgofqwgurvhzluuvsm.supabase.co`), not Lovable Cloud. The migration files in `supabase/migrations/` are only auto-run against Lovable Cloud's managed database. For your external Supabase, you need to apply the SQL yourself — that's why `oauth_pkce_state` is missing.

## What to do

Run this SQL in your Supabase project (Dashboard → SQL Editor, or `supabase db push` if you have the CLI linked to project `oqkgofqwgurvhzluuvsm`):

```sql
ALTER TABLE public.user_gmail_connections
  ALTER COLUMN connection_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS scope text;

ALTER TABLE public.user_calendar_connections
  ALTER COLUMN connection_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS scope text;

CREATE UNIQUE INDEX IF NOT EXISTS user_gmail_connections_user_id_key
  ON public.user_gmail_connections(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_calendar_connections_user_id_key
  ON public.user_calendar_connections(user_id);

CREATE TABLE IF NOT EXISTS public.oauth_pkce_state (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  code_verifier text NOT NULL,
  kind text NOT NULL,
  return_to text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.oauth_pkce_state TO service_role;
ALTER TABLE public.oauth_pkce_state ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role reads/writes this table (server bypasses RLS).
```

Then refresh the schema cache (Dashboard → Settings → API → "Reload schema cache", or it auto-reloads within ~60s) and retry **Connect**.

## Also confirm

Your server-side env must point at the same Supabase project. The TanStack server uses `process.env.MY_SUPABASE_URL` / `MY_SUPABASE_SERVICE_ROLE_KEY` (your secrets list has both). Make sure those match `oqkgofqwgurvhzluuvsm`, otherwise the admin client is writing PKCE state to a different DB than the one the app reads from.

## Optional cleanup

If you'd like, I can delete the stale `supabase/migrations/20260531120000_direct_google_oauth.sql` and the one I just added — they won't run against your external project anyway and only clutter the repo. Let me know.
