# Fix infinite /app ↔ /login redirect loop

## Root cause

In `src/routes/app.tsx`, an `onAuthStateChange` listener is registered inside an effect with `[router, qc, navigate]` as dependencies:

```ts
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
    router.invalidate();
    qc.invalidateQueries();
    if (!session) navigate({ to: "/login", replace: true });
  });
  return () => subscription.unsubscribe();
}, [router, qc, navigate]);
```

Three problems compound into a loop:

1. **`navigate` from `useNavigate()` is a fresh reference each render.** Every re-render unsubscribes and re-subscribes. Each fresh subscription fires `INITIAL_SESSION` immediately, which calls `router.invalidate()` → triggers re-render → new `navigate` ref → re-subscribe → fires again. A second tick later it can briefly see `session === null` while Supabase restores tokens and bounces the user to `/login`.
2. **`router.invalidate()` is called on EVERY auth event**, including `INITIAL_SESSION` and `TOKEN_REFRESHED`. That forces the `/app` route's `beforeLoad` (which awaits `supabase.auth.getUser()`) to re-run on every event, multiplying the chance of a transient null read.
3. **`login.tsx` redirects back the moment it sees a user** (`useEffect` → `getUser` → `navigate("/app")`). The moment `/app` bounces here, login bounces back. Infinite loop.

## Fix

### `src/routes/app.tsx`
- Replace the unstable effect with one that has an **empty dependency array** and uses `router.navigate` (stable) instead of the `useNavigate` hook reference inside the listener.
- Only react to meaningful events: `SIGNED_OUT` → navigate to `/login`. Skip `INITIAL_SESSION` / `TOKEN_REFRESHED` / `USER_UPDATED`.
- Only invalidate caches on `SIGNED_IN` / `SIGNED_OUT`, not on every event.
- Remove the standalone `getUser()` effect that sets email — read it from the same listener (or from the existing `beforeLoad` return) to avoid an extra round-trip.

### `src/routes/login.tsx`
- Remove the `useEffect` that redirects authenticated users back to `/app`. The redirect-back behavior should only happen **after the user explicitly submits the form** (which already navigates). An automatic redirect on mount is what closes the loop with `/app`'s misbehaving listener — and once `/app`'s listener is fixed, this auto-redirect serves no purpose (a signed-in user lands on `/app` directly, not `/login`).
- If we want to keep a guard so a signed-in user manually visiting `/login` is bounced, do it in `beforeLoad` (runs once, server + client) instead of in a `useEffect` that races with auth restoration.

## Files changed
- `src/routes/app.tsx` — fix listener (stable refs, filter events, no constant invalidation).
- `src/routes/login.tsx` — replace `useEffect` redirect with a `beforeLoad` guard.

## Verification
- Hard reload `/app` while signed in → no bouncing, page renders once.
- Hard reload `/login` while signed in → redirects to `/app` once (via `beforeLoad`).
- Click "Sign out" → goes to `/login` once and stays.
- Sign in with email/password → goes to `/app` once and stays.
