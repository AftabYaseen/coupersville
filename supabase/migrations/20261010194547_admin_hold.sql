-- Admin hold: an admin can take a coupon down so the merchant cannot put it back.
-- A held coupon is never live: it is left out of live_coupons, shopper reads and every redemption check.
-- The merchant still sees it (with the reason), can edit or delete it, but cannot resume or republish it.
-- Only an admin (or server code) can set or release a hold.

alter table public.coupons
  add column admin_hold boolean not null default false,
  add column hold_reason text check (hold_reason is null or char_length(hold_reason) <= 500),
  add column held_by uuid references public.profiles (id) on delete set null,
  add column held_at timestamptz;
create index coupons_held_by_idx on public.coupons (held_by);
create index coupons_admin_hold_idx on public.coupons (admin_hold) where admin_hold;

-- The single definition of a live coupon, now including the hold.
create or replace function public.coupon_is_live(
  p_status public.coupon_status,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_business_id uuid,
  p_admin_hold boolean
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not p_admin_hold
    and p_status = 'published'
    and p_starts_at <= now()
    and p_expires_at > now()
    and public.business_is_publishable(p_business_id);
$$;

create or replace view public.live_coupons
with (security_invoker = true)
as
select c.*
from public.coupons c
where public.coupon_is_live(c.status, c.starts_at, c.expires_at, c.business_id, c.admin_hold);

alter policy coupons_select on public.coupons
  using (
    public.coupon_is_live(status, starts_at, expires_at, business_id, admin_hold)
    or public.can_manage_business(business_id)
    or (select public.is_admin())
    or exists (select 1 from public.redemptions r where r.coupon_id = coupons.id and r.user_id = (select auth.uid()))
  );

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
  v_used integer;
  v_total integer;
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

  select count(*) into v_used from public.redemptions where coupon_id = p_coupon_id and user_id = v_uid;
  if v_used >= v_coupon.per_user_limit then
    return jsonb_build_object('result', 'user_limit_reached');
  end if;

  if v_coupon.total_limit is not null then
    select count(*) into v_total from public.redemptions where coupon_id = p_coupon_id;
    if v_total >= v_coupon.total_limit then
      return jsonb_build_object('result', 'total_limit_reached');
    end if;
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
declare
  v_used integer;
  v_total integer;
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

  select count(*) into v_used from public.redemptions
  where coupon_id = p_coupon.id and user_id = p_token.user_id;
  if v_used >= p_coupon.per_user_limit then
    return 'user_limit_reached';
  end if;

  if p_coupon.total_limit is not null then
    select count(*) into v_total from public.redemptions where coupon_id = p_coupon.id;
    if v_total >= p_coupon.total_limit then
      return 'total_limit_reached';
    end if;
  end if;

  return null;
end;
$$;

create or replace function public.my_saved_coupons()
returns table (
  coupon_id uuid,
  saved_at timestamptz,
  title text,
  discount_type public.discount_type,
  discount_value numeric,
  expires_at timestamptz,
  business_name text,
  business_timezone text,
  stock_tint public.stock_tint,
  is_live boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, f.created_at, c.title, c.discount_type, c.discount_value, c.expires_at,
         b.name, b.timezone, cat.stock_tint,
         public.coupon_is_live(c.status, c.starts_at, c.expires_at, c.business_id, c.admin_hold)
  from public.favorites f
  join public.coupons c on c.id = f.coupon_id
  join public.businesses b on b.id = c.business_id
  join public.categories cat on cat.id = c.category_id
  where f.user_id = auth.uid()
  order by f.created_at desc;
$$;

create or replace function public.my_redemptions()
returns table (
  redemption_id uuid,
  redeemed_at timestamptz,
  method public.redemption_method,
  coupon_id uuid,
  title text,
  discount_type public.discount_type,
  discount_value numeric,
  business_name text,
  business_timezone text,
  store_name text,
  store_number text,
  store_city text,
  stock_tint public.stock_tint,
  coupon_is_live boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.redeemed_at, r.method,
         c.id, c.title, c.discount_type, c.discount_value,
         b.name, b.timezone,
         l.store_name, l.store_number, l.city,
         cat.stock_tint,
         public.coupon_is_live(c.status, c.starts_at, c.expires_at, c.business_id, c.admin_hold)
  from public.redemptions r
  join public.coupons c on c.id = r.coupon_id
  join public.businesses b on b.id = r.business_id
  join public.categories cat on cat.id = c.category_id
  left join public.locations l on l.id = r.location_id
  where r.user_id = auth.uid()
  order by r.redeemed_at desc
  limit 500;
$$;

-- The old check knew nothing about holds. It stays defined but refuses to run, so anything that
-- still calls it fails loudly instead of treating a held coupon as live.
create or replace function public.coupon_is_live(
  p_status public.coupon_status,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_business_id uuid
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  raise exception 'coupon_is_live needs the admin_hold argument; use the five-argument version'
    using errcode = '42883';
end;
$$;

-- Hold fields are admin-only. Admins get who and when filled in for them; releasing clears them.
create or replace function public.protect_coupon_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged() then
    if tg_op = 'UPDATE' and new.admin_hold is distinct from old.admin_hold then
      if new.admin_hold then
        new.held_by := coalesce(auth.uid(), new.held_by);
        new.held_at := now();
      else
        new.hold_reason := null;
        new.held_by := null;
        new.held_at := null;
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.featured := false;
    new.created_by := auth.uid();
    new.admin_hold := false;
    new.hold_reason := null;
    new.held_by := null;
    new.held_at := null;
  else
    if new.featured is distinct from old.featured then
      raise exception 'Only an admin can feature a coupon' using errcode = '42501';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'created_by cannot be changed' using errcode = '42501';
    end if;
    if new.admin_hold is distinct from old.admin_hold
       or new.hold_reason is distinct from old.hold_reason
       or new.held_by is distinct from old.held_by
       or new.held_at is distinct from old.held_at then
      raise exception 'Only Coupersville can place or release a hold'
        using errcode = '42501', hint = 'admin_hold';
    end if;
    if old.admin_hold and new.status = 'published' and old.status is distinct from 'published' then
      raise exception 'Coupersville removed this coupon, so it cannot be published'
        using errcode = '42501', hint = 'admin_hold';
    end if;
  end if;

  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and not public.business_is_publishable(new.business_id) then
    raise exception 'This business needs an active subscription to publish coupons'
      using errcode = 'P0001', hint = 'subscription_required';
  end if;

  return new;
end;
$$;
