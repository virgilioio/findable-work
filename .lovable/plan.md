
## Problem

Apollo's `bulk_match` (and `match`) endpoint requires a `webhook_url` whenever `reveal_phone_number: true`. Per Apollo's docs you just shared:

> "If this parameter is set to `true`, you must enter a webhook URL for the `webhook_url` parameter. Apollo will **asynchronously** verify phone numbers for you, then send a JSON response that includes only details about the person's phone numbers to the webhook URL… It can take several minutes for the phone numbers to be delivered."

Our `revealApolloPhone` calls Apollo with `reveal_phone_number: true` and no `webhook_url`, so Apollo rejects with HTTP 400 ("Please add a valid 'webhook_url' parameter"). And even if accepted, the phone never comes back synchronously — it's pushed to our webhook later.

## Fix

Implement Apollo's async phone-reveal pattern end-to-end.

### 1. New public webhook route — `src/routes/api/public/apollo/phone.ts`

- `POST` handler accepting Apollo's phone-reveal callback.
- **Security**: require a shared secret as a query param (`?token=...`) matched against `APOLLO_WEBHOOK_SECRET`. Apollo doesn't sign callbacks, so a secret token in the URL is the standard approach. Reject with 401 on mismatch.
- Validate body with Zod. Apollo's payload (per docs) contains the person `id` plus a `phone_numbers[]` array of `{ sanitized_number, raw_number, type, status, ... }`.
- Use `supabaseAdmin` to:
  - Look up the candidate by `apollo_id`.
  - If a phone is present and the candidate has no phone yet: set `phone` to the best available number (prefer `type === "mobile"`, fallback to first), append a `phone_revealed` activity entry, and call `increment_sourcing_usage` for the owning `user_id` (+1 credit).
  - If no phone in payload: append a `phone_reveal_attempted` activity entry ("no number on file"). No credit increment.
  - Idempotent: if `phone` is already set, just 200 and skip (Apollo may retry).
- Always return 200 on auth-valid requests so Apollo doesn't retry forever.

### 2. `src/lib/sourcing/apollo.server.ts` — rework `revealApolloPhone`

- Rename to `requestApolloPhoneReveal(apolloId: string): Promise<{ queued: boolean }>`.
- Build webhook URL from `process.env.APOLLO_WEBHOOK_URL` (full URL including the `?token=` secret).
- Call `bulk_match` with `details: [{ id }]`, `reveal_phone_number: true`, `webhook_url`.
- Throw a clear error if `APOLLO_WEBHOOK_URL` is missing.
- Return `{ queued: true }` — do not attempt to read phone from the synchronous response.

### 3. `src/lib/candidates.functions.ts` — `revealCandidatePhone`

- Preconditions unchanged: candidate exists, has `apollo_id`, no `phone` yet.
- Idempotency: skip if `activity` already has a `phone_reveal_pending` entry within the last 10 minutes (avoid double-queue on rapid clicks).
- Call `requestApolloPhoneReveal(apollo_id)`.
- Append a `phone_reveal_pending` activity entry ("Phone reveal requested — Apollo delivers within a few minutes").
- Return `{ status: "pending" }`. No credit increment here.

### 4. `src/components/candidates/candidate-drawer.tsx`

- Update mutation `onSuccess` to handle `status: "pending"` with a toast: *"Phone reveal requested. Apollo usually returns a result within a few minutes — the profile will update automatically."*
- If candidate has a recent `phone_reveal_pending` activity entry and still no `phone`, show "Reveal pending…" disabled state instead of the Reveal button.
- React Query already refetches candidates, so once the webhook lands and the row is updated, the drawer will show the new phone on next refetch. (Realtime push is a follow-up if needed.)

### 5. Secrets needed

Two new secrets via `add_secret`:
- `APOLLO_WEBHOOK_SECRET` — random token validated by the route handler.
- `APOLLO_WEBHOOK_URL` — the full URL Apollo will POST to, including `?token=<secret>`.

I'll request both together and tell you exactly what URL to put in `APOLLO_WEBHOOK_URL`.

## Out of scope

- Realtime push to the open drawer (React Query refetch is sufficient for v1).
- Waterfall (`run_waterfall_phone`) — different credit model and webhook payload; can be a follow-up.
- PDL phone reveal.
- Bulk reveal.

## Two decisions before I build

1. **Webhook host** — OK to use the stable production URL `https://findable-work.lovable.app/api/public/apollo/phone?token=...` so dev and prod both hit the same endpoint? Or do you want a separate preview URL so testing in preview doesn't write to prod data? (Note: both deployments share the same Supabase DB, so realistically prod URL is fine.)
2. **Native vs Waterfall** — Start with native `reveal_phone_number` only (cheaper, mobile-focused, what the original button implied), and add `run_waterfall_phone` as a separate "deep search" action later? Or go straight to waterfall for max coverage?
