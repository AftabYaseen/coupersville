-- Housekeeping, run every hour by pg_cron:
--   unused redemption codes are deleted one day after they expire;
--   sign-in rate-limit rows are deleted after two days.
-- A code linked to a redemption is never deleted.
-- Needs pg_cron (enabled below, or in Dashboard > Database > Extensions) and
-- 20261019160200_signin_code_limits (for auth_code_requests).
-- Safe to run more than once: cron.schedule replaces a job with the same name.

create or replace function public.purge_stale_codes()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.redemption_tokens t
  where t.used_at is null
    and t.expires_at < now() - interval '1 day'
    and not exists (select 1 from public.redemptions r where r.token_id = t.id);

  delete from public.auth_code_requests where created_at < now() - interval '2 days';
$$;

revoke execute on function public.purge_stale_codes() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('coupersville-purge-stale-codes', '23 * * * *', 'select public.purge_stale_codes()');
