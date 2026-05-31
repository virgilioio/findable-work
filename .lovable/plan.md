# Detach auth from Lovable Cloud → use your own Supabase

Goal: Google sign-in goes through **your** Supabase project (`oqkgofqwgurvhzluuvsm`) using the standard `supabase.auth.signInWithOAuth` flow — no Lovable broker, no `/~oauth/callback` proxy.

## Why the current setup keeps failing

The app currently calls `lovable.auth.signInWithOAuth("google", ...)`, which routes through Lovable Cloud's OAuth broker (`oauth.lovable.app` → `/~oauth/callback`) and finishes on Lovable's managed Supabase project `srznzxyhaomvzwqgaego`. That project's Google credentials and redirect URL allowlist don't match what your custom domain (`findable.work` vs `www.findable.work`) is sending, so the broker returns `failed to exchange authorization code`. Pointing at your own Supabase project removes the broker entirely.

## Changes I will make in code

1. **`src/integrations/supabase/client.ts`** — hardcode your project's URL + publishable/anon key (you'll paste them). Remove the Lovable Cloud env fallbacks so there's no chance of pointing at the wrong project. Add `detectSessionInUrl: true` and `flowType: 'pkce'` so Supabase handles the OAuth callback hash itself.

2. **`src/routes/login.tsx`** — replace the `lovable.auth.signInWithOAuth("google", ...)` call with:
   ```ts
   await supabase.auth.signInWithOAuth({
     provider: 'google',
     options: { redirectTo: `${window.location.origin}/auth/callback` },
   })
   ```

3. **`src/components/auth/auth-dialog.tsx`** — same swap as above.

4. **`src/routes/auth.callback.tsx`** (new) — minimal route that lets `supabase-js` finish the PKCE exchange (it auto-runs from `detectSessionInUrl`), then `navigate({ to: '/app' })`. Shows a small "Signing you in…" spinner.

5. **Remove `__oauthHashCapture`** interceptor from `src/routes/index.tsx` — it was a workaround for the Lovable broker's hash response and will now interfere with the native PKCE `?code=` callback.

6. **Leave alone**:
   - `src/integrations/lovable/appUserConnector` (Gmail / Calendar per-end-user OAuth — unrelated, keeps working).
   - `src/integrations/supabase/types.ts` (still describes your DB schema; you'll regenerate from your own project later if needed).

## What you need to do in Google Cloud + your Supabase dashboard

I cannot do these — they're outside the codebase.

1. **Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client (Web)**
   Add to **Authorized redirect URIs**:
   ```
   https://oqkgofqwgurvhzluuvsm.supabase.co/auth/v1/callback
   ```
   Copy the Client ID and Client Secret.

2. **Your Supabase dashboard → Authentication → Providers → Google**
   - Enable Google
   - Paste Client ID + Client Secret
   - Save

3. **Your Supabase dashboard → Authentication → URL Configuration**
   - **Site URL**: `https://findable.work`
   - **Redirect URLs** (allowlist):
     ```
     https://findable.work/auth/callback
     https://www.findable.work/auth/callback
     https://findable-work.lovable.app/auth/callback
     https://id-preview--5ab3d2d7-ec9c-41d4-81ad-06d14aa7d875.lovable.app/auth/callback
     http://localhost:5173/auth/callback
     ```

4. **Pick one canonical host for findable.work.** Decide whether `www.findable.work` 301s to `findable.work` or vice versa, and use the same one as your Site URL. Mixing the two is what produced the original "exchange code" failure.

5. **Paste in chat**, when ready to build:
   - `MY_SUPABASE_URL` value (e.g. `https://oqkgofqwgurvhzluuvsm.supabase.co`)
   - `MY_SUPABASE_ANON_KEY` value (the publishable/anon key, NOT service role)

## How the new flow works end-to-end

```text
User clicks "Continue with Google"
  → supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: '/auth/callback' })
  → redirect to accounts.google.com
  → Google → https://oqkgofqwgurvhzluuvsm.supabase.co/auth/v1/callback?code=...
  → Supabase exchanges code, redirects to https://findable.work/auth/callback?code=...
  → supabase-js (detectSessionInUrl) completes PKCE, stores session in localStorage
  → /auth/callback route detects session, navigate('/app')
```

No Lovable broker, no `/~oauth/callback`, no domain-mismatch redirect loop.

## Confirm before I switch to build mode

- You're OK that `src/integrations/supabase/client.ts` will no longer be auto-managed by Lovable Cloud (it's already been edited; this just makes it explicit).
- Ready to paste the URL + anon key from your own Supabase project in the next message.
