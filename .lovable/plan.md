# Fix display name (and personalization) save error

## Diagnosis

The live `profiles` table has only: `id`, `plan`, `credits_remaining`, `sourcing_projects_used`, `created_at`.

The app's server functions (`updateDisplayName`, `updatePersonalization` in `src/lib/profile.functions.ts`) write to columns that don't exist in the database: `display_name`, `company_name`, `company_website`, `company_one_liner`, `company_description`, `hiring_context`, `user_role`, `sourcing_regions`.

A migration file (`supabase/migrations/20260604000000_profiles_columns_resync.sql`) was drafted earlier to add these, but it clearly never ran against this database — the columns are still missing. Old migration files cannot be re-run; we need a fresh, timestamped one.

## Fix — single new migration

Create `supabase/migrations/<new-timestamp>_profiles_add_missing_columns.sql` with:

1. `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS …` for each missing column:
   - `display_name text`
   - `company_name text`
   - `company_website text`
   - `company_one_liner text`
   - `company_description text`
   - `hiring_context text`
   - `user_role text`
   - `sourcing_regions text[] DEFAULT '{}'::text[]`
   - `notify_on_new_applicant boolean DEFAULT true`
   - `notify_daily_digest boolean DEFAULT false`
2. Column-scoped `GRANT UPDATE(<col>) ON public.profiles TO authenticated;` for each (the existing RLS `Users update own profile` policy already restricts row scope to `auth.uid() = id`).
3. `NOTIFY pgrst, 'reload schema';` to refresh the PostgREST schema cache so the update stops failing with "column … does not exist / schema cache".

No RLS, table-level grants, or app code changes needed — `profile.functions.ts` already handles all these columns; it just needs them to exist.

## Verification

After the migration runs: open Settings → Account → change display name → confirm no error and the value persists on reload. Then Settings → Personalization → save a field → confirm it persists.
