-- Ensure profiles.stripe_customer_id exists (prior migration may not have applied).
alter table public.profiles
  add column if not exists stripe_customer_id text;

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id);

notify pgrst, 'reload schema';
