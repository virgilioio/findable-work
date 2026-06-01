## Diagnosis — two separate problems

**1. The AI agent's sourcing path never charges credits.**

There are two code paths that run an Apollo + PDL search:

- `runSourcingSearch` in `src/lib/sourcing/search.functions.ts` — called from the standalone sourcing UI. **Correctly** calls `spendCreditsAdmin({ amount: SOURCING_RUN_COST, type: "sourcing_run" })` before searching, and returns `insufficient_credits` if the balance is too low.
- The AI agent flow in `src/lib/sourcing/agent.server.ts` (line ~298: `searchApolloWithFallback(criteria) + searchPdl(criteria)`) — runs the same paid Apollo/PDL searches but **never calls `spendCreditsAdmin`**. This is the path that fired when you chatted with the AI and got candidates back without your credit balance moving.

**2. The credits migration was never applied to the live database.**

The 2026-06-01 migration `20260601210000_credits_billing.sql` defines:
- `public.spend_credits(...)` RPC (the function `spendCreditsAdmin` calls)
- New columns on `credit_ledger`: `type`, `metadata`, `balance_after`
- `credit_purchases` table, `credit_purchase_complete` RPC, profile credit-seed defaults

But the live schema shows `credit_ledger` with only `id, created_at, stripe_session_id, reason, delta, user_id` — no `type`, no `metadata`, no `balance_after`, no `spend_credits` function, no `credit_purchases` table. Same pattern as the `profiles` columns issue we just fixed: the file exists in `supabase/migrations/` but never ran against this database.

This means that even on the `runSourcingSearch` path that *does* try to charge, the RPC call would fail. Either it's silently being swallowed somewhere, or you've only been hitting the cache path (`from_cache: true` skips the charge entirely) and the AI agent path (no charge at all).

## Fix — two parts, in this order

### Part 1: re-run the credits migration manually

Same approach as the `profiles` resync we just did. I'll prepare an idempotent SQL script that mirrors `20260601210000_credits_billing.sql` for you to paste into the SQL editor:

- `ALTER TABLE public.credit_ledger ADD COLUMN IF NOT EXISTS type / metadata / balance_after`
- `CREATE TABLE IF NOT EXISTS public.credit_purchases (...)` + grants + RLS + select policy
- `CREATE OR REPLACE FUNCTION public.spend_credits(...)` + revoke public + grant execute to `service_role`
- `CREATE OR REPLACE FUNCTION public.credit_purchase_complete(...)` + same grants
- `CREATE OR REPLACE FUNCTION public.handle_new_user()` updated to seed 50 credits + welcome-bonus ledger row
- Profile default `credits_remaining = 50` + backfill untouched rows
- `NOTIFY pgrst, 'reload schema'`

I'll also check whether `20260601220000_subscriptions.sql` and `20260603000000_profiles_personalization.sql` need the same re-run treatment — if so, I'll bundle them into one script you can paste once.

### Part 2: charge credits in the AI agent path

In `src/lib/sourcing/agent.server.ts`, before the `Promise.allSettled([searchApolloWithFallback(...), searchPdl(...)])` call:

1. Call `spendCreditsAdmin({ userId, amount: SOURCING_RUN_COST, type: "sourcing_run", reason: "Sourcing run (agent)", metadata: { project_id, conversation_id } })`.
2. If `spend.ok === false` (insufficient credits):
   - Mark the `tSearch` agent task as `failed` with a clear message ("Not enough credits — 10 required, X available").
   - Emit a structured signal to the conversation so the chat UI shows the same out-of-credits state the standalone sourcing UI shows.
   - Skip the Apollo/PDL calls entirely and return early — never charge the external APIs without charging the user.
3. If `spend.ok === true`, proceed with the existing flow.

Order matters: charge first, then call the paid external APIs (same pattern `runSourcingSearch` uses).

### Out of scope for this turn

- Refactoring the two duplicate Apollo+PDL search paths into one shared helper (worth doing later, but a bigger change than this fix needs).
- Adding a credits-precheck UI affordance in the chat composer (separate UX task).

## Verification

After you run the SQL and I ship the code change:

1. Note your current credit balance in Settings → Plan & credits.
2. Start a fresh AI sourcing chat ("Find 5 Series-A backend engineers in Berlin") in a conversation that hasn't searched before.
3. Confirm balance drops by 10 and a new "Sourcing run (agent)" row appears in the credit ledger.
4. Drain your balance below 10 and retry — confirm the chat surfaces an out-of-credits message and that Apollo/PDL aren't hit (no new `last_searched_at` on the project, no new previews).
5. Sanity-check the standalone sourcing UI still charges exactly once per fresh run and still serves cached runs free within the 24h window.
