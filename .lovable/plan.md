## Goal

Add monthly subscriptions (4 tiers, same prices) that **reset** credits each renewal to the plan amount. Keep one-time top-up bundles as a mid-month boost. Use real Stripe Product/Price IDs so the Stripe Billing Portal, proration, and coupons all work.

## Tier matrix (same prices, two SKUs each)


| Tier    | Monthly subscription  | One-time top-up  |
| ------- | --------------------- | ---------------- |
| Starter | $49 / mo → 500 cr     | $49 → 500 cr     |
| Growth  | $129 / mo → 1,500 cr  | $129 → 1,500 cr  |
| Pro     | $299 / mo → 4,000 cr  | $299 → 4,000 cr  |
| Scale   | $699 / mo → 10,000 cr | $699 → 10,000 cr |


(Top-up keys stay current; we just add a recurring counterpart per tier.)

## What you do in Stripe (once, both live + test)

For each tier in **Stripe Dashboard → Catalog → Products**:

1. **Create one Product** per tier (e.g. "Findable Growth"). In `metadata` add:
  - `credits` = 500 / 1500 / 4000 / 10000
  - `tier_key` = `starter` / `growth` / `pro` / `scale`
2. Add **two Prices** to the same Product:
  - Recurring, monthly, $X (currency USD). Copy `price_id` → "monthly".
  - One-time, $X. Copy `price_id` → "topup".
3. Repeat in **test mode** for the Lovable preview Stripe environment.

You'll paste 16 Price IDs total (4 tiers × 2 prices × 2 environments) into 16 secrets (see "Secrets" below). Or — if that's tedious — I can ship a one-shot `bun run scripts/seed-stripe.ts` that uses your `STRIPE_SECRET_KEY` to create products+prices and prints the IDs to copy.

## Database changes (one migration)

```sql
-- 1. Track active subscription per user
create table public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id        text not null,
  stripe_subscription_id    text not null unique,
  tier_key        text not null,                -- starter|growth|pro|scale
  monthly_credits int  not null,
  status          text not null,                -- active|past_due|canceled|...
  current_period_start timestamptz not null,
  current_period_end   timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
create policy "users read own subscription"
  on public.subscriptions for select to authenticated
  using (auth.uid() = user_id);

-- 2. Cache Stripe customer id on profiles
alter table public.profiles add column stripe_customer_id text;

-- 3. RPC: refill credits on renewal (RESET semantics, idempotent per invoice)
create or replace function public.credits_refill_for_renewal(
  _user_id uuid,
  _credits int,
  _stripe_invoice_id text,
  _stripe_subscription_id text,
  _period_end timestamptz
) returns int language plpgsql security definer set search_path=public as $$
declare _balance int;
begin
  -- idempotency guard: skip if we already logged this invoice
  if exists (
    select 1 from public.credit_ledger
    where metadata->>'stripe_invoice_id' = _stripe_invoice_id
      and type = 'subscription_renewal'
  ) then
    select credits_remaining into _balance from public.profiles where id=_user_id;
    return _balance;
  end if;

  update public.profiles
     set credits_remaining = _credits           -- RESET, not add
   where id = _user_id
   returning credits_remaining into _balance;

  insert into public.credit_ledger(user_id, delta, reason, type, balance_after, metadata)
  values (
    _user_id, _credits, 'Monthly plan refill', 'subscription_renewal', _balance,
    jsonb_build_object(
      'stripe_invoice_id', _stripe_invoice_id,
      'stripe_subscription_id', _stripe_subscription_id,
      'period_end', _period_end
    )
  );
  return _balance;
end$$;
grant execute on function public.credits_refill_for_renewal(uuid,int,text,text,timestamptz) to service_role;
```

Existing `spend_credits` and `credit_purchase_complete` stay as-is.

## Code changes

### `src/lib/billing/bundles.ts`

Add `PlanTier` (subscription) alongside `CreditBundle` (top-up). Each tier exposes both a monthly and a one-time `priceId` keyed by environment (read from env at call time, not module scope).

### `src/lib/billing/checkout.functions.ts` — extend

- `createCheckoutSession({ kind: "topup" | "subscription", tierKey })`.
- For `subscription`: `mode: "subscription"`, `line_items: [{ price: monthlyPriceId, quantity: 1 }]`, set `customer` (create-if-missing using cached `stripe_customer_id`), set `subscription_data.metadata.{user_id, tier_key, credits}`.
- For `topup`: same as today but using stored one-time `priceId` instead of `price_data` (cleaner reporting).

