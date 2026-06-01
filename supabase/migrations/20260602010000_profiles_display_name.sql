alter table public.profiles add column display_name text;

-- Allow users to update their own display_name
GRANT UPDATE(display_name) ON public.profiles TO authenticated;

-- Let PostgREST pick up the new column
NOTIFY pgrst, 'reload schema';
