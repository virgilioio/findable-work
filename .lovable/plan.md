# Lock down /app for unauthenticated users

## Problem

`src/routes/app.tsx` guards the route with:

```ts
beforeLoad: async () => {
  if (typeof window === "undefined") return; // ❌ skips SSR entirely
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw redirect({ to: "/login" });
}
```

Two issues:
1. The `typeof window === "undefined"` short-circuit means SSR/prerender allows the route to render unauthenticated — exactly the antipattern called out in the auth-guards knowledge.
2. The runtime error `Invariant failed: Expected to find a match below the root match in SPA mode` indicates the redirect path isn't always firing cleanly from inside `app.tsx` itself (the guard lives on the same route it's trying to protect, and there's no separate layout boundary).

The child routes (`/app/`, `/app/c/$id`) inherit from `app.tsx`, but any future protected route would need its own copy of the guard — fragile.

## Fix

Adopt the canonical TanStack pattern: a single pathless `_authenticated` layout route that does the auth check, with all protected pages nested under it.

### Steps

1. **Create `src/routes/_authenticated.tsx`** — pathless layout route that:
   - In `beforeLoad`, awaits `supabase.auth.getUser()` (no `typeof window` skip).
   - On no user / error, throws `redirect({ to: "/login", search: { redirect: location.href } })`.
   - Component is `() => <Outlet />`.

2. **Move the protected route files under the layout** (rename so the route tree regenerates correctly):
   - `src/routes/app.tsx` → `src/routes/_authenticated/app.tsx`
   - `src/routes/app.index.tsx` → `src/routes/_authenticated/app.index.tsx`
   - `src/routes/app.c.$id.tsx` → `src/routes/_authenticated/app.c.$id.tsx`
   - Update each `createFileRoute("/app/...")` → `createFileRoute("/_authenticated/app/...")`.
   - Remove the inline `beforeLoad` from `app.tsx` (now handled by the layout).
   - URLs stay exactly the same (`/app`, `/app/c/:id`) — the underscore segment is stripped from the URL.

3. **Update `src/routes/login.tsx`** to honor `?redirect=` so a redirected user lands back on `/app` after login (validate search, redirect after sign-in to `search.redirect ?? "/app"`).

4. Let `routeTree.gen.ts` regenerate automatically — no manual edits.

## Result

- Any unauthenticated visit to `/app` or any future `/_authenticated/*` route is blocked in `beforeLoad` before render — no flash of protected UI, no SSR bypass.
- One guard, applied uniformly to every internal page.
- After login, users land back where they tried to go.
