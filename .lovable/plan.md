## Fix Google OAuth returning to landing page

### Root cause
After Google OAuth, the browser redirects to `window.location.origin` (the `/` landing page). At that moment Supabase has not yet processed the OAuth code in the URL, so:
- `beforeLoad` calls `getUser()` → returns null → no redirect
- The component mounts and listens for a `CLAIM_PENDING_KEY` flag that is never set
- When Supabase finally completes the code exchange and fires `SIGNED_IN`, **nothing is listening** → user is stuck on landing page

### Fix

**1. `src/components/auth/auth-dialog.tsx` + `src/routes/login.tsx`:** Before calling `lovable.auth.signInWithOAuth("google", ...)`, set `sessionStorage.setItem("findable:claim-pending", "1")` so the landing page knows to act on the returning session. (auth-dialog already runs claim flow on success; just need the flag set for the OAuth return round-trip.)

**2. `src/routes/index.tsx` (HomePage):** Add a `supabase.auth.onAuthStateChange` listener inside the hydrated effect. When `SIGNED_IN` fires:
   - If `CLAIM_PENDING_KEY` is set AND there are messages in guest state → run `runClaim()` (existing function, navigates to `/app/c/$id`)
   - Otherwise → `navigate({ to: "/app" })`
   - Clear `CLAIM_PENDING_KEY` after handling

This catches the late session hydration that happens after the OAuth redirect lands on `/`.

**3. `src/routes/login.tsx`:** Same listener pattern — after OAuth returns to `/login`, navigate to redirect target on `SIGNED_IN`. (Currently only happens synchronously via `redirectToApp()` after `signInWithOAuth` returns, but that path is skipped when `result.redirected` is true.)

### Files changed
- `src/routes/index.tsx` — add `onAuthStateChange` listener for post-OAuth navigation
- `src/routes/login.tsx` — set claim-pending flag before OAuth + listen for `SIGNED_IN` after return
- `src/components/auth/auth-dialog.tsx` — set claim-pending flag before OAuth

### Out of scope
No backend / RLS / schema changes. No change to the OAuth provider config.