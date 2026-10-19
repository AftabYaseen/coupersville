-- Client round 1, item 2: rate limits for email sign-in codes.
-- Emails and IP addresses are stored only as keyed hashes made by the server.
-- Safe to run more than once.

create table if not exists public.auth_code_requests (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('send', 'verify')),
  email_hash text not null,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists auth_code_requests_email_idx on public.auth_code_requests (email_hash, kind, created_at);
create index if not exists auth_code_requests_ip_idx on public.auth_code_requests (ip_hash, kind, created_at);
alter table public.auth_code_requests enable row level security;
-- No policies: only server code reads or writes here.

-- Records a request if it is within the limits. Results: ok, email_limited, ip_limited.
--   send:   per email 3 in 10 minutes and 10 a day; per IP 10 in 10 minutes and 50 a day.
--   verify: per email 10 in 10 minutes and 30 a day; per IP 30 in 10 minutes and 200 a day.
-- The limits are set into variables first: in PL/pgSQL an IF condition ends at the first THEN,
-- so a CASE (which has its own THEN) cannot sit inside one.
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
  if p_kind is null or p_kind not in ('send', 'verify') or coalesce(p_email_hash, '') = '' then
    raise exception 'invalid request' using errcode = '22023';
  end if;

  if p_kind = 'send' then
    v_email_recent_max := 3;
    v_email_day_max := 10;
    v_ip_recent_max := 10;
    v_ip_day_max := 50;
  else
    v_email_recent_max := 10;
    v_email_day_max := 30;
    v_ip_recent_max := 30;
    v_ip_day_max := 200;
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

-- The role of the account with this email, if any. Server code uses it to keep merchants and
-- admins on password sign-in.
create or replace function public.account_role_for_email(p_email text)
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

revoke execute on function public.register_auth_code_request(text, text, text) from public, anon, authenticated;
revoke execute on function public.account_role_for_email(text) from public, anon, authenticated;
