-- Personalization fields used by the AI to draft outreach / job posts.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS company_website text,
  ADD COLUMN IF NOT EXISTS company_one_liner text,
  ADD COLUMN IF NOT EXISTS company_description text,
  ADD COLUMN IF NOT EXISTS hiring_context text,
  ADD COLUMN IF NOT EXISTS user_role text,
  ADD COLUMN IF NOT EXISTS sourcing_regions text[] NOT NULL DEFAULT '{}'::text[];

GRANT UPDATE(company_name) ON public.profiles TO authenticated;
GRANT UPDATE(company_website) ON public.profiles TO authenticated;
GRANT UPDATE(company_one_liner) ON public.profiles TO authenticated;
GRANT UPDATE(company_description) ON public.profiles TO authenticated;
GRANT UPDATE(hiring_context) ON public.profiles TO authenticated;
GRANT UPDATE(user_role) ON public.profiles TO authenticated;
GRANT UPDATE(sourcing_regions) ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
