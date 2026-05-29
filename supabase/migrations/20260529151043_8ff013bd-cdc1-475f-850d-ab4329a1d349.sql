
-- 1. Profiles: plan + credits + project usage
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS credits_remaining integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sourcing_projects_used integer NOT NULL DEFAULT 0;

-- Backfill existing profiles (defensive — they should already have defaults)
UPDATE public.profiles SET plan = COALESCE(plan, 'free'),
  credits_remaining = COALESCE(credits_remaining, 0),
  sourcing_projects_used = COALESCE(sourcing_projects_used, 0);

-- 2. Candidates: locked placeholder flag
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

-- 3. Credit ledger
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  stripe_session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own credit ledger"
  ON public.credit_ledger
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
  ON public.credit_ledger (user_id, created_at DESC);
