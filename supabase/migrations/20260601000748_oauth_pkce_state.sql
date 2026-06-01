-- Re-apply direct Google OAuth schema (previous migration didn't run).
-- Idempotent: safe to run multiple times.

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
-- No policies: only service_role (server) reads/writes this table.
