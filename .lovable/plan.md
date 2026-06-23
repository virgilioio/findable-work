## Problem

Clicking "Reveal phone" correctly fires `revealCandidatePhone` and writes a `phone_reveal_pending` entry — that's why the drawer shows "Pending — requested X min ago". But Apollo delivers the actual number asynchronously to our webhook, and **nothing on the client polls for it**. The drawer reads from the `["candidates", conversation_id]` query, which is invalidated exactly once (on the reveal mutation's success) and then never again. So the number can land in the DB minutes ago and the UI will still say "Pending" until you reload the page or close/reopen the drawer.

The fix is purely on the client.

## Fix — auto-refresh in the candidate drawer

Only `src/components/candidates/candidate-drawer.tsx` changes. No server, billing, webhook, or Apollo logic is touched.

1. **Reuse the existing `isPending` detection** (already computed inline in `Overview` from `activity[]`). Lift it to a small helper so the effect can read the same value.

2. **Polling effect** that runs whenever the drawer is open on a candidate with `apollo_id` and no `phone`:
   - On mount / when `c.id` changes: kick one immediate `qc.invalidateQueries({ queryKey: ["candidates", c.conversation_id] })` so a number that arrived while the drawer was closed shows up instantly.
   - If `isPending && !c.phone`: start an interval — **every 5 s for the first minute, then every 15 s** — each tick invalidates the same query key. Stop after **30 min total** (matches the existing "Stuck" threshold).
   - Stop immediately when `c.phone` becomes set, when `isPending` becomes false (Apollo returned "no number on file"), or on unmount.
   - Pause while `document.hidden` and resume on `visibilitychange` so background tabs don't burn requests.

3. **Toast on arrival**: track the previous `c.phone` value in a ref; when it transitions from empty → set, fire `toast.success("Phone number revealed")` exactly once.

4. **No new server function, no new query key, no schema change.** The existing candidates list query is already keyed per conversation and returns the updated `activity[]` + `phone`, so invalidation is sufficient.

## Why this is enough

- Apollo's webhook (`/api/public/apollo/phone`) already writes `phone` and a `phone_revealed` activity entry — that path is fine and is exercised correctly today.
- The `revealCandidatePhone` server fn is also fine — your "Pending" badge proves it wrote the activity entry.
- The only missing link is the client noticing that the row changed. Polling the existing query is the smallest, safest fix.

## Out of scope

- No changes to `src/lib/candidates.functions.ts`
- No changes to `src/routes/api/public/apollo/phone.ts`
- No changes to the admin diagnostics page
- No changes to billing, credits, or activity logging
- No background polling on the candidates list itself — only when the drawer is open

## Technical notes

- 5 s → 15 s backoff matches Apollo's typical delivery window (most numbers arrive within 1–3 min) without hammering the DB.
- I'll also verify the candidates list query returns `phone` and the full `activity[]` array; if any field is currently projected away, I'll add it. (Quick check during implementation, not a separate task.)
