# Credits & Billing — BYOK Stripe

Replace the mocked checkout with a real, persistent credits system backed by **your own Stripe account**.

## 1. Stripe setup (you do this once)

1. Create/sign in at stripe.com → grab **Secret key** (test mode is fine to start).
2. I'll request two secrets via the secrets tool: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
3. After the webhook route is deployed, you add the endpoint in Stripe Dashboard → Developers → Webhooks pointing at `https://project--5ab3d2d7-ec9c-41d4-81ad-06d14aa7d875.lovable.app/api/public/stripe/webhook`, subscribe to `checkout.session.completed` and `payment_intent.payment_failed`, then paste the signing secret.

## 2. Database (one migration)

- `profiles`: default `credits_remaining` → **50**, backfill existing users to `GREATEST(credits_remaining, 50)`, add `credits_seeded_at`.
- `credit_ledger`: extend with `type` (purchase | sourcing | phone_reveal | bonus | refund), `metadata jsonb`, `balance_after int`.
- New `credit_purchases`: `id, user_id, bundle_id, credits, amount_cents, currency, stripe_session_id unique, stripe_payment_intent, status (pending|paid|failed), created_at, paid_at`. RLS: user reads own; service_role writes. Grants per house rules.
- Update `handle_new_user()` to seed 50 credits + insert a `bonus` ledger row.
- Postgres RPCs:
  - `spend_credits(user, amount, type, metadata)` — locks profile row, checks balance, decrements, inserts ledger with `balance_after`. Returns `{ ok, balance }` or `insufficient_funds`.
  - `credit_purchase_complete(session_id)` — idempotent: marks purchase paid, increments balance, inserts `purchase` ledger row.

## 3. Server functions (`src/lib/billing/`)

- `credits.functions.ts`: `getCreditsSummary` (balance + 30-day aggregates + recent ledger), `spendCredits({ type, amount, metadata })` wrapping the RPC.
- `checkout.functions.ts`: `createCheckoutSession({ bundleId })` — server-side bundle price validation, Stripe Checkout Session (`mode: 'payment'`), insert `credit_purchases` row as `pending`, return hosted URL. Bundles: Starter $49 / Growth $129 (Most popular) / Pro $299 / Scale $699.

## 4. Stripe webhook

`src/routes/api/public/stripe/webhook.ts` — verify signature with `STRIPE_WEBHOOK_SECRET`, on `checkout.session.completed` call `credit_purchase_complete`. Handle `payment_intent.payment_failed` → mark `failed`. Idempotent on `stripe_session_id`.

## 5. Wire deductions into existing flows

- **Sourcing run** (10 credits): call `spendCredits` BEFORE the external API call; on `insufficient_funds` return structured error surfaced as a toast linking to Settings → Usage & billing. Keep `increment_sourcing_usage` for analytics.
- **Phone reveal** (1 credit): require `spendCredits` before returning phone. Skip for Applicants (have `application_id`).

## 6. Settings → Usage & billing UI

Live balance, "≈ N sourcing runs left", **Buy credits** (red <10), cost legend, 30-day stats, recent activity ledger, 4 bundle cards → real Stripe Checkout (no mock card form). `/app` handles `?checkout=success|cancelled` to refresh balance + toast.

## Out of scope

Balance outside Settings, subscriptions, auto-recharge, invoices UI, team balance.

## What I need from you to start

1. Approve this plan.
2. Be ready to paste your Stripe **Secret key** when the secrets prompt appears. Webhook secret can come after the route is live.
