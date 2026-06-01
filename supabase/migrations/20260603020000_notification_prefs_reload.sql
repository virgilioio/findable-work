-- Ensure notification preference columns exist and PostgREST cache is reloaded.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_on_new_applicant boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_daily_digest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_digest_sent_at timestamptz;

GRANT UPDATE(notify_on_new_applicant) ON public.profiles TO authenticated;
GRANT UPDATE(notify_daily_digest) ON public.profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
