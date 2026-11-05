-- Confirms paid checkouts every 5 minutes, without Authorize.net webhooks (2026-11-05).
--
-- Live payments use the client's existing Authorize.net account with no Signature Key, so there are
-- no webhooks. A payment is confirmed when the merchant returns from Authorize.net's page, or by the
-- sweep. Vercel's daily cron is too slow for a merchant who closes the page instead of returning,
-- so the database calls the sweep-only endpoint (/api/cron/sweep) every 5 minutes through pg_net.
--
-- The cron secret is read from Supabase Vault at call time, so it is never in this file or the repo.
-- After running this migration, store it once in the SQL editor (the same value as CRON_SECRET on Vercel):
--
--   select vault.create_secret('<CRON_SECRET value>', 'coupersville_cron_secret');
--
-- Until then the calls are refused (401) and nothing happens. To stop the job:
--   select cron.unschedule('coupersville-checkout-sweep');

create extension if not exists pg_net with schema extensions;

select cron.unschedule('coupersville-checkout-sweep')
 where exists (select 1 from cron.job where jobname = 'coupersville-checkout-sweep');

select cron.schedule(
  'coupersville-checkout-sweep',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://coupersville.com/api/cron/sweep',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'coupersville_cron_secret'), '')
    ),
    timeout_milliseconds := 30000
  );
  $$
);
