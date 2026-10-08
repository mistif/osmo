-- Osmo reminder timer (connectors phase 1, Task 1.11, spec 7.3).
-- NOT APPLIED. The main agent applies it with Gur's OK (apply_migration, name
-- connectors_phase1_timer), after these three things are true:
--   1. /api/cron/due is deployed (it is, in lib/actions/due.ts) and OSMO_CRON_SECRET is set in
--      Vercel Production, then redeployed. Without it the route answers 404 to everything.
--   2. The same secret is stored in Supabase Vault under the name OSMO_CRON_SECRET. In the SQL
--      editor, with the real value instead of the placeholder (never commit the value):
--        select vault.create_secret('PASTE-THE-SECRET-HERE', 'OSMO_CRON_SECRET', 'Bearer token for /api/cron/due');
--   3. docs/migrations/connectors-phase-1.sql (the reminders table) is applied.
--
-- What it does: every minute Postgres asks "is a reminder due?". Only if one is does it send one
-- HTTP POST to the app, so a quiet minute costs a single indexed query and no function call.
-- Once a day at 03:00 UTC it calls the app regardless, for the app's daily clean-up.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- force = true skips the "is anything due" check (the daily call).
-- security definer so it can read the Vault; search_path empty so nothing can be shadowed.
create or replace function public.notify_due(force boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s text;
begin
  if not force and not exists (
    select 1 from public.reminders where status = 'pending' and due_at <= now()
  ) then
    return;
  end if;

  select decrypted_secret into s
    from vault.decrypted_secrets
   where name = 'OSMO_CRON_SECRET';
  if s is null then
    -- No secret stored yet: do nothing rather than send a request that will be refused.
    raise warning 'notify_due: OSMO_CRON_SECRET is not in the Vault';
    return;
  end if;

  perform net.http_post(
    url := 'https://osmo-xyz.vercel.app/api/cron/due',
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || s),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end
$$;

-- Only the scheduler (the postgres role) runs it; nobody who signs in can.
revoke all on function public.notify_due(boolean) from public, anon, authenticated;

-- Naming a job again replaces the old one, so running this file twice is safe.
select cron.schedule('osmo-notify-due', '* * * * *', 'select public.notify_due()');
select cron.schedule('osmo-notify-daily', '0 3 * * *', 'select public.notify_due(true)');

-- ---------------------------------------------------------------------------------------------
-- Verify (run each, read the result):
--
-- 1. Both jobs exist and are active:
--      select jobname, schedule, active from cron.job where jobname like 'osmo-%';
--    Expect osmo-notify-due '* * * * *' and osmo-notify-daily '0 3 * * *', both true.
--
-- 2. The function is not callable by a signed-in user (run as authenticated; expect permission denied):
--      set role authenticated; select public.notify_due(true); reset role;
--
-- 3. Ask Osmo for a reminder two minutes ahead, wait, then read the scheduler and the HTTP answer:
--      select status, return_message, start_time from cron.job_run_details
--       order by start_time desc limit 5;
--      select id, status_code, left(content, 120) as body, created from net._http_response
--       order by created desc limit 5;
--    Expect cron status 'succeeded' and status_code 200 with a body like {"sent":1}. A 401 means the
--    Vault secret differs from Vercel's; a 404 means OSMO_CRON_SECRET is not set (or not redeployed)
--    in Vercel; a timeout means the deploy is down.
--
-- 4. The reminder was claimed:
--      select text, status, sent_at from public.reminders order by created_at desc limit 3;
--
-- To stop the timer:
--      select cron.unschedule('osmo-notify-due'); select cron.unschedule('osmo-notify-daily');
