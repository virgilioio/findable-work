-- Notification preferences for recruiters.
alter table public.profiles
  add column if not exists notify_on_new_applicant boolean not null default true,
  add column if not exists notify_daily_digest boolean not null default false,
  add column if not exists last_digest_sent_at timestamptz;
