-- Admin Usage must list every signed-up app user, even if profile creation lagged.
-- Keep the RPC as a backend fallback and derive plan from active subscription rows first.

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
    coalesce(
      (
        select s.tier_key
        from public.subscriptions s
        where s.user_id = u.id
          and s.status in ('active', 'trialing', 'past_due')
        order by coalesce(s.current_period_end, s.created_at) desc
        limit 1
      ),
      nullif(p.plan, ''),
      'free'
    ) as plan,
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
