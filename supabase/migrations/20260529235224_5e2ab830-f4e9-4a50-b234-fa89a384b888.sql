CREATE TABLE public.user_calendar_connections (
  user_id uuid NOT NULL PRIMARY KEY,
  connection_id text NOT NULL,
  email text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_calendar_connections TO authenticated;
GRANT ALL ON public.user_calendar_connections TO service_role;

ALTER TABLE public.user_calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own calendar connection"
  ON public.user_calendar_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own calendar connection"
  ON public.user_calendar_connections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own calendar connection"
  ON public.user_calendar_connections FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own calendar connection"
  ON public.user_calendar_connections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER set_user_calendar_connections_updated_at
  BEFORE UPDATE ON public.user_calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();