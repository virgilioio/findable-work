
-- 1. sourcing_projects
CREATE TABLE public.sourcing_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid,
  title text NOT NULL DEFAULT '',
  raw_prompt text NOT NULL DEFAULT '',
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  research jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_searched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sourcing_projects TO authenticated;
GRANT ALL ON public.sourcing_projects TO service_role;

ALTER TABLE public.sourcing_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sourcing projects" ON public.sourcing_projects FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own sourcing projects" ON public.sourcing_projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sourcing projects" ON public.sourcing_projects FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own sourcing projects" ON public.sourcing_projects FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER sourcing_projects_set_updated_at BEFORE UPDATE ON public.sourcing_projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_sourcing_projects_user ON public.sourcing_projects(user_id);
CREATE INDEX idx_sourcing_projects_conversation ON public.sourcing_projects(conversation_id);

-- 2. sourcing_preview_candidates
CREATE TABLE public.sourcing_preview_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.sourcing_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  source text NOT NULL,
  external_id text NOT NULL,
  linkedin_slug text,
  preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  keyword_score integer NOT NULL DEFAULT 0,
  display_source text NOT NULL DEFAULT 'apollo',
  collected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, source, external_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sourcing_preview_candidates TO authenticated;
GRANT ALL ON public.sourcing_preview_candidates TO service_role;

ALTER TABLE public.sourcing_preview_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own preview candidates" ON public.sourcing_preview_candidates FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own preview candidates" ON public.sourcing_preview_candidates FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own preview candidates" ON public.sourcing_preview_candidates FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own preview candidates" ON public.sourcing_preview_candidates FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_preview_candidates_project ON public.sourcing_preview_candidates(project_id);
CREATE INDEX idx_preview_candidates_linkedin ON public.sourcing_preview_candidates(linkedin_slug);

-- 3. sourcing_credits_usage
CREATE TABLE public.sourcing_credits_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period text NOT NULL,
  collect_credits_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sourcing_credits_usage TO authenticated;
GRANT ALL ON public.sourcing_credits_usage TO service_role;

ALTER TABLE public.sourcing_credits_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own credits usage" ON public.sourcing_credits_usage FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own credits usage" ON public.sourcing_credits_usage FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own credits usage" ON public.sourcing_credits_usage FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER credits_usage_set_updated_at BEFORE UPDATE ON public.sourcing_credits_usage FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. additive columns on candidates
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS apollo_id text,
  ADD COLUMN IF NOT EXISTS pdl_id text,
  ADD COLUMN IF NOT EXISTS linkedin_slug text;

CREATE INDEX IF NOT EXISTS idx_candidates_apollo_id ON public.candidates(apollo_id);
CREATE INDEX IF NOT EXISTS idx_candidates_pdl_id ON public.candidates(pdl_id);
CREATE INDEX IF NOT EXISTS idx_candidates_linkedin_slug ON public.candidates(linkedin_slug);

-- 5. RPC
CREATE OR REPLACE FUNCTION public.increment_sourcing_usage(_user_id uuid, _count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _period text := to_char(now(), 'YYYY-MM');
BEGIN
  INSERT INTO public.sourcing_credits_usage (user_id, period, collect_credits_used)
  VALUES (_user_id, _period, _count)
  ON CONFLICT (user_id, period)
  DO UPDATE SET collect_credits_used = public.sourcing_credits_usage.collect_credits_used + _count,
                updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_sourcing_usage(uuid, integer) TO authenticated, service_role;
