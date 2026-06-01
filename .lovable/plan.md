# Full app shell internationalization

Expand the existing `src/lib/i18n.tsx` so switching language in Settings → General → Language visibly translates every piece of static UI chrome across the app. AI-generated content stays untouched (the model auto-detects the user's language).

## Scope — what gets translated

Static UI strings only. For each surface below, every visible label, button, placeholder, tooltip, tab name, empty-state copy, confirm-dialog copy, and toast message gets a translation key.

1. **App shell** (`src/routes/_authenticated/app.tsx`)
   - Sidebar: nav items, "New chat", section headers, user menu (Settings, Sign out, etc.)
   - Top bar: page titles, action buttons
2. **Chat surface** (`src/routes/_authenticated/app.index.tsx`, `app.c.$id.tsx`, `src/components/chat/*`)
   - Composer placeholder, send/stop buttons, attach hints
   - Empty state ("Start a new conversation…")
   - Thinking ticker labels, clarify-card prompts, task-card status labels
3. **Jobs** (`src/routes/jobs/*`, `src/components/jobs/hiring-assistant.tsx`)
   - List headers, empty state, "Create job", status chips, hiring-assistant CTA copy
4. **Candidates** (`src/components/candidates/*`)
   - Panel title, filters, empty state, add-candidate modal labels, drawer tab names, unlock CTA
5. **Outreach** (`src/components/outreach/*`)
   - Inbox tabs, empty state, contact-automation toggles, Gmail connect card copy
6. **Settings** (`src/components/settings/settings-dialog.tsx`)
   - Every pane: row titles, descriptions, button labels, confirmation modals (delete account, sign out all devices, export, change password)
7. **Auth flows** (`src/routes/login.tsx`, `forgot-password.tsx`, `reset-password.tsx`, already-partial `auth-dialog.tsx`)
   - Page titles, form labels, helper text, success/error toasts
8. **Common** — global toasts ("Saved", "Something went wrong"), confirm dialogs ("Are you sure?"), table empty states, "Loading…", pagination ("Next", "Previous").

## Approach

- Reorganize `DICT` in `src/lib/i18n.tsx` into namespaces: `common.*`, `nav.*`, `chat.*`, `jobs.*`, `candidates.*`, `outreach.*`, `settings.*`, `auth.*`, `toast.*`.
- Add full translations for `en`, `es`, `pt`, `fr`, `de`. English keys stay in the dict explicitly (instead of relying on the fallback string) so missing-key audits are reliable.
- In each affected component, replace hard-coded strings with `const { t } = useLanguage()` + `t("namespace.key", "English fallback")`.
- For strings with variables (e.g. "3 candidates unlocked"), use a small `format(template, vars)` helper added to i18n.tsx, e.g. `t("candidates.unlocked_count", "{n} candidates unlocked", { n: 3 })`.
- Keep `document.documentElement.lang` synced (already wired) so screen readers and the AI input boundary get the right hint.

## Out of scope

- Translating user-generated content (job descriptions, outreach drafts, chat replies). These already adapt to the user's input language via the model.
- Server-side error messages returned by serverFns (English only for now — can revisit).
- RTL languages and date/number locale formatting (current 5 languages are all LTR; we'll keep `Intl.DateTimeFormat` defaults).
- Email templates and external pages (privacy, terms) — separate effort.

## Verification

After implementation, switch language to each of `es`, `pt`, `fr`, `de` and walk: sidebar → new chat → open a job → open a candidate → outreach inbox → settings panes → sign out. Confirm no English leaks except AI-generated content and known out-of-scope items.

## Files touched

- `src/lib/i18n.tsx` — expanded dictionaries + `format()` helper
- `src/routes/_authenticated/app.tsx`, `app.index.tsx`, `app.c.$id.tsx`
- `src/routes/login.tsx`, `forgot-password.tsx`, `reset-password.tsx`
- `src/components/chat/*`, `src/components/jobs/*`, `src/components/candidates/*`, `src/components/outreach/*`
- `src/components/settings/settings-dialog.tsx` (remaining panes)
- `src/components/auth/auth-dialog.tsx` (gap-fill)

No schema, serverFn, or business-logic changes.