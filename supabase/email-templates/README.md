# Findable auth email templates

These HTML files are the source of truth for the branded auth emails sent by Supabase. Supabase does not let us deploy templates via migration, so they must be pasted into the Supabase dashboard manually whenever they change.

## One-time SMTP setup (Resend)

Lovable Cloud → Auth → Settings → **SMTP Settings** → enable custom SMTP:

- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: the value of the `RESEND_API_KEY` secret
- Sender email: `no-reply@findable.work`
- Sender name: `Findable`

Make sure `findable.work` is a verified domain in Resend before saving.

## Disable the old hook

Lovable Cloud → Auth → **Hooks** → make sure **Send Email Hook** is disabled. (The old `/api/public/auth/email-hook` route has been deleted from the codebase.)

## Paste the templates

Lovable Cloud → Auth → Settings → **Email Templates**. For each row, set the subject and paste the body from this folder:

| Template | Subject | File |
|---|---|---|
| Confirm signup | Confirm your email | `confirm-signup.html` |
| Magic Link | Your sign-in link | `magic-link.html` |
| Reset Password | Reset your password | `reset-password.html` |
| Invite user | You're invited to findable | `invite.html` |
| Change Email Address | Confirm your new email | `email-change.html` |
| Reauthentication | Confirm it's you | `reauthentication.html` |

## Variables used

- `{{ .ConfirmationURL }}` — action link (signup, magic link, reset, invite, email change)
- `{{ .NewEmail }}` — only in the email-change template
- `{{ .Token }}` — 6-digit code, only in the reauthentication template

Don't rename or wrap these — Supabase substitutes them server-side before sending.