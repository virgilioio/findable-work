## Goal

Move credit billing from "flat 10 credits per sourcing run" to **1 credit per candidate actually added** (free for internal/cached reuse), keep **5 credits per phone reveal** unchanged, and update the Settings → Usage & Billing legends so the math reflects the new model.

## Current behavior (bug)

- `SOURCING_RUN_COST = 10` is debited **upfront**, once per run, regardless of how many candidates come back. Phone reveal already correctly charges 5 per reveal via `spendCreditsAdmin` in `candidates.functions.ts`.
- Source-more path never spends credits at all (it only increments `sourcing_credits_usage`, not the real ledger).
- Bundle taglines say "~50 / ~150 / ~400 / ~1000 sourcing runs" computed as `credits / 10`. With the new model, 500 credits should correspond to ~25 runs (1 initial 20 + N×10 source-more), not 50.

## Target model

- **Initial sourcing run** = up to 20 new candidates → up to 20 credits.
- **Source again** = up to 10 new candidates → up to 10 credits.
- **Phone reveal** = 5 credits each (unchanged).
- Internal reuse (clone existing candidate row across conversations) stays **free**.
- Cached run hits (within 24h) stay **free**.
- Charging is **per candidate actually inserted** (not per row attempted), debited right after each successful insert.
- If balance hits 0 mid-run, stop inserting further fresh candidates, surface a partial-success state with `credits_exhausted: true` so the UI/chat can tell the user.

## Backend changes

### 1. `src/lib/billing/bundles.ts`
- Add `CANDIDATE_ADD_COST = 1`.
- Keep `PHONE_REVEAL_COST = 5`.
- Deprecate `SOURCING_RUN_COST` (keep export = 1 for backwards-compat references, but stop using it for the run gate).
- Rewrite taglines using the new math: `initial 20 + remaining/10 source-mores`. For 500 credits → "~1 initial run + ~48 source-mores (≈500 candidates)". Final copy in implementation step — short and honest, e.g.:
  - Starter 500 → "≈500 candidates · ~49 source-mores"
  - Growth 1,500 → "≈1,500 candidates · ~149 source-mores"
  - Pro 4,000 → "≈4,000 candidates"
  - Scale 10,000 → "≈10,000 candidates"

### 2. `src/lib/sourcing/search.functions.ts` (initial run)
- Remove the upfront `spendCreditsAdmin({ amount: SOURCING_RUN_COST })` block.
- Keep a **balance pre-check** (read `profiles.credits_remaining`); if `balance < 1`, short-circuit with the existing `insufficient_credits` shape so the UI behavior is unchanged.
- After each successful candidate `INSERT INTO candidates` for fresh Apollo/PDL rows, call `spendCreditsAdmin({ amount: 1, type: "candidate_add", reason: "Candidate sourced", metadata: { project_id, source: "apollo"|"pdl", candidate_id } })`.
- Track `creditsSpent` and `creditsExhausted` and return them in the response so the chat/UI can surface "added 14 of 20 — out of credits".

### 3. `src/lib/sourcing/agent.server.ts` (chat-agent run)
- Same change as `search.functions.ts`: drop the upfront `SOURCING_RUN_COST` debit, replace with balance pre-check + per-insert `candidate_add` debit.
- Update the structured `insufficient_credits` payload returned to the agent to use `credits_required: 1` (or surface `creditsSpent` + `creditsExhausted` for partial runs).

### 4. `src/lib/sourcing/source-more.functions.ts`
- Add the same balance pre-check + per-insert `candidate_add` debit for both Apollo-fresh and PDL-fresh branches.
- Internal reuse (`cloneInternal`) stays free.
- Keep the existing `increment_sourcing_usage` call for the analytics counter, but it's no longer the source of truth for billing.

### 5. `src/routes/api/chat.ts`
- Update the `insufficient_credits` tool-result message wording from "Each sourcing run costs N credits" to "Each candidate costs 1 credit, phone reveals cost 5".

### 6. `src/lib/billing/credits.functions.ts` (`getCreditsSummary`)
- Count `candidate_add` ledger rows in 30d stats: return `candidatesAdded30d` alongside the existing `sourcingRuns30d` (which we'll keep counting from `sourcing_run` rows for backwards-compat with historical data).
- Add `candidateAddCost: 1` to the returned shape.

## Frontend changes

### 7. `src/components/settings/settings-dialog.tsx` (Usage & billing)
- Hero strip: replace "{sourcingRunCost} credits / sourcing run" with two lines:
  - "1 credit / candidate sourced"
  - "{phoneRevealCost} credits / phone reveal"
- 30-day stats sub-line: "{stats30d.candidatesAdded} candidates · {stats30d.phoneReveals} reveals" (drop the misleading "runs" count, or keep it as a small secondary).
- Plan + top-up cards: render the new taglines from `bundles[i].tagline`.
- "Low balance" threshold: change from `balance < sourcingRunCost` to `balance < 20` (one initial run's worth).

### 8. Any other UI mention of "10 credits per run"
- Quick grep for "sourcing run" / "10 credits" copy in onboarding, empty states, and tooltips, and align wording with "1 credit per candidate · 5 per phone reveal".

## Database / SQL (you run manually)

A single idempotent migration script. Schema-only: no changes to existing functions; we just need a new ledger `type` value to be acceptable (already free-text `text`, so no schema change required) and ideally an index for the new query. Final SQL we'll generate, but the gist:

```sql
-- Optional: helpful index for stats queries on candidate_add rows
CREATE INDEX IF NOT EXISTS credit_ledger_user_type_created_idx
  ON public.credit_ledger (user_id, type, created_at DESC);

NOTIFY pgrst, 'reload schema';
```

No data backfill — historical `sourcing_run` ledger rows stay as-is.

## Verification

1. Fresh account with 50 seed credits → run a sourcing search from the chat → confirm `credit_ledger` shows N `candidate_add` rows (one per inserted candidate), balance drops by N.
2. Run "Source again" → confirm up to 10 more `candidate_add` rows added.
3. Drain balance to 3 → run a fresh search → confirm exactly 3 candidates get inserted and response signals `credits_exhausted: true`.
4. Reveal a phone → confirm 5-credit `phone_reveal` row appears, balance drops by 5.
5. Run the same search again within 24h → confirm cache hit, zero new ledger rows.
6. Settings → Usage & billing: hero shows "1 / candidate · 5 / phone reveal", taglines match new math, 30d stats show candidates+reveals.

## Out of scope

- Refunds/reversals for historical `sourcing_run` debits.
- Refactoring the duplicated Apollo+PDL insert logic across `search.functions.ts`, `agent.server.ts`, and `source-more.functions.ts` into one shared helper (worth doing later given we're touching all three).
- Changing the Stripe bundle prices or `monthly_credits` values.
