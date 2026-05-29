
CREATE TABLE public.user_gmail_connections (
  user_id UUID NOT NULL PRIMARY KEY,
  connection_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_gmail_connections TO authenticated;
GRANT ALL ON public.user_gmail_connections TO service_role;

ALTER TABLE public.user_gmail_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own gmail connection" ON public.user_gmail_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own gmail connection" ON public.user_gmail_connections
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own gmail connection" ON public.user_gmail_connections
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own gmail connection" ON public.user_gmail_connections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER set_user_gmail_connections_updated_at
  BEFORE UPDATE ON public.user_gmail_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.outreach_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  gmail_thread_id TEXT,
  subject TEXT NOT NULL DEFAULT '',
  last_snippet TEXT NOT NULL DEFAULT '',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent',
  unread BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, gmail_thread_id)
);

CREATE INDEX idx_outreach_threads_user_conv ON public.outreach_threads(user_id, conversation_id, last_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_threads TO authenticated;
GRANT ALL ON public.outreach_threads TO service_role;

ALTER TABLE public.outreach_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own outreach threads" ON public.outreach_threads
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own outreach threads" ON public.outreach_threads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own outreach threads" ON public.outreach_threads
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own outreach threads" ON public.outreach_threads
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER set_outreach_threads_updated_at
  BEFORE UPDATE ON public.outreach_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.outreach_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.outreach_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  gmail_message_id TEXT,
  direction TEXT NOT NULL,
  from_addr TEXT NOT NULL DEFAULT '',
  to_addr TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, gmail_message_id)
);

CREATE INDEX idx_outreach_messages_thread ON public.outreach_messages(thread_id, sent_at ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_messages TO authenticated;
GRANT ALL ON public.outreach_messages TO service_role;

ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own outreach messages" ON public.outreach_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own outreach messages" ON public.outreach_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own outreach messages" ON public.outreach_messages
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own outreach messages" ON public.outreach_messages
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
