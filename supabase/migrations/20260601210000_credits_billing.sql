-- Credits & billing: seed new users with 50 credits, add credit_purchases
-- table, atomic spend RPC, and Stripe webhook completion RPC.

-- 1) Profiles: default new rows to 50 credits, backfill existing accounts
--    that are still at 0 (untouched seed).
alter table public.profiles
  alter column credits_remaining set default 50;

alter table public.profiles
  add column if not exists credits_seeded_at timestamptz;

update public.profiles
  set credits_remaining = 50,
      credits_seeded_at = now()
  where credits_seeded_at is null and credits_remaining = 0;

-- 2) credit_ledger: add type + metadata + balance_after for richer history.
alter table public.credit_ledger
  add column if not exists type text not null default 'adjustment';
alter table public.credit_ledger
  add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.credit_ledger
  add column if not exists balance_after integer;

create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);

-- 3) credit_purchases: one row per Stripe checkout attempt.
create table if not exists public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  stripe_session_id text not null unique,
  stripe_payment_intent text,
  bundle_key text not null,
  credits integer not null,
  amount_cents integer not null,
  currency text not null default 'usd',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists credit_purchases_user_idx
  on public.credit_purchases (user_id, created_at desc);

grant select on public.credit_purchases to authenticated;
grant all on public.credit_purchases to service_role;

alter table public.credit_purchases enable row level security;

drop policy if exists "Users view own credit purchases" on public.credit_purchases;
create policy "Users view own credit purchases"
  on public.credit_purchases for select
  to authenticated
  using (auth.uid() = user_id);

-- 4) handle_new_user: seed 50 credits + ledger row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, credits_remaining, credits_seeded_at)
  values (new.id, 50, now())
  on conflict (id) do nothing;

  insert into public.credit_ledger (user_id, delta, reason, type, balance_after, metadata)
  values (new.id, 50, 'Welcome bonus', 'signup_bonus', 50, '{}'::jsonb);

  return new;
end;
$$;

-- 5) spend_credits: atomically deduct and append a ledger row.
create or replace function public.spend_credits(
  _user_id uuid,
  _amount integer,
  _type text,
  _reason text,
  _metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _current integer;
  _new integer;
begin
  if _amount <= 0 then
    raise exception 'spend amount must be positive';
  end if;

  select credits_remaining into _current
  from public.profiles
  where id = _user_id
  for update;

  if _current is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  if _current < _amount then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  _new := _current - _amount;

  update public.profiles
  set credits_remaining = _new
  where id = _user_id;

  insert into public.credit_ledger (user_id, delta, reason, type, balance_after, metadata)
  values (_user_id, -_amount, _reason, _type, _new, coalesce(_metadata, '{}'::jsonb));

  return _new;
end;
$$;

revoke all on function public.spend_credits(uuid, integer, text, text, jsonb) from public;
grant execute on function public.spend_credits(uuid, integer, text, text, jsonb) to service_role;

-- 6) credit_purchase_complete: idempotent webhook completion.
create or replace function public.credit_purchase_complete(
  _stripe_session_id text,
  _stripe_payment_intent text
)
returns table (user_id uuid, credits integer, balance_after integer, already_completed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  _purchase public.credit_purchases%rowtype;
  _new integer;
begin
  select * into _purchase
  from public.credit_purchases
  where stripe_session_id = _stripe_session_id
  for update;

  if not found then
    raise exception 'purchase_not_found' using errcode = 'P0002';
  end if;

  if _purchase.status = 'paid' then
    return query
      select _purchase.user_id,
             _purchase.credits,
             p.credits_remaining,
             true
        from public.profiles p
       where p.id = _purchase.user_id;
    return;
  end if;

  update public.profiles
  set credits_remaining = credits_remaining + _purchase.credits
  where id = _purchase.user_id
  returning credits_remaining into _new;

  insert into public.credit_ledger (user_id, delta, reason, type, balance_after, metadata, stripe_session_id)
  values (
    _purchase.user_id,
    _purchase.credits,
    'Credit purchase — ' || _purchase.bundle_key,
    'purchase',
    _new,
    jsonb_build_object(
      'bundle_key', _purchase.bundle_key,
      'amount_cents', _purchase.amount_cents,
      'currency', _purchase.currency
    ),
    _stripe_session_id
  );

  update public.credit_purchases
  set status = 'paid',
      completed_at = now(),
      stripe_payment_intent = coalesce(_stripe_payment_intent, stripe_payment_intent)
  where stripe_session_id = _stripe_session_id;

  return query
    select _purchase.user_id, _purchase.credits, _new, false;
end;
$$;

revoke all on function public.credit_purchase_complete(text, text) from public;
grant execute on function public.credit_purchase_complete(text, text) to service_role;
