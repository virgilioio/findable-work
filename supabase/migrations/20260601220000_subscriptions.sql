-- Monthly subscriptions: track active plan per user, cache Stripe customer,
-- and add an idempotent RPC that RESETS credits on each renewal invoice.

-- 1) Cache Stripe customer id on profiles so we can reuse it for
--    subscription checkout, top-up checkout, and the billing portal.
alter table public.profiles
  add column if not exists stripe_customer_id text;

-- 2) One active subscription row per user (we upsert on stripe_subscription_id).
create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null,
  stripe_customer_id       text not null,
  stripe_subscription_id   text not null unique,
  tier_key                 text not null,
  monthly_credits          integer not null,
  status                   text not null,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists subscriptions_user_idx
  on public.subscriptions (user_id, created_at desc);
create index if not exists subscriptions_customer_idx
  on public.subscriptions (stripe_customer_id);

grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

alter table public.subscriptions enable row level security;

drop policy if exists "Users view own subscription" on public.subscriptions;
create policy "Users view own subscription"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- 3) credits_refill_for_renewal: idempotent per invoice. RESETs balance to
--    the plan's monthly credits (no rollover).
create or replace function public.credits_refill_for_renewal(
  _user_id                uuid,
  _credits                integer,
  _stripe_invoice_id      text,
  _stripe_subscription_id text,
  _period_end             timestamptz
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _balance integer;
begin
  if exists (
    select 1 from public.credit_ledger
     where type = 'subscription_renewal'
       and metadata->>'stripe_invoice_id' = _stripe_invoice_id
  ) then
    select credits_remaining into _balance
      from public.profiles where id = _user_id;
    return coalesce(_balance, 0);
  end if;

  update public.profiles
     set credits_remaining = _credits
   where id = _user_id
   returning credits_remaining into _balance;

  if _balance is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  insert into public.credit_ledger
    (user_id, delta, reason, type, balance_after, metadata)
  values (
    _user_id,
    _credits,
    'Monthly plan refill',
    'subscription_renewal',
    _balance,
    jsonb_build_object(
      'stripe_invoice_id', _stripe_invoice_id,
      'stripe_subscription_id', _stripe_subscription_id,
      'period_end', _period_end
    )
  );

  return _balance;
end;
$$;

revoke all on function public.credits_refill_for_renewal(uuid, integer, text, text, timestamptz) from public;
grant execute on function public.credits_refill_for_renewal(uuid, integer, text, text, timestamptz) to service_role;
