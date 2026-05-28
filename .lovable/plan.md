# Reveal phone numbers — credit-safe design

The user asked for two things that combine naturally: turn on Apollo's `reveal_phone_number` AND give the user a toggle. Doing it on every bulk enrichment would burn export credits for every sourced candidate (even ones nobody contacts). Instead, we'll reveal **on demand, per candidate**, and surface a badge so the user knows ahead of time whether a phone exists.

## What the user will see

1. **Badge on candidate cards & drawer**: a small "📞 Direct phone" pill whenever `has_direct_phone` is true (already collected from both Apollo and PDL — just not displayed).
2. **Candidate drawer**:
   - If `phone` is already populated (PDL path) → show it as today.
   - If empty but `has_direct_phone` is true → show a **"Reveal phone (1 credit)"** button. Clicking it calls Apollo with `reveal_phone_number: true` for that single ID, stores the number on the candidate row, and re-renders.
   - If `has_direct_phone` is false → show muted "No direct phone available".

## Changes

### Backend
- `src/lib/sourcing/apollo.server.ts`
  - Add `revealApolloPhone(apolloId)`: calls `/people/bulk_match` for one ID with `reveal_phone_number: true`, returns the sanitized number.
  - Leave the bulk `enrichApolloProfiles` call as-is (`reveal_phone_number: false`) so initial sourcing stays credit-cheap.
- New server fn `src/lib/candidates.functions.ts` → `revealCandidatePhone({ candidateId })`:
  - `requireSupabaseAuth`, load candidate by id (RLS-scoped), require `apollo_id`.
  - Call `revealApolloPhone`, update `candidates.phone`, append an `activity` entry (`"Phone revealed"`), return the new phone.
  - Increments `sourcing_credits_usage` by 1 via existing `increment_sourcing_usage` RPC so users see the cost.

### Frontend
- `src/components/candidates/candidate-drawer.tsx`
  - Add `has_direct_phone` to the candidate type (read from `match_breakdown` or a new column? See data shape note below).
  - Replace the static `KV label="Phone"` block with a `<PhoneRow />` that handles the three states above. Uses `useMutation` → `revealCandidatePhone`, toasts on success/error, optimistically updates the row.
- `src/components/candidates/candidates-panel.tsx`
  - Render the "📞" pill next to candidate name when `has_direct_phone` is true.

### Data shape
`has_direct_phone` is currently only on preview rows (`sourcing_preview_candidates.preview` jsonb) and isn't persisted on `candidates`. We need it on the candidate to drive the badge/button after promotion.

- Add a nullable `boolean` column `candidates.has_direct_phone` (default `false`).
- Update the promotion path in `src/lib/sourcing/agent.server.ts` (around line 326/382) to write `has_direct_phone` from both Apollo (`p.phone_numbers?.length > 0`) and PDL.
- Update `src/lib/sourcing/search.functions.ts` line ~208 similarly.

## Out of scope
- No bulk "reveal all phones" button (intentional — too easy to burn credits accidentally).
- No phone-reveal during the initial sourcing pass.
- No changes to PDL (already returns numbers without extra credits).

## Cost note for the user
Apollo charges export credits per phone reveal. With this design, credits are only spent when the recruiter explicitly clicks "Reveal phone" on a candidate they actually plan to contact.
