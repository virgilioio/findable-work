
## Why this is broken today

1. **Forgot password** on `/login` is just an `<a href="#">` — clicking it does nothing.
2. **Magic link** isn't offered in the UI at all.
3. **There is no `/reset-password` route**, so even if a reset email was sent, the link would land on the homepage and silently auto-sign-in the user instead of letting them set a new password.
4. **Branded emails are already coded** in `src/lib/email/auth-templates.ts` and served by the hook at `src/routes/api/public/auth/email-hook.ts` (HMAC-verified, sends via Resend from `no-reply@findable.work`). The reason you still get plain Supabase emails is that the **Send Email Hook is not enabled in Lovable Cloud → Auth → Hooks**. Until that toggle is on, Supabase keeps sending the default templates and ignores our hook.

## What I'll build

### 1. Forgot password flow
- New route `/forgot-password`: branded card (same shell as `/login`), email input, calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`, shows a "Check your inbox" confirmation state.
- New route `/reset-password` (public, NOT under `_authenticated`):
  - Listens for `PASSWORD_RECOVERY` via `onAuthStateChange` (Supabase sets a recovery session when the user clicks the email link).
  - Shows "New password" + "Confirm password" form, calls `supabase.auth.updateUser({ password })`.
  - On success, signs the user in and redirects to `/app`.
  - Handles "link expired / invalid" with a clear CTA back to `/forgot-password`.
- Replace the dead "Forgot password?" `<a href="#">` in `login.tsx` with a `<Link to="/forgot-password">`.

### 2. Magic link flow
- Add a "Email me a magic link" secondary button on `/login` (under the password field, above the toggle to signup). Calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: <origin>/app } })` and swaps the card into a "Check your inbox" state.
- Magic-link emails will use the same branded template (already handled in `auth-templates.ts` — `magic_link` action type is covered).

### 3. Finish the branded-email wiring
The code is done; what's missing is configuration.
- I'll verify `AUTH_EMAIL_HOOK_SECRET`, `LOVABLE_API_KEY`, `RESEND_API_KEY` are present in the project (the secrets panel lists all three already).
- I'll instruct you with one short on-screen step: open **Lovable Cloud → Authentication → Hooks → Send Email Hook**, enable it, paste URL `https://findable.work/api/public/auth/email-hook` and the existing `AUTH_EMAIL_HOOK_SECRET` value. This is the only piece that has to be flipped in the dashboard — it cannot be done from code.
- I'll also review `auth-templates.ts` and tighten the visual structure so it matches findable's branding (Wordmark in header, same neutrals as the app, single black CTA button, footer with Terms / Privacy links). Light mode only — that's the right call for email.

### 4. Quick sanity polish on emails
- Add a real "findable" logo to the email header (inline SVG or hosted PNG — Resend handles both; I'll use a small hosted PNG to avoid Gmail's SVG strip).
- Make sure preheader text, subject lines, and CTA copy are distinct for: signup confirmation, magic link, password recovery, email change, reauthentication, invite.

## Out of scope
- Switching email provider away from Resend.
- SMS / phone OTP.
- Changing the Google OAuth flow.
- Building a Supabase-dashboard automation — the hook toggle is a one-time manual step.

## Files I'll touch
- `src/routes/forgot-password.tsx` *(new)*
- `src/routes/reset-password.tsx` *(new)*
- `src/routes/login.tsx` *(forgot link + magic-link button)*
- `src/lib/email/auth-templates.ts` *(branding pass, logo, per-action copy)*
- Possibly `public/email-logo.png` *(new — small hosted asset for email header)*

After implementation I'll tell you exactly which switch to flip in Cloud → Auth → Hooks so Supabase stops sending the default templates.
