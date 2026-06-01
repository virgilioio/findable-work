## Answers first

1. **Language** — Today the i18n shim only translates a few Settings labels. Picking Spanish/French/etc. won't visibly change the app. We should expand coverage so the visible UI chrome (sidebar, top bar, common dialogs, settings, empty states, buttons) reacts to the language choice. The AI continues to auto-detect the user's language in chat — i18n is purely the UI shell.
2. **Personalization** — The fields save to `profiles`, but nothing reads them when building AI prompts yet. So right now they're effectively placeholder. We'll inject `company_name`, `company_one_liner`, `company_description`, `hiring_context`, `user_role`, `sourcing regions` into the system prompts used by chat, the outreach drafter, and the job-post drafter.
3. **Display name error** — A reload migration exists, but the live schema snapshot still shows `profiles` without `display_name` (and without the personalization columns). The previous migrations likely haven't been applied on this instance, or PostgREST's cache is still cold. We'll add a fresh idempotent migration that re-adds all the columns and forces a reload, plus harden the client-side error surface.

## Plan

### 1. Fix `display_name` update for real
- New migration `20260604000000_profiles_columns_resync.sql`:
  - `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS` for: `display_name`, `company_name`, `company_website`, `company_one_liner`, `company_description`, `hiring_context`, `user_role`, `notify_on_new_applicant`, `notify_daily_digest`, `sourcing_regions` (whatever the personalization pane writes).
  - Re-issue `GRANT UPDATE(col)` for each to `authenticated`.
  - `NOTIFY pgrst, 'reload schema';` at end.
- In `AccountPane`, when the update fails, show the actual Postgres error message in the toast (not just "Failed to update name") so we can diagnose if it recurs.

### 2. Wire Personalization into AI prompts
- In `src/lib/profile.functions.ts`, export a small helper `buildPersonalizationContext(profile)` that returns a formatted string like:
  ```
  About the recruiter:
  - Role: {user_role}
  Company: {company_name} ({company_website})
  One-liner: {company_one_liner}
  About the company: {company_description}
  Hiring context: {hiring_context}
  ```
  Skips empty fields.
- Inject that string into the system prompt of:
  - `src/routes/api/chat.ts` (main chat) — prepend after the base system prompt.
  - Outreach drafter (wherever outreach emails/LinkedIn templates are generated).
  - Job-post drafter (job description generation).
  - Job creation (`jobs_candidate_assistant_prompt` flow) so generated JDs reflect the company voice.
- Each of these already loads the authenticated `userId`; fetch the profile row once and pass the context string in.

### 3. Make Language switch the actual UI
- Expand `src/lib/i18n.tsx` translation dictionaries (`en`, `es`, `pt`, `fr`, `de`) to cover the visible app chrome:
  - Sidebar nav labels (Chat, Jobs, Candidates, Outreach, Settings, etc.)
  - Top bar / user menu items (Sign out, Settings, Billing, Help)
  - Common buttons (Save, Cancel, Delete, Confirm, Loading…)
  - Empty-state copy on main panels (chat empty, candidates empty, jobs empty)
  - All Settings panes (already partially covered — finish coverage)
  - Auth dialog headings/CTAs ("Sign in to findable", "Start hiring with findable", email/password labels)
- Replace hard-coded English in those components with `t("namespace.key", "English fallback")`.
- Set `<html lang={lang}>` from `LanguageProvider` so screen readers + SEO pick it up.
- Out of scope (clearly note in UI): AI-generated content stays in whatever language the user writes in — only the UI shell switches.

### 4. Verification
- After migration runs: change Display name → confirm no error, value persists across reload.
- Save Personalization → start a new chat, ask AI to draft an outreach email → confirm it references the company info.
- Switch language to Spanish → sidebar, top bar, settings, auth dialogs all switch; chat content stays as the user typed.

### Files touched
- New: `supabase/migrations/20260604000000_profiles_columns_resync.sql`
- Edited: `src/lib/profile.functions.ts`, `src/lib/i18n.tsx`, `src/routes/api/chat.ts`, outreach drafter fn, job-post drafter fn, `src/components/settings/settings-dialog.tsx` (AccountPane error surface), sidebar + top-bar + auth-dialog + main panel empty states for i18n.