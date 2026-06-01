-- Interviews: structured per-conversation loop + bookable slots.
-- The chat agent owns writes via `build_interview_loop`; the Interviews tab
-- lets users edit stages and confirm scheduled slots to Google Calendar.

CREATE TABLE IF NOT EXISTS public.interview_loops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL UNIQUE,
  job_id uuid,
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  context text NOT NULL DEFAULT '',
  prep_tips text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interview_loops_user_idx ON public.interview_loops (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_loops TO authenticated;
GRANT ALL ON public.interview_loops TO service_role;

ALTER TABLE public.interview_loops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own interview loops"
  ON public.interview_loops FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own interview loops"
  ON public.interview_loops FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own interview loops"
  ON public.interview_loops FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own interview loops"
  ON public.interview_loops FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER set_interview_loops_updated_at
  BEFORE UPDATE ON public.interview_loops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE IF NOT EXISTS public.interview_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  loop_id uuid NOT NULL REFERENCES public.interview_loops(id) ON DELETE CASCADE,
  candidate_id uuid,
  candidate_name text NOT NULL DEFAULT '',
  candidate_email text,
  stage_id text NOT NULL DEFAULT '',
  stage_name text NOT NULL DEFAULT '',
  start_at timestamptz,
  end_at timestamptz,
  is_async boolean NOT NULL DEFAULT false,
  google_event_id text,
  meet_link text,
  status text NOT NULL DEFAULT 'pending',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interview_schedules_user_idx ON public.interview_schedules (user_id);
CREATE INDEX IF NOT EXISTS interview_schedules_conv_idx ON public.interview_schedules (conversation_id);
CREATE INDEX IF NOT EXISTS interview_schedules_loop_idx ON public.interview_schedules (loop_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_schedules TO authenticated;
GRANT ALL ON public.interview_schedules TO service_role;

ALTER TABLE public.interview_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own interview schedules"
  ON public.interview_schedules FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own interview schedules"
  ON public.interview_schedules FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own interview schedules"
  ON public.interview_schedules FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own interview schedules"
  ON public.interview_schedules FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER set_interview_schedules_updated_at
  BEFORE UPDATE ON public.interview_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
