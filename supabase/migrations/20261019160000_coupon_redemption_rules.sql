-- Client round 1, items 3 and 4: redemption rules and the new offer kinds.
-- Needs 20261019151452_discount_types_fixed_price_free (already applied).
-- Safe to run more than once.

-- Free offers have no value; every other kind needs one. The existing coupons_discount_value_check
-- (value above zero) stays: a check passes on null, so it only applies when there is a value.
alter table public.coupons alter column discount_value drop not null;
alter table public.coupons drop constraint if exists coupons_discount_value_kind_check;
alter table public.coupons add constraint coupons_discount_value_kind_check check (
  (discount_type = 'free') = (discount_value is null)
);

-- Rules, all in the business timezone:
--   per_user_limit: times one shopper may redeem during the promotion; null means unlimited.
--   redeem_frequency: at most once per calendar day or week (weeks start Monday), or null.
--   schedule_days: ISO weekdays 1 (Monday) to 7 (Sunday), or null for every day.
--   schedule_start / schedule_end: an optional daily window, start included, end excluded.
alter table public.coupons alter column per_user_limit drop not null;
alter table public.coupons add column if not exists redeem_frequency text;
alter table public.coupons add column if not exists schedule_days smallint[];
alter table public.coupons add column if not exists schedule_start time;
alter table public.coupons add column if not exists schedule_end time;

