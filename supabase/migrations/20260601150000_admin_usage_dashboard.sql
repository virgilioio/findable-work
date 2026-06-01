-- Admin usage dashboard: lightweight assistant chat event log + admin user directory function.

-- 1) assistant_chat_events: one row per public hiring-assistant call. No PII, no message bodies.
create table if not exists public.assistant_chat_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  job_id uuid,
  job_slug text,
  recruiter_user_id uuid,
  lang text,
  question_length integer not null default 0,
  had_form_context boolean not null default false,
  used_fallback boolean not null default false,
  fallback_reason text
);

create index if not exists assistant_chat_events_created_at_idx
  on public.assistant_chat_events (created_at desc);
create index if not exists assistant_chat_events_recruiter_idx
  on public.assistant_chat_events (recruiter_user_id, created_at desc);
create index if not exists assistant_chat_events_job_idx
  on public.assistant_chat_events (job_id, created_at desc);

grant select on public.assistant_chat_events to authenticated;
grant all on public.assistant_chat_events to service_role;

alter table public.assistant_chat_events enable row level security;

create policy "Admins read assistant chat events"
  on public.assistant_chat_events
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) admin_user_directory(): admin-only SECURITY DEFINER fn exposing auth.users essentials
-- joined with public profiles. Never expose auth.users directly to clients.
create or replace function public.admin_user_directory()
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  plan text,
  credits_remaining integer,
  sourcing_projects_used integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    u.email::text as email,
    u.created_at,
    u.last_sign_in_at,
    coalesce(p.plan, 'free') as plan,
    coalesce(p.credits_remaining, 0) as credits_remaining,
    coalesce(p.sourcing_projects_used, 0) as sourcing_projects_used
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.has_role(auth.uid(), 'admin'::app_role);
$$;

revoke all on function public.admin_user_directory() from public;
grant execute on function public.admin_user_directory() to authenticated;
grant execute on function public.admin_user_directory() to service_role;
