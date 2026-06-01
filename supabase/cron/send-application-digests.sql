-- Run ONCE in Cloud → SQL Editor after the notification_prefs migration deploys.
-- Schedules the daily applicant digest at 14:00 UTC (≈ 8 AM CDMX).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('send-application-digests')
where exists (select 1 from cron.job where jobname = 'send-application-digests');

select cron.schedule(
  'send-application-digests',
  '0 14 * * *',
  $$
  select net.http_post(
    url := 'https://findable-work.lovable.app/api/public/hooks/send-application-digests',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_LqEjC2fH5ZpYupzpKaMvJw_nD1c9gNr'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);