### New `src/lib/billing/portal.functions.ts`

`openBillingPortal()` → `stripe.billingPortal.sessions.create({ customer, return_url })`. UI button: "Manage subscription".

### `src/routes/api/public/stripe/webhook.ts` — handle subscription events

Add cases (all idempotent):

- `checkout.session.completed` — if `mode === "subscription"`, upsert `subscriptions` row, persist `stripe_customer_id` on profile. Top-up path stays unchanged.
- `invoice.paid` (with `billing_reason in ('subscription_create','subscription_cycle')`) — call `credits_refill_for_renewal` using `invoice.id` + `invoice.lines[0].period.end` + `metadata.credits`.
- `customer.subscription.updated` — update tier_key/monthly_credits/status/period/cancel_at_period_end (handles upgrades, downgrades, cancellations scheduled at period end).
- `customer.subscription.deleted` — mark `status='canceled'`. Do NOT zero credits; user keeps what they've got until they spend it.
- Keep `payment_intent.payment_failed` for top-ups.

### `src/components/settings/settings-dialog.tsx` — Billing pane redesign

- Top section: **Current plan** card (tier name, monthly credits, renews on, "Manage subscription" → portal, or "Choose a plan" if none).
- Middle: **Plans** grid (4 tier cards with "Subscribe" / "Current plan" / "Switch" CTA).
- Bottom: **One-time top-up** (collapsed by default) — your existing bundle grid, labelled "Need more this month?".
- Same iframe-busting redirect (`window.top.location.href` with `window.open` fallback) for both checkout flows.

### `src/routes/_authenticated/app.tsx`

Already handles `?checkout=success`. Add invalidation of a new `["subscription"]` query alongside `["credits-summary"]`.

## Secrets to add (after you create the prices)

```
STRIPE_PRICE_STARTER_MONTHLY        STRIPE_PRICE_STARTER_MONTHLY_TEST
STRIPE_PRICE_GROWTH_MONTHLY         STRIPE_PRICE_GROWTH_MONTHLY_TEST
STRIPE_PRICE_PRO_MONTHLY            STRIPE_PRICE_PRO_MONTHLY_TEST
STRIPE_PRICE_SCALE_MONTHLY          STRIPE_PRICE_SCALE_MONTHLY_TEST
STRIPE_PRICE_STARTER_TOPUP          STRIPE_PRICE_STARTER_TOPUP_TEST
STRIPE_PRICE_GROWTH_TOPUP           STRIPE_PRICE_GROWTH_TOPUP_TEST
STRIPE_PRICE_PRO_TOPUP              STRIPE_PRICE_PRO_TOPUP_TEST
STRIPE_PRICE_SCALE_TOPUP            STRIPE_PRICE_SCALE_TOPUP_TEST
```

(Or just the 8 live ones if you decide preview should also hit live mode — your call. Recommended split: preview = test mode, prod = live mode, which also means we should add `STRIPE_SECRET_KEY_TEST` and pick per environment.)

I'll request these via the secrets tool once products exist.

## Stripe Dashboard: also enable Customer Portal

In **Settings → Billing → Customer portal**, enable: cancel subscription, switch plan (allow all 4 prices), update payment method, view invoices. Without this, the portal session call errors with "no customer portal configured".

## Edge cases handled

- **Top-up while subscribed**: just adds credits (existing flow). No conflict.
- **Plan switch mid-cycle**: Stripe prorates the amount; we read `customer.subscription.updated` and update `tier_key` + `monthly_credits` immediately. Credits balance is NOT touched until the next `invoice.paid` (so the user doesn't get more credits by upgrading repeatedly).
- **Failed renewal**: status flips to `past_due`; user keeps current balance. No refill until they fix payment and Stripe sends `invoice.paid`.
- **Idempotent renewals**: ledger insert is guarded on `stripe_invoice_id`, so webhook replays can't double-credit.
- **No carryover by design**: the RPC sets `credits_remaining = _credits`, not `+=`.

## Order of operations after approval

1. Apply migration (subscriptions table, `credits_refill_for_renewal`, profile column).
2. You create Products+Prices in Stripe (live + test).
3. I request the price-ID secrets via the secrets tool; you paste them.
4. I implement `bundles.ts` changes + checkout/portal/webhook code + Billing UI redesign.
5. Smoke test: subscribe to Starter on preview (test mode) → balance shows 500 → run a search (10 credits) → "advance clock" via Stripe test clock → balance resets to 500. Then a top-up: balance goes from e.g. 490 to 990.