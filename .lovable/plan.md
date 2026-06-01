## Goal

Tighten the Settings dialog for MVP: remove fluff, make every visible control actually work, and fix the `display_name` write error in Account.

## Changes by section

### General (`GeneralPane`)
- Remove the **Show sidebar** row entirely (and its `usePersistedState`).
- Make **Language** real:
  - Add a tiny i18n shim at `src/lib/i18n.tsx`: React context with `lang`, `setLang`, `t(key, fallback)`, persisted to `localStorage("findable:language")`, defaulting to `en`. Wrap the app in `__root.tsx` and set `document.documentElement.lang`.
  - Offer `en`, `es`, `pt`, `fr`, `de`. Scope translations to Settings dialog labels/descriptions for now so users see immediate effect; everywhere else falls back to English via `t(key, "English string")`. Extensible later.

### Notifications (`NotificationsPane`) — keep in rail, fix the toggles
- Remove the **Replies**, **Interview reminders**, and **Mentions** rows (and the related local `Notifications` state). The pane only renders server-backed rows.
- The two remaining rows (**New applicants**, **Daily digest**) already call `updateNotificationPrefs` — verify the optimistic update path and ensure the switches reflect the latest server state immediately (currently they read `prefs?.notifyOnNewApplicant ?? true` which is correct; just remove the unused local state and tighten loading/disabled handling).
- Quiet runtime fix: `getNotificationPrefs` is throwing because `profiles.notify_on_new_applicant` / `notify_daily_digest` columns are missing on the live instance. The migration `20260601200000_notification_prefs.sql` either didn't apply or PostgREST's schema cache is stale. Add `supabase/migrations/20260603020000_notification_prefs_reload.sql` that re-runs `ADD COLUMN IF NOT EXISTS` for both columns, re-issues the relevant `GRANT UPDATE(...)`s, and `NOTIFY pgrst, 'reload schema';`. Also make `getNotificationPrefs` defensive (try full select; on column-missing error, return defaults `{ notifyOnNewApplicant: true, notifyDailyDigest: false }`) so the pane never crashes.

### Personalization (`PersonalizationPane`)
Rewrite around "tell the AI about you and your company". New fields, persisted on `public.profiles` via `supabase/migrations/20260603000000_profiles_personalization.sql` (adds columns + `GRANT UPDATE(col)` for each + `NOTIFY pgrst, 'reload schema'`):
- `company_name text`
- `company_website text`
- `company_one_liner text`
- `company_description text` (mission, product, team, culture)
- `hiring_context text` (typical roles, seniority, locations)
- `user_role text`
- Keep **Sourcing regions** (multi-select chips).
- Drop **Assistant name**, **Outreach tone**, **Auto-personalize**, **Email signature**.

Server: extend `getProfile` and add `updatePersonalization` in `src/lib/profile.functions.ts`. Inject `company_description` + `hiring_context` into the system prompts that draft outreach + job posts (read profile inside those server fns and prepend an "About the user's company" block) — touches `src/routes/api/chat.ts` and the outreach/job-post drafters.

### Data controls (`DataPane`)
Make **Export data** real: download CSV of the user's **unlocked candidates**.
- New server fn `exportCandidatesCsv` (`src/lib/data-export.functions.ts`) protected by `requireSupabaseAuth`; selects from `candidates` where `user_id = auth.uid()` and `is_locked = false`. Returns CSV with: name, role, company, location, email, phone, linkedin, source, stage, tags (joined), starred, created_at.
- Client triggers a Blob download (`findable-candidates-YYYY-MM-DD.csv`).
- RLS already scopes per-user → no cross-tenant leakage; the server fn also filters by `userId` for defense in depth.

### Security (`SecurityPane`)
- Remove the **Two-factor authentication** row (and `findable:2fa` state).
- **Change password**: keep `resetPasswordForEmail`; show pending state on the button and a clear toast.
- **Active sessions**: replace static "1 active" with "This device" + helper copy explaining "Sign out everywhere" ends any other sessions. (Real session enumeration needs the admin API; out of scope for MVP.)
- **Log out all devices**: keep `supabase.auth.signOut({ scope: "global" })`, add a confirmation `AlertDialog`, then redirect to `/login`.

### Account (`AccountPane`)
- **Display name update error** (`Could not find the 'display_name' column ... in the schema cache`):
  - Migration `20260602010000_profiles_display_name.sql` exists but PostgREST's schema cache wasn't reloaded on the live instance. Add `supabase/migrations/20260603010000_profiles_display_name_reload.sql` that re-runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS display_name text;`, re-issues `GRANT UPDATE(display_name) ON public.profiles TO authenticated;`, and `NOTIFY pgrst, 'reload schema';`.
  - Debounce the Display name input (save on blur or after 600ms idle) instead of firing on every keystroke.
- **Delete account**: make it real.
  - New server fn `deleteOwnAccount` in `src/lib/account.functions.ts`, protected by `requireSupabaseAuth`. Uses `supabaseAdmin.auth.admin.deleteUser(userId)`. Verify/add `ON DELETE CASCADE` from dependent tables to `auth.users` so the user's rows are cleaned up.
  - Client: confirm dialog → call fn → `supabase.auth.signOut()` → redirect to `/`.

## Out of scope

- Real multi-language coverage beyond Settings labels.
- Real per-session listing (needs admin API + new table).
- 2FA enrollment / recovery codes.

## Files touched

- `src/components/settings/settings-dialog.tsx` (all panes above)
- `src/lib/profile.functions.ts` (extend + personalization update)
- `src/lib/notifications.functions.ts` (defensive select)
- `src/lib/data-export.functions.ts` (new — CSV export)
- `src/lib/account.functions.ts` (new — delete account)
- `src/lib/i18n.tsx` (new — language shim)
- `src/routes/__root.tsx` (wrap with `LanguageProvider`, set `<html lang>`)
- `src/routes/api/chat.ts` + outreach/job-post drafter prompts (inject company context)
- `supabase/migrations/20260603000000_profiles_personalization.sql` (new columns + grants + reload)
- `supabase/migrations/20260603010000_profiles_display_name_reload.sql` (force schema cache reload for display_name)
- `supabase/migrations/20260603020000_notification_prefs_reload.sql` (ensure notify_* columns + schema cache reload)
