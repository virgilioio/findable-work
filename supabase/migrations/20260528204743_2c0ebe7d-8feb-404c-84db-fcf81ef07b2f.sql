CREATE TABLE public.job_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
  est_reach INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_posts TO authenticated;
GRANT ALL ON public.job_posts TO service_role;

ALTER TABLE public.job_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own job posts" ON public.job_posts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own job posts" ON public.job_posts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own job posts" ON public.job_posts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own job posts" ON public.job_posts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER job_posts_set_updated_at
  BEFORE UPDATE ON public.job_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();