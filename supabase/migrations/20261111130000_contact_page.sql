-- Copy deck phase 2 (2026-11-11): the Contact page.
--
-- 1. The contact address and response time, editable in Admin > Settings. The address column
--    already exists (it was added for "More than 3 locations? Contact us"); it is now the one
--    contact address for the whole site.
-- 2. Contact messages share the sign-in code rate limits table, as kind 'contact': per email 3 in
--    10 minutes and 10 a day, per IP 5 in 10 minutes and 20 a day. Only keyed hashes are stored,
--    never the message, and purge_stale_codes deletes the rows after 2 days.

begin;

alter table public.platform_settings
  add column contact_response_time text not null default 'within 2 business days'
    check (length(trim(contact_response_time)) between 1 and 80);
comment on column public.platform_settings.enterprise_contact_email is 'The site''s contact address: Contact page messages, Billing and the membership page.';
comment on column public.platform_settings.contact_response_time is 'Shown after a contact message is sent, for example "within 2 business days".';

alter table public.auth_code_requests drop constraint auth_code_requests_kind_check;
alter table public.auth_code_requests add constraint auth_code_requests_kind_check check (kind in ('send', 'verify', 'contact'));

-- Records a request if it is within the limits. Results: ok, email_limited, ip_limited.
--   send:    per email 3 in 10 minutes and 10 a day; per IP 10 in 10 minutes and 50 a day.
--   verify:  per email 10 in 10 minutes and 30 a day; per IP 30 in 10 minutes and 200 a day.
--   contact: per email 3 in 10 minutes and 10 a day; per IP 5 in 10 minutes and 20 a day.
create or replace function public.register_auth_code_request(p_kind text, p_email_hash text, p_ip_hash text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email_recent_max integer;
  v_email_day_max integer;
  v_ip_recent_max integer;
  v_ip_day_max integer;
  v_email_recent integer;
  v_email_day integer;
  v_ip_recent integer := 0;
  v_ip_day integer := 0;
begin
  if p_kind is null or p_kind not in ('send', 'verify', 'contact') or coalesce(p_email_hash, '') = '' then
    raise exception 'invalid request' using errcode = '22023';
  end if;

  if p_kind = 'send' then
    v_email_recent_max := 3;
    v_email_day_max := 10;
    v_ip_recent_max := 10;
    v_ip_day_max := 50;
  elsif p_kind = 'verify' then
    v_email_recent_max := 10;
    v_email_day_max := 30;
    v_ip_recent_max := 30;
    v_ip_day_max := 200;
  else
    v_email_recent_max := 3;
    v_email_day_max := 10;
    v_ip_recent_max := 5;
    v_ip_day_max := 20;
  end if;

  -- One request per email at a time, so two quick taps cannot both slip under the limit.
  perform pg_advisory_xact_lock(hashtext('auth-code:' || p_email_hash));

  select count(*) filter (where created_at > now() - interval '10 minutes'), count(*)
    into v_email_recent, v_email_day
  from public.auth_code_requests
  where email_hash = p_email_hash and kind = p_kind and created_at > now() - interval '1 day';

  if p_ip_hash is not null then
    select count(*) filter (where created_at > now() - interval '10 minutes'), count(*)
      into v_ip_recent, v_ip_day
    from public.auth_code_requests
    where ip_hash = p_ip_hash and kind = p_kind and created_at > now() - interval '1 day';
  end if;

  if v_email_recent >= v_email_recent_max or v_email_day >= v_email_day_max then
    return 'email_limited';
  end if;
  if v_ip_recent >= v_ip_recent_max or v_ip_day >= v_ip_day_max then
    return 'ip_limited';
  end if;

  insert into public.auth_code_requests (kind, email_hash, ip_hash) values (p_kind, p_email_hash, p_ip_hash);
  return 'ok';
end;
$$;
revoke execute on function public.register_auth_code_request(text, text, text) from public, anon, authenticated;

commit;
