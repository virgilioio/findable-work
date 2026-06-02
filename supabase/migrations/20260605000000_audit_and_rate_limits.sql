-- Audit log of sensitive actions (immutable, append-only).
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_user_created_idx
  on public.audit_events (user_id, created_at desc);
create index audit_events_entity_idx
  on public.audit_events (entity_type, entity_id);

grant select on public.audit_events to authenticated;
grant all on public.audit_events to service_role;

alter table public.audit_events enable row level security;

create policy "Users view own audit events"
  on public.audit_events for select to authenticated
  using (auth.uid() = user_id);

-- Ad-hoc rate limiter (best-effort, per-window counters).
create table public.rate_limits (
  bucket text not null,
  subject text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, subject, window_start)
);

create index rate_limits_window_idx
  on public.rate_limits (window_start);

grant all on public.rate_limits to service_role;

alter table public.rate_limits enable row level security;

notify pgrst, 'reload schema';
