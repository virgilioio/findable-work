-- Add columns the app reads/writes on public.profiles and grant column-level
-- UPDATE to authenticated. RLS policy "Users update own profile" already
-- scopes writes to auth.uid() = id. Idempotent.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_website text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_one_liner text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_description text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hiring_context text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_role text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sourcing_regions text[] DEFAULT '{}'::text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_on_new_applicant boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_daily_digest boolean DEFAULT false;

GRANT UPDATE(display_name) ON public.profiles TO authenticated;
GRANT UPDATE(company_name) ON public.profiles TO authenticated;
GRANT UPDATE(company_website) ON public.profiles TO authenticated;
GRANT UPDATE(company_one_liner) ON public.profiles TO authenticated;
GRANT UPDATE(company_description) ON public.profiles TO authenticated;
GRANT UPDATE(hiring_context) ON public.profiles TO authenticated;
GRANT UPDATE(user_role) ON public.profiles TO authenticated;
GRANT UPDATE(sourcing_regions) ON public.profiles TO authenticated;
GRANT UPDATE(notify_on_new_applicant) ON public.profiles TO authenticated;
GRANT UPDATE(notify_daily_digest) ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
