## Problem

The Reveal phone button exists in the candidate drawer but never appears for any candidate, so no phone numbers are ever collected.

Root cause: it's gated on `c.has_direct_phone`, which comes from Apollo's `/mixed_people/api_search` response field `phone_numbers`. That endpoint doesn't return phone data — only the `bulk_match` enrichment endpoint does, and we call it with `reveal_phone_number: false`. So `has_direct_phone` is effectively always `false`, the button never renders, and the server function also rejects the call when it would be made.

## Fix

Let the user trigger a reveal attempt for any Apollo-sourced candidate. Apollo charges a credit only when a number is actually returned, and "no phone on file" is now feedback the user can see instead of a flag we guess at upfront.

### 1. `src/lib/candidates.functions.ts` — `revealCandidatePhone`

- Drop the `has_direct_phone` precondition.
- Keep the existing checks: candidate must exist, must have `apollo_id`, and must not already have a `phone`.
- If Apollo returns no number, return `{ phone: null, alreadyRevealed: false, noNumber: true }` instead of throwing — and do NOT increment credit usage (no credit consumed on empty reveals per Apollo's billing model). Also append an activity entry "Phone reveal attempted — no number on file".
- When Apollo returns a number, behave exactly as today (save phone, append activity, increment usage by 1).

### 2. `src/components/candidates/candidate-drawer.tsx`

Replace the three-branch phone block with:

- `c.phone` present → show the number.
- `c.phone` missing AND candidate has `apollo_id` → show the Reveal button (regardless of `has_direct_phone`). Tooltip clarifies: "Uses 1 Apollo credit only if a number is found".
- `c.phone` missing AND no `apollo_id` (e.g. Internal/manual candidates) → show "No phone on file".

Update the mutation's `onSuccess` to handle the new `noNumber` case with a neutral toast ("No phone on file for this candidate") instead of a success toast.

### 3. Candidates list panel (optional polish)

If `src/components/candidates/candidates-panel.tsx` shows a phone column or icon, mirror the same treatment: surface a small "Reveal" affordance for Apollo candidates without a phone. I'll inspect the file before deciding whether to include this — happy to scope it out if you want the smallest change first.

## Out of scope

- Auto-reveal during Collect / Source more (kept opt-in to control credit spend).
- Bulk-reveal action across multiple candidates.
- PDL phone reveal (PDL requires a different enrichment call and separate credit pool).

Both can be follow-ups once this baseline works.
