-- Re-create admin_user_directory + assistant_chat_events to ensure they exist.
-- Runtime error "Could not find the function public.admin_user_directory" in
-- PostgREST's schema cache indicates the earlier migration did not register
-- the function. This migration is idempotent and forces a PostgREST reload.

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

grant select on public.assistant_chat_events to authenticated;
grant all on public.assistant_chat_events to service_role;

alter table public.assistant_chat_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'assistant_chat_events'
      and policyname = 'Admins read assistant chat events'
  ) then
    create policy "Admins read assistant chat events"
      on public.assistant_chat_events
      for select
      to authenticated
      using (public.has_role(auth.uid(), 'admin'::app_role));
  end if;
end $$;

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

notify pgrst, 'reload schema';
