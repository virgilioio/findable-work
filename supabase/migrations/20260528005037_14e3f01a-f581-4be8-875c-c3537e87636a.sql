
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  conversation_id uuid not null,
  name text not null,
  role text not null default '',
  company text not null default '',
  stage text not null default 'Sourced' check (stage in ('Sourced','Contacted','Screening','Interview','Offer')),
  source text not null default 'LinkedIn',
  match int not null default 75 check (match between 0 and 100),
  tags text[] not null default '{}',
  starred boolean not null default false,
  avatar text not null default '',
  email text,
  phone text,
  linkedin text,
  location text,
  summary text,
  experience jsonb not null default '[]'::jsonb,
  education jsonb not null default '[]'::jsonb,
  match_breakdown jsonb not null default '[]'::jsonb,
  activity jsonb not null default '[]'::jsonb,
  stage_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.candidates to authenticated;
grant all on public.candidates to service_role;

alter table public.candidates enable row level security;

create policy "Users view own candidates" on public.candidates
  for select to authenticated using (auth.uid() = user_id);
create policy "Users insert own candidates" on public.candidates
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update own candidates" on public.candidates
  for update to authenticated using (auth.uid() = user_id);
create policy "Users delete own candidates" on public.candidates
  for delete to authenticated using (auth.uid() = user_id);

create index candidates_conversation_idx on public.candidates(conversation_id);
create index candidates_user_idx on public.candidates(user_id);

create trigger candidates_updated_at before update on public.candidates
  for each row execute function public.set_updated_at();
