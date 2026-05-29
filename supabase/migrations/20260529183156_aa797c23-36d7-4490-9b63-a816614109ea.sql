
-- 1. Extend jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS company text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS responsibilities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS must_have text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nice_to_have text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS screening jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS jobs_slug_idx ON public.jobs (slug) WHERE slug IS NOT NULL;

-- 2. Applications
CREATE TABLE IF NOT EXISTS public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  job_id uuid NOT NULL,
  recruiter_user_id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  linkedin text,
  location text,
  resume_filename text,
  resume_url text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  screening jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'applied',
  candidate_id uuid
);

CREATE INDEX IF NOT EXISTS applications_job_idx ON public.applications (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS applications_recruiter_idx ON public.applications (recruiter_user_id, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recruiters view own applications"
  ON public.applications FOR SELECT TO authenticated
  USING (auth.uid() = recruiter_user_id);

CREATE POLICY "Recruiters update own applications"
  ON public.applications FOR UPDATE TO authenticated
  USING (auth.uid() = recruiter_user_id);

CREATE POLICY "Recruiters delete own applications"
  ON public.applications FOR DELETE TO authenticated
  USING (auth.uid() = recruiter_user_id);

-- 3. candidates.application_id
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS application_id uuid;

CREATE INDEX IF NOT EXISTS candidates_application_idx ON public.candidates (application_id) WHERE application_id IS NOT NULL;

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.applications;
ALTER TABLE public.applications REPLICA IDENTITY FULL;

-- 5. Seed screening prompt
INSERT INTO public.prompts (slug, title, description, body, is_active, version)
VALUES (
  'jobs.screening',
  'Job screening questions',
  'Generates 4–6 role-specific screening questions from a job description.',
  'You generate concise screening questions for a recruiter to put on a public job application page.

Given a job (title, summary, must-haves, nice-to-haves), return 4–6 questions that:
- Quickly disqualify mismatches (years of experience, location/work-auth, language, must-have skills).
- Surface real signal beyond the resume (one open-ended question).
- Mix types: at least one "select", one "multi", one "textarea".
- Use plain language. Avoid yes/no. Keep options short (2–6 words).
- Set required=true for hard requirements only.

Return via the tool call. Use stable lowercase id slugs (e.g. "exp", "tools", "lang_en").',
  true,
  1
)
ON CONFLICT (slug) DO NOTHING;
