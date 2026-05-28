## Plan

1. **Stop the post-login route race**
   - Change `/login` submit handling to use a hard `window.location.replace('/app')` after successful sign-in/sign-up session creation.
   - Avoid relying on TanStack client navigation immediately after auth writes, because the session storage update and route guard are currently racing.

2. **Make route guards less fragile**
   - Keep `/app` protected with `supabase.auth.getUser()`.
   - Remove or soften the `/login` `beforeLoad` auto-redirect so a transient auth check cannot bounce the user back and forth or block the login screen.

3. **Add temporary auth debug logging**
   - Add clear `console.info` / `console.error` logs around login submit, sign-in success/failure, route guard decisions, and app auth-state changes.
   - These logs will make the next failure visible in the browser console instead of silently failing.

4. **Keep app auth cleanup safe**
   - On sign-out, clear cached queries and hard-redirect to `/login` once.
   - Do not invalidate the whole router from auth listeners, since that caused the original loop.

5. **Verify the behavior**
   - Confirm the network auth request already succeeds, then verify the UI lands on `/app` and stays there after login.
   - Confirm sign-out still returns to `/login` without a loop.