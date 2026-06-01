## Goal

Replace the mocked credit system with a real, persistent credits & billing layer wired to Lovable Payments (Stripe). Credits are stored server-side per user, deducted on real sourcing/phone-reveal actions, and topped up via real Stripe Checkout.

## What we'll build

### 1. Database (one migration)

New tables + extend `profiles`:

- `profiles`: add `credits_remaining` is already there (default 0) — change default to **50** and backfill existing users to `GREATEST(credits_remaining, 50)` as the welcome bonus. Add `credits_seeded_at` timestamp so signups via the existing `handle_new_user()` trigger get 50 automatically.
- `credit_ledger` exists — extend with `type text` (`purchase | sourcing | phone_reveal | bonus | refund`), `metadata jsonb`, `balance_after int`. Keep existing `delta`, `reason`, `stripe_session_id`.
- `credit_purchases` (new): `id, user_id, bundle_id, credits, amount_cents, currency, stripe_session_id unique, stripe_payment_intent, status (pending|paid|failed), created_at, paid_at`. RLS: user reads own; service_role writes.

Grants + RLS for all new/changed tables per project conventions. Update `handle_new_user()` to seed 50 credits + write a `bonus` ledger row.

### 2. Server functions (`src/lib/billing/`)

- `credits.functions.ts`
  - `getCreditsSummary` — balance, 30-day aggregates (runs, reveals, candidates, spent), recent ledger (last 50). Powers the Usage pane.
  - `spendCredits({ type, amount, metadata })` — atomic deduction via Postgres RPC `spend_credits(user, amount, type, metadata)` that locks the profile row, checks balance, decrements, inserts ledger with `balance_after`. Returns `{ ok, balance }` or `insufficient_funds`.
- `checkout.functions.ts`
  - `createCheckoutSession({ bundleId })` — server-side: validate bundle from a server-side `BUNDLES` constant (Starter/Growth/Pro/Scale, prices from the user's spec), create Stripe Checkout Session in **payment** mode with `client_reference_id = user_id`, `metadata.bundle_id`, success/cancel URLs back to `/app` with `?checkout=success|cancelled`. Insert `credit_purchases` row with status `pending`. Returns hosted checkout URL.

### 3. Stripe webhook (`src/routes/api/public/stripe/webhook.ts`)

- Verify signature with `STRIPE_WEBHOOK_SECRET`.
- On `checkout.session.completed` (mode=payment, status=paid): look up `credit_purchases` by `stripe_session_id`; if not already `paid`, mark paid + insert ledger `purchase` row + increment `profiles.credits_remaining` in a single RPC `credit_purchase_complete(session_id)` (idempotent).
- Also handle `payment_intent.payment_failed` → mark failed.

### 4. Wire credit deduction into existing flows

- **Sourcing run**: in the sourcing collect path (Apollo/PDL collection — `src/lib/sourcing/source-more.functions.ts` + the initial collect inside `search.functions.ts`), call `spendCredits({ type: 'sourcing', amount: 10, metadata: { project_id, candidates_returned } })` BEFORE the external API call. On `insufficient_funds`, return a structured error the UI surfaces as "Out of credits — buy more". On success continue. (Replaces / supplements existing `increment_sourcing_usage` accounting — keep that table for analytics.)
- **Phone reveal**: in `src/routes/api/public/apollo/phone.ts` (or wherever phone enrich runs), require `spendCredits({ type: 'phone_reveal', amount: 1, metadata: { candidate_id } })` before returning the phone. Skip deduction if the candidate is an Applicant (has `application_id`) — applicant phones came free from the form.

### 5. Settings → Usage & billing UI

Rebuild the existing Usage section in `src/components/settings/settings-dialog.tsx`:

- **Balance card**: live `credits_remaining`, "≈ N sourcing runs left" (balance / 10), **Buy credits** button. Red tint when balance < 10.
- **Cost legend**: 1 sourcing run = 10 credits (up to 20 profiles), phone reveal = 1 credit.
- **Last 30 days**: 4 stat tiles (runs / candidates sourced / reveals / credits used) from the summary endpoint.
- **Recent activity ledger**: table of last 50 entries — date, type icon, description, ± amount, balance after.
- **Buy credits view**: 4 bundle cards (Starter $49 / Growth $129 "Most popular" / Pro $299 / Scale $699) with per-credit price + use case. Selecting → calls `createCheckoutSession` → `window.location = url` (real Stripe hosted checkout).
- **Return handler**: in `/app` route, detect `?checkout=success` → toast "Credits added" + invalidate credits query; `?checkout=cancelled` → toast "Checkout cancelled". (Webhook is the source of truth; this is just UX.)

No mock card form anymore — Stripe-hosted checkout handles the payment UI.

### 6. Out of scope (this round)

- Showing balance outside Settings (sidebar chip, run-confirm dialog, reveal-button price) — per your answer, keep it self-contained for now.
- Subscriptions / auto-recharge / refunds UI / invoices download.
- Team-level shared balance.

## User actions required

1. **Enable Lovable Payments (Stripe)** — I'll trigger the eligibility check + enable tool as the first step of build mode. This creates a test environment immediately; live needs account claim later.
2. **Configure the webhook endpoint** — after enable, paste `https://findable.work/api/public/stripe/webhook` into Stripe; I'll request `STRIPE_WEBHOOK_SECRET` via `add_secret`.
3. Run the migration (auto-prompted).

## Technical notes

- All Stripe calls go through TanStack `createServerFn` + the public webhook route — no Edge Functions.
- `spend_credits` and `credit_purchase_complete` are Postgres functions (SECURITY DEFINER, search_path=public) so deductions and top-ups are atomic and immune to race conditions.
- Ledger always records `balance_after` for auditability — no recomputation from deltas.
- New-user seed: `handle_new_user()` writes `+50` ledger row with `type='bonus'` and sets `credits_remaining=50`. Existing users get the bonus once via the migration backfill.
- Bundle prices live in **one** server-side const (`src/lib/billing/bundles.ts`); the client fetches the list via a server fn so prices can't be tampered with from the browser.
