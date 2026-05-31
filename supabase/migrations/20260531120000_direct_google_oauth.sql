-- Direct Google OAuth: store tokens instead of broker connection IDs
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

-- Ensure unique user constraint for upserts
CREATE UNIQUE INDEX IF NOT EXISTS user_gmail_connections_user_id_key
  ON public.user_gmail_connections(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_calendar_connections_user_id_key
  ON public.user_calendar_connections(user_id);

-- PKCE state storage (short-lived, server-only)
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
-- No policies: only service role (server) ever reads/writes this table.
