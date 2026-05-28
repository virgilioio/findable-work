-- Outreach drafts table
CREATE TABLE public.outreach_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL UNIQUE,
  channel text NOT NULL DEFAULT 'linkedin',
  linkedin_template text NOT NULL DEFAULT '',
  email_subject text NOT NULL DEFAULT '',
  email_body text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT 'Warm',
  personalize_ai boolean NOT NULL DEFAULT true,
  local_time_send boolean NOT NULL DEFAULT true,
  pause_if_reply boolean NOT NULL DEFAULT true,
  skip_if_recent boolean NOT NULL DEFAULT true,
  followups jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_drafts TO authenticated;
GRANT ALL ON public.outreach_drafts TO service_role;

ALTER TABLE public.outreach_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own outreach" ON public.outreach_drafts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own outreach" ON public.outreach_drafts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own outreach" ON public.outreach_drafts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own outreach" ON public.outreach_drafts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER outreach_drafts_updated_at
  BEFORE UPDATE ON public.outreach_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Extend candidates with contact metadata
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_channel text;