alter table public.coupons drop constraint if exists coupons_redeem_frequency_check;
alter table public.coupons add constraint coupons_redeem_frequency_check check (
  redeem_frequency is null or redeem_frequency in ('day', 'week')
);
alter table public.coupons drop constraint if exists coupons_schedule_days_check;
alter table public.coupons add constraint coupons_schedule_days_check check (
  schedule_days is null
  or (cardinality(schedule_days) between 1 and 7 and schedule_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
);
alter table public.coupons drop constraint if exists coupons_schedule_window_check;
alter table public.coupons add constraint coupons_schedule_window_check check (
  (schedule_start is null) = (schedule_end is null)
  and (schedule_start is null or schedule_start < schedule_end)
);

-- live_coupons is select c.*; replacing it picks up the new columns at the end.
create or replace view public.live_coupons
with (security_invoker = true)
as
select c.*
from public.coupons c
where public.coupon_is_live(c.status, c.starts_at, c.expires_at, c.business_id, c.admin_hold);

-- The coupon's own rules for one shopper, right now. Null when they may redeem.
-- Results: outside_schedule, user_limit_reached, frequency_limit, total_limit_reached.
-- Volatile so counts read the latest committed rows after the caller has taken its locks.
create or replace function public.coupon_rule_problem(p_coupon public.coupons, p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_local timestamp;
  v_since timestamptz;
  v_count integer;
begin
  select b.timezone into v_tz from public.businesses b where b.id = p_coupon.business_id;
  v_tz := coalesce(v_tz, 'UTC');
  v_local := now() at time zone v_tz;

  if p_coupon.schedule_days is not null
     and not (extract(isodow from v_local)::smallint = any (p_coupon.schedule_days)) then
    return 'outside_schedule';
  end if;
  if p_coupon.schedule_start is not null
     and not (v_local::time >= p_coupon.schedule_start and v_local::time < p_coupon.schedule_end) then
    return 'outside_schedule';
  end if;

  if p_coupon.per_user_limit is not null then
    select count(*) into v_count from public.redemptions
    where coupon_id = p_coupon.id and user_id = p_user_id;
    if v_count >= p_coupon.per_user_limit then
      return 'user_limit_reached';
    end if;
  end if;

  if p_coupon.redeem_frequency is not null then
    v_since := date_trunc(p_coupon.redeem_frequency, v_local) at time zone v_tz;
    if exists (
      select 1 from public.redemptions
      where coupon_id = p_coupon.id and user_id = p_user_id and redeemed_at >= v_since
    ) then
      return 'frequency_limit';
    end if;
  end if;

  if p_coupon.total_limit is not null then
    select count(*) into v_count from public.redemptions where coupon_id = p_coupon.id;
    if v_count >= p_coupon.total_limit then
      return 'total_limit_reached';
    end if;
  end if;

  return null;
end;
$$;

-- Results: ok, not_authenticated, account_suspended, not_live, outside_schedule,
--   user_limit_reached, frequency_limit, total_limit_reached.
create or replace function public.create_redemption_token(p_coupon_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_coupon public.coupons;
  v_problem text;
  v_code text;
  v_token text;
  v_row public.redemption_tokens;
begin
  if v_uid is null then
    return jsonb_build_object('result', 'not_authenticated');
  end if;

  if not exists (select 1 from public.profiles where id = v_uid and status = 'active') then
    return jsonb_build_object('result', 'account_suspended');
  end if;

  select * into v_coupon from public.coupons where id = p_coupon_id;
  if not found or not public.coupon_is_live(v_coupon.status, v_coupon.starts_at, v_coupon.expires_at, v_coupon.business_id, v_coupon.admin_hold) then
    return jsonb_build_object('result', 'not_live');
  end if;

  v_problem := public.coupon_rule_problem(v_coupon, v_uid);
  if v_problem is not null then
    return jsonb_build_object('result', v_problem);
  end if;

  -- Retire this user's earlier unused tokens for the same coupon.
  update public.redemption_tokens
     set expires_at = now()
   where coupon_id = p_coupon_id and user_id = v_uid and used_at is null and expires_at > now();

  -- Serialise code generation so two active tokens never share a short code.
  perform pg_advisory_xact_lock(hashtext('redemption_short_code'));
  loop
    v_code := lpad((abs(('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::int::bigint) % 1000000)::text, 6, '0');
    exit when not exists (
      select 1 from public.redemption_tokens
      where short_code = v_code and used_at is null and expires_at > now()
    );
  end loop;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.redemption_tokens (coupon_id, user_id, token, short_code, expires_at)
  values (p_coupon_id, v_uid, v_token, v_code, now() + interval '5 minutes')
  returning * into v_row;

  return jsonb_build_object(
    'result', 'ok',
    'token_id', v_row.id,
    'token', v_row.token,
    'short_code', v_row.short_code,
    'expires_at', v_row.expires_at
  );
end;
$$;

create or replace function public.redemption_problem(
  p_token public.redemption_tokens,
  p_coupon public.coupons,
  p_location public.locations
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_coupon.business_id <> p_location.business_id then
    return 'wrong_business';
  end if;
  if p_token.used_at is not null then
    return 'already_used';
  end if;
  if p_token.expires_at <= now() then
    return 'expired';
  end if;
  if not public.coupon_is_live(p_coupon.status, p_coupon.starts_at, p_coupon.expires_at, p_coupon.business_id, p_coupon.admin_hold) then
    return 'coupon_not_live';
  end if;
  if not p_coupon.all_locations and not exists (
    select 1 from public.coupon_locations
    where coupon_id = p_coupon.id and location_id = p_location.id
  ) then
    return 'location_not_eligible';
  end if;
  return public.coupon_rule_problem(p_coupon, p_token.user_id);
end;
$$;

-- What staff check by eye, plus the rules the app puts into words. Never anything about the shopper.
create or replace function public.redemption_offer(p_coupon public.coupons)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'coupon_id', p_coupon.id,
    'title', p_coupon.title,
    'description', p_coupon.description,
    'discount_type', p_coupon.discount_type,
    'discount_value', p_coupon.discount_value,
    'included_products', p_coupon.included_products,
    'limits_text', p_coupon.limits_text,
    'min_spend', p_coupon.min_spend,
    'min_qty', p_coupon.min_qty,
    'max_people', p_coupon.max_people,
    'per_user_limit', p_coupon.per_user_limit,
    'redeem_frequency', p_coupon.redeem_frequency,
    'schedule_days', p_coupon.schedule_days,
    'schedule_start', p_coupon.schedule_start,
    'schedule_end', p_coupon.schedule_end,
    'timezone', (select b.timezone from public.businesses b where b.id = p_coupon.business_id),
    'stock_tint', (select cat.stock_tint from public.categories cat where cat.id = p_coupon.category_id)
  );
$$;

-- Same checks and locking as before (token row, then coupon row). Failures now carry the offer,
-- except for another business's coupon, so staff see the rule that stopped it.
create or replace function public.verify_redemption(p_token_or_code text, p_location_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_location public.locations;
  v_found record;
  v_token public.redemption_tokens;
  v_coupon public.coupons;
  v_problem text;
  v_redemption public.redemptions;
begin
  if v_uid is null then
    return jsonb_build_object('result', 'not_authenticated');
  end if;

  select * into v_location from public.locations where id = p_location_id and active;
  if not found then
    return jsonb_build_object('result', 'location_not_found');
  end if;
  if not public.has_business_role(v_location.business_id) then
    return jsonb_build_object('result', 'not_member');
  end if;

  select * into v_found from public.resolve_redemption_input(p_token_or_code, v_location.business_id);
  if v_found.problem is not null then
    return jsonb_build_object('result', v_found.problem, 'method', v_found.method);
  end if;

  select * into v_token from public.redemption_tokens where id = v_found.token_id for update;
  select * into v_coupon from public.coupons where id = v_token.coupon_id for update;

  v_problem := public.redemption_problem(v_token, v_coupon, v_location);
  if v_problem is not null then
    if v_problem = 'wrong_business' then
      return jsonb_build_object('result', v_problem, 'method', v_found.method);
    end if;
    return jsonb_build_object(
      'result', v_problem,
      'method', v_found.method,
      'used_at', v_token.used_at,
      'offer', public.redemption_offer(v_coupon)
    );
  end if;

  update public.redemption_tokens set used_at = now() where id = v_token.id;

  insert into public.redemptions (coupon_id, user_id, business_id, location_id, token_id, method, verified_by)
  values (v_coupon.id, v_token.user_id, v_coupon.business_id, v_location.id, v_token.id, v_found.method, v_uid)
  returning * into v_redemption;

  return jsonb_build_object(
    'result', 'ok',
    'method', v_found.method,
    'redemption_id', v_redemption.id,
    'redeemed_at', v_redemption.redeemed_at,
    'store_name', v_location.store_name,
    'offer', public.redemption_offer(v_coupon)
  );
end;
$$;

-- The rules for the coupon behind one of the caller's own codes, for the redeem screen.
create or replace function public.my_token_offer(p_token_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.redemption_offer(c)
  from public.redemption_tokens t
  join public.coupons c on c.id = t.coupon_id
  where t.id = p_token_id and t.user_id = auth.uid();
$$;

revoke execute on function public.coupon_rule_problem(public.coupons, uuid) from public, anon, authenticated;
revoke execute on function public.my_token_offer(uuid) from public, anon;
grant execute on function public.my_token_offer(uuid) to authenticated;
