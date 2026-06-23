## The gap, cross-checked against Gio ATS

I compared our Apollo phone reveal flow with Gio ATS's working implementation. **Same endpoint, same params — but Gio reads the synchronous response and we throw it away.**

### Gio's flow (works):

`supabase/functions/enrich-apollo-profile/index.ts:366-413`
- Calls `POST /api/v1/people/bulk_match` with `{ details: [{id}], reveal_phone_number: true, webhook_url }`
- **Awaits `apolloData = await apolloResponse.json()`**
- **Reads `person.phone_numbers[0].sanitized_number` synchronously from the response** (line 412)
- Saves the phone right then to the candidate row
- The webhook is just a backup that fills in late-arriving numbers (`apollo-phone-webhook/index.ts:53-70` — same extraction logic, only updates if `!candidate.phone`)

### Our flow (broken):

`src/lib/sourcing/apollo.server.ts:350-365`
- Same exact request payload ✅
- **`await apolloFetch(...)` — return value never captured** ❌
- Returns `{ queued: true }` unconditionally
- All hope pinned on a webhook that often never comes
- 5 credits charged before the call, regardless of outcome

That's it. The "Pending forever" symptom on Daniela De Regil is because Apollo handed us her phone (or "no phone") inside the `bulk_match` response we discarded, and the async webhook either silently didn't fire or fired with an empty payload our handler treated correctly but with no signal back to the UI.

## Fix — mirror Gio's pattern, scoped to our codebase

Three files change. No new schema, no new tables, no new server function.

### 1. `src/lib/sourcing/apollo.server.ts` — capture and use the response

Change `requestApolloPhoneReveal` to:
- Keep the response: `const json = await apolloFetch("/people/bulk_match", { details: [{ id: apolloId }], reveal_phone_number: true, webhook_url: webhookUrl })`
- Read `const person = json?.matches?.[0]`
- Extract phone the same way Gio does: `person?.phone_numbers?.[0]?.sanitized_number ?? person?.phone_numbers?.[0]?.raw_number ?? null`
- Inspect `json?.waterfall?.status` for failure cases (`"failed"` → wrong plan / not matched)
- Log the response (`console.log("[apollo phone reveal]", { apolloId, waterfall: json?.waterfall, hasMatch: !!person, hasPhone: !!phone })`) so the admin diagnostics page becomes useful
- Return a richer outcome:
  ```ts
  type RevealOutcome =
    | { ok: true; phone: string; person: ApolloPerson } // sync hit — done
    | { ok: true; phone: null; queued: true }           // accepted, awaiting webhook
    | { ok: false; reason: "not_matched" | "waterfall_failed" | "no_permission"; message: string };
  ```

### 2. `src/lib/candidates.functions.ts` `revealCandidatePhone` — act on the outcome

Currently lines 194-254. Restructure:
- **Move credit charge to AFTER** the Apollo call returns successfully. (Today it's lines 221-237, before the call — burns credits on rejection.)
- Call `requestApolloPhoneReveal` first.
- Switch on the outcome:
  - **`ok: true` + phone present (sync hit)**: charge credits, write `phone_revealed` activity, save phone, return `{ status: "revealed", phone }`. **This is the common case Gio handles and we miss.**
  - **`ok: true` + queued (no sync phone, awaiting webhook)**: charge credits, write `phone_reveal_pending`, return `{ status: "pending" }` (existing behavior).
  - **`ok: false`**: do **not** charge credits. Write a truthful `phone_reveal_attempted` entry with text reflecting the reason ("No mobile available from Apollo" / "Phone reveal not enabled on this Apollo plan"). Return `{ status: "no_number" | "failed", reason, message }`.
- Existing idempotency guard (lines 211-216) stays.

### 3. `src/components/candidates/candidate-drawer.tsx` — surface the new outcomes

Tiny addition to the existing `revealMut.onSuccess` toast switch (around lines 282-298):
- `status === "revealed"` → success toast "Phone number revealed" (the drawer's polling already handles the row update; this just confirms instantly).
- `status === "no_number"` → toast "No mobile on file (Apollo)" and the UI flips to the existing "No mobile on file" KV immediately because `phone_reveal_attempted` was written server-side.
- `status === "failed"` with `reason === "no_permission"` → error toast "Phone reveal not enabled on the Apollo plan — contact admin."

The drawer's polling effect and the webhook handler at `routes/api/public/apollo/phone.ts` stay completely unchanged — they remain the safety net for the genuinely-queued case.

## What we do NOT change

- The endpoint (`bulk_match`) and params (`reveal_phone_number: true`, `webhook_url`) are already correct — Gio uses the exact same call.
- No switch to `run_waterfall_phone` (Gio doesn't use it and their flow works; one less variable to introduce).
- No schema / table changes.
- No changes to billing logic beyond the order-of-operations fix (charge after Apollo accepts).
- No changes to the webhook handler, the admin diagnostics page, or the drawer's polling loop.

## Why this fixes Daniela's case

Either:
- Apollo returned her phone in the sync response — we'll now save it instantly and the drawer will show it on the next render. No more "Pending" at all.
- Apollo returned `waterfall.status: "failed"` or matched-with-no-phone — we'll now write `phone_reveal_attempted`, refund the credit, and the drawer immediately shows "No mobile on file (Apollo)" with a "Try again" button.

Either way, the user gets a definitive answer in seconds instead of staring at "Pending" indefinitely.
