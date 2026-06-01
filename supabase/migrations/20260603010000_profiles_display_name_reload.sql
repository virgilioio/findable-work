-- Force PostgREST to pick up the display_name column on instances where the
-- previous migration didn't reload the schema cache.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
GRANT UPDATE(display_name) ON public.profiles TO authenticated;
NOTIFY pgrst, 'reload schema';
