## Plan

1. **Stop the backend from trying to process the OAuth hash/code itself**
   - Update the browser auth client options so it does **not** auto-detect OAuth tokens or codes in the URL.
   - This matters because the managed Google sign-in flow returns tokens through Lovable Cloud’s broker, but the current auth client can still see the callback URL and attempt its own exchange, producing `failed to exchange authorization code`.

2. **Handle callback errors on `/` explicitly**
   - On the home route, detect `#error=...` in the URL.
   - Clean the hash from the address bar so the page does not stay stuck on an OAuth error URL.
   - If a valid session already exists, send the user to `/app`; otherwise show a clean sign-in error instead of silently doing nothing.

3. **Make successful managed OAuth redirect deterministic**
   - Keep using `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`.
   - After tokens are set, force a route refresh/navigation check so the user lands in `/app` even if the auth event is missed.
   - Keep the existing guest-chat claim behavior only when there is a real pending guest conversation.

4. **Verify the code path**
   - Confirm there are no remaining direct `supabase.auth.signInWithOAuth` calls.
   - Check the final OAuth path only targets the managed broker and `/app` is the post-login destination.

## Technical details

- Files to change:
  - `src/integrations/supabase/client.ts` only if necessary to add the auth client option that prevents URL-session detection.
  - `src/routes/index.tsx` for callback error cleanup and redirect fallback.
  - `src/routes/login.tsx` / `src/components/auth/auth-dialog.tsx` only for small redirect hardening if needed.

- No database changes are needed.
- No Google Console changes are needed; this should remain on Lovable Cloud managed Google OAuth.