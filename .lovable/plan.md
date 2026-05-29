## Goal

Send Supabase auth verification emails (signup confirmation, password reset, magic links, email changes) from **no-reply@findable.work** via Resend, so they actually arrive and look branded.

## Why this is needed

The "check your email" banner shows even when no email was sent — Lovable Cloud's default auth mailer is a low-rate-limit test sender that silently drops most messages. We need to point Auth at a real provider on your verified Resend domain.

## Approach: Supabase "Send Email Hook" → our app → Resend

Supabase Auth supports a webhook that, when configured, replaces the default mailer. We expose a public endpoint in our TanStack app; Auth POSTs every email event to it (signup, recovery, magic_link, email_change, invite, reauthentication) with the user, token, and redirect URL. Our handler verifies the request signature, renders a branded HTML email, and sends it via Resend.

## Steps

### 1. Create the email hook route

New file: `src/routes/api/public/auth/email-hook.ts`

- Public route (no app auth) — Supabase calls it directly.
- Verifies the `standard-webhooks` HMAC signature using a shared secret (`AUTH_EMAIL_HOOK_SECRET`).
- Branches on `email_data.email_action_type` and renders one of 6 templates.
- Sends through the Resend connector gateway with `from: "findable <no-reply@findable.work>"`.
- Returns `{}` on success, proper error codes on failure (so Supabase logs them).

### 2. Branded email templates

Inline-HTML templates in `src/lib/email/auth-templates.ts` (one per event type):
- Confirm signup
- Magic link
- Reset password
- Email change confirmation
- Invite
- Reauthentication

Style: findable wordmark, white background, simple CTA button matching the app's `--text` / `--bg-elev` tokens. Light mode only (email clients are inconsistent with dark mode).

### 3. Secrets

Already set ✅:
- `RESEND_API_KEY`
- `LOVABLE_API_KEY` (for the connector gateway)

Need to add (one new secret):
- `AUTH_EMAIL_HOOK_SECRET` — the signing secret Supabase generates when registering the hook. I'll request it via the secure secret prompt once you've created the hook (step 4).

### 4. Register the hook in Supabase Auth

Two options here — I'll pick whichever works given Lovable Cloud's surface:

- **Option A (preferred):** Configure via a migration that sets the hook URL and secret in `auth.config` / hook tables. If Lovable Cloud allows this, it's fully automated.
- **Option B (fallback):** You add it manually in Cloud → Auth settings (I'll give you the URL + paste-in instructions). The hook URL will be:
  `https://findable.work/api/public/auth/email-hook`

I'll determine which path works during implementation. Most likely Option B because Lovable Cloud restricts direct auth-config writes.

### 5. Test end-to-end

- I'll first delete the stuck test user (your earlier admin signup) via a migration so you can re-signup cleanly.
- You sign up with a fresh email → email arrives from `no-reply@findable.work` within seconds.
- Verify in Resend dashboard logs.
- Click link → land on the app verified and signed in.
- Test "Forgot password" path too.

## Open questions

1. **Sender display name** — `findable <no-reply@findable.work>` or just `no-reply@findable.work`? (I'll default to `findable` if no preference.)
2. **Reply-to** — should replies go anywhere meaningful (e.g. `support@findable.work`), or is `no-reply` truly no-reply? (Default: no reply-to header.)

Approve and I'll switch to build mode and wire it all up.
