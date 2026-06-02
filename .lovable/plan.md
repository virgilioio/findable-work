## What I already verified (no changes needed)

- Webhook route `/api/public/apollo/phone` is **deployed and live** on production. POSTing without a token returns `401 Unauthorized` (correct — signature check works).
- Both `APOLLO_WEBHOOK_URL` and `APOLLO_WEBHOOK_SECRET` secrets are set.
- Code path is wired: `Reveal phone` button → `revealCandidatePhone` server fn → `requestApolloPhoneReveal()` → Apollo `/people/bulk_match` with `reveal_phone_number: true` + `webhook_url` → Apollo POSTs result async to our webhook → handler writes `phone` into `candidates.phone` and logs `phone_revealed` in activity.

## The one likely silent failure

`findable-work.lovable.app/api/public/apollo/phone` returns **HTTP 307 redirect** to `findable.work/...`. Apollo's webhook delivery typically does **NOT follow redirects on POST** — the body is dropped and we never receive the number.

If `APOLLO_WEBHOOK_URL` is set to the `lovable.app` host, **that's why phones never arrive**. It must be the custom-domain URL directly: `https://findable.work/api/public/apollo/phone?token=<APOLLO_WEBHOOK_SECRET>`.

## Plan

### 1. Verify the webhook URL secret (1 min, user action)
Open Lovable Cloud → Secrets → `APOLLO_WEBHOOK_URL`. Confirm it is exactly:
```
https://findable.work/api/public/apollo/phone?token=<APOLLO_WEBHOOK_SECRET-value>
```
Not `findable-work.lovable.app`, not missing `?token=`. If wrong, update it.

### 2. Add an admin diagnostic page (`/admin/phone-reveals`)

New server function `getPhoneRevealStats` (admin-only, uses `has_role('admin')`) returns, across the caller's own data:

- Total candidates with `has_direct_phone = true`
- How many of those have `phone` populated (success rate)
- Count of candidates with a `phone_reveal_pending` activity entry but no `phone` yet, broken down by age (<5 min, 5–15 min, 15–60 min, >1 h, >24 h)
- Last 20 reveal events (pending / revealed / attempted-no-number) with candidate name and timestamp

New route `src/routes/_authenticated/admin/phone-reveals.tsx` renders a simple table. This lets you confirm at a glance whether Apollo is actually delivering numbers, or whether they're all stuck "pending forever" (= URL mis-configured).

### 3. Make the candidate drawer state explicit

Update `candidate-drawer.tsx` so the phone row clearly shows:
- `Pending — requested 7 min ago` (instead of just "Reveal phone" being disabled)
- `No number on file` when Apollo returned empty
- `Stuck? Reveal again` button after 30 min with no reply

### 4. Add a "ping webhook" button on the admin page

Sends a fake payload to our own webhook with the secret, asserts a 200, and confirms the handler is reachable from the public internet (catches DNS / Cloudflare / route regressions in one click).

## Out of scope (not changing)

- No auto-reveal during sourcing (per your answer).
- No switch to PDL for phones (per your answer).
- No changes to credit cost or Apollo request shape.

## Files touched

- `src/lib/candidates.functions.ts` — add `getPhoneRevealStats` + `pingApolloWebhook` server fns (admin-guarded).
- `src/routes/_authenticated/admin/phone-reveals.tsx` — new diagnostic page.
- `src/components/candidates/candidate-drawer.tsx` — clearer pending / no-number / retry states.

After step 1 + step 2, you'll know within minutes whether the flow is healthy or whether Apollo is silently dropping our webhook deliveries.