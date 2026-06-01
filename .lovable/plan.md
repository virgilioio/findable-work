# Switch auth emails to Supabase-native (Resend SMTP)

Move off the custom `/api/public/auth/email-hook` and let Supabase send all auth emails directly via Resend SMTP, using branded HTML templates pasted into the Supabase dashboard.

## What I'll change in code

1. **Delete the hook + templates**
   - `src/routes/api/public/auth/email-hook.ts` (delete)
   - `src/lib/email/auth-templates.ts` (delete)
   - Any imports / references to the above
   - Remove `AUTH_EMAIL_HOOK_SECRET` from the secrets list (no longer used)

2. **Create `supabase/email-templates/` in the repo** as the source of truth for the six branded templates (Supabase doesn't let us deploy templates via migration — these files are reference copies you paste into the dashboard):
   - `confirm-signup.html`
   - `magic-link.html`
   - `reset-password.html`
   - `invite.html`
   - `email-change.html`
   - `reauthentication.html`

   Each template:
   - White body background, findable wordmark in header, neutral palette matching the app
   - Single black CTA button (uses `{{ .ConfirmationURL }}` / `{{ .Token }}` where appropriate)
   - Per-action subject + headline + body copy (e.g. signup says "Confirm your email", magic link says "Your sign-in link", reset says "Reset your password")
   - Footer with findable.work, Terms, Privacy

3. **Add a short `supabase/email-templates/README.md`** with exact steps for you to apply them in the Supabase dashboard (since this is all manual config).

## What you'll do in the Supabase dashboard (manual — can't be automated)

I'll give you the exact click-path. Summary:

1. **Auth → Settings → SMTP Settings** → Enable custom SMTP:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: your existing `RESEND_API_KEY` value
   - Sender email: `no-reply@findable.work`
   - Sender name: `Findable`

2. **Auth → Settings → Email Templates** → for each of the 6 templates, paste in the matching HTML from `supabase/email-templates/` and update the subject line.

3. **Auth → Hooks** → make sure the "Send Email Hook" is **disabled** (so Supabase sends natively instead of calling our deleted route).

## Out of scope

- No changes to `/login`, `/forgot-password`, `/reset-password`, or magic-link UI (those flows already call `supabase.auth.*` correctly and will just start using the new SMTP + templates automatically).
- No SMS / phone OTP, no Google OAuth changes.
- No changes to transactional (non-auth) emails.

## Files touched

- delete: `src/routes/api/public/auth/email-hook.ts`
- delete: `src/lib/email/auth-templates.ts`
- create: `supabase/email-templates/*.html` (6 files)
- create: `supabase/email-templates/README.md`
- secrets: remove `AUTH_EMAIL_HOOK_SECRET`
