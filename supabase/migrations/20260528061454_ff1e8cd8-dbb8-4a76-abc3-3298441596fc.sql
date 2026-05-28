
CREATE TABLE public.agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  message_id uuid,
  kind text NOT NULL,
  label text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'running',
  summary text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_tasks_conv ON public.agent_tasks(conversation_id, created_at);
CREATE INDEX idx_agent_tasks_msg ON public.agent_tasks(message_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_tasks TO authenticated;
GRANT ALL ON public.agent_tasks TO service_role;

ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own agent tasks" ON public.agent_tasks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own agent tasks" ON public.agent_tasks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own agent tasks" ON public.agent_tasks
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own agent tasks" ON public.agent_tasks
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
