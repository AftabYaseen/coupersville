-- Billing Part A: offers as data, Founding Merchant free seats, and the publishing open date.
-- No payment processor is involved. A free seat is a 12-month complimentary plan, claimed in one
-- transaction together with the merchant's first published coupon.

-- 1. Offers. Prices are in cents. Windows are [starts, ends): the end is exclusive, and null means
--    open on that side. term_months null means ongoing. Plan limits are stored but not enforced yet;
--    null means unlimited.
create table public.offers (
  code text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(trim(name)) between 1 and 80),
  window_starts_at timestamptz,
  window_ends_at timestamptz,
  seat_cap integer check (seat_cap is null or seat_cap > 0),
  free_seats integer not null default 0 check (free_seats >= 0),
  term_months integer check (term_months is null or term_months between 1 and 120),
  annual_price_cents integer not null check (annual_price_cents >= 0),
  monthly_price_cents integer check (monthly_price_cents is null or monthly_price_cents >= 0),
  renews_into text references public.offers (code) on update cascade,
  active boolean not null default true,
  max_locations integer check (max_locations is null or max_locations > 0),
  max_live_coupons integer check (max_live_coupons is null or max_live_coupons > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (window_starts_at is null or window_ends_at is null or window_ends_at > window_starts_at),
  check (seat_cap is null or free_seats <= seat_cap),
  check (renews_into is null or renews_into <> code)
);
create trigger set_updated_at before update on public.offers for each row execute function public.set_updated_at();
alter table public.offers enable row level security;
create policy offers_select on public.offers for select to authenticated using ((select public.is_admin()));
create policy offers_update on public.offers for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- No insert or delete policies: offers are seeded here and deactivated, never deleted.

-- 2. Seat claims. One per business per offer, and seat numbers never repeat within an offer.
--    A claim is permanent: revoking the plan does not give the seat back.
create table public.offer_seat_claims (
  id uuid primary key default gen_random_uuid(),
  offer_code text not null references public.offers (code) on update cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  seat_number integer not null check (seat_number > 0),
  free boolean not null,
  coupon_id uuid references public.coupons (id) on delete set null,
  claimed_by uuid references public.profiles (id) on delete set null,
  claimed_at timestamptz not null default now(),
  unique (offer_code, business_id),
  unique (offer_code, seat_number)
);
create index offer_seat_claims_business_idx on public.offer_seat_claims (business_id);
create index offer_seat_claims_coupon_idx on public.offer_seat_claims (coupon_id);
create index offer_seat_claims_claimed_by_idx on public.offer_seat_claims (claimed_by);
alter table public.offer_seat_claims enable row level security;
create policy offer_seat_claims_select on public.offer_seat_claims for select to authenticated
  using (public.can_manage_business(business_id) or (select public.is_admin()));
-- No write policies: only claim_founding_seat (security definer) writes here.

-- 3. Which offer a plan came from.
alter table public.subscriptions
  add column offer_code text references public.offers (code) on update cascade;
create index subscriptions_offer_code_idx on public.subscriptions (offer_code);

-- 4. Settings.
alter table public.platform_settings
  add column publishing_opens_at timestamptz not null default '2026-11-01 00:00:00 America/Los_Angeles',
  add column founders_rule text not null default 'profile_and_first_coupon'
    check (founders_rule in ('profile_and_first_coupon', 'profile_complete')),
  add column founders_full_early_access boolean not null default true;

-- 5. Seed offers (Pacific time).
insert into public.offers (code, name, window_starts_at, window_ends_at, seat_cap, free_seats, term_months,
                           annual_price_cents, monthly_price_cents, renews_into, active, sort_order)
values
  ('general', 'General', '2027-07-01 00:00:00 America/Los_Angeles', null, null, 0, null, 24900, 2900, null, true, 3),
  ('merchant_plus', 'Merchant Plus', '2027-07-01 00:00:00 America/Los_Angeles', null, null, 0, null, 49900, 4900, null, false, 4);
insert into public.offers (code, name, window_starts_at, window_ends_at, seat_cap, free_seats, term_months,
                           annual_price_cents, monthly_price_cents, renews_into, active, sort_order)
values
  ('founding_merchant', 'Founding Merchant', '2026-11-01 00:00:00 America/Los_Angeles', '2027-02-01 00:00:00 America/Los_Angeles',
   200, 50, 12, 9900, null, 'general', true, 1),
  ('early_access', 'Early Access', '2027-02-01 00:00:00 America/Los_Angeles', '2027-07-01 00:00:00 America/Los_Angeles',
   null, 0, 12, 14900, 1900, 'general', true, 2);

-- 6. Seat caps and free seats can never drop below the seats already claimed.
create or replace function public.check_offer_seats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
  v_free_used integer;
begin
  if new.code is distinct from old.code then
    raise exception 'An offer code cannot be changed' using errcode = '42501';
  end if;
  select count(*), count(*) filter (where c.free)
    into v_used, v_free_used
  from public.offer_seat_claims c
  where c.offer_code = old.code;
  if new.seat_cap is not null and new.seat_cap < v_used then
    raise exception 'The seat cap cannot be below the % seats already taken', v_used
      using errcode = '23514', hint = 'seats_below_used';
  end if;
  if new.free_seats < v_free_used then
    raise exception 'Free seats cannot be below the % free seats already taken', v_free_used
      using errcode = '23514', hint = 'seats_below_used';
  end if;
  return new;
end;
$$;
create trigger check_offer_seats before update on public.offers
for each row execute function public.check_offer_seats();
revoke execute on function public.check_offer_seats() from public, anon, authenticated;

-- 7. Offers with seats used, for signed-in merchants and admins. Inactive offers are admin only.
create or replace function public.offer_overview()
returns table (
  code text,
  name text,
  window_starts_at timestamptz,
  window_ends_at timestamptz,
  seat_cap integer,
  free_seats integer,
  term_months integer,
  annual_price_cents integer,
  monthly_price_cents integer,
  renews_into text,
  active boolean,
  max_locations integer,
  max_live_coupons integer,
  sort_order integer,
  seats_used bigint,
  free_seats_used bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.code, o.name, o.window_starts_at, o.window_ends_at, o.seat_cap, o.free_seats, o.term_months,
         o.annual_price_cents, o.monthly_price_cents, o.renews_into, o.active, o.max_locations,
         o.max_live_coupons, o.sort_order,
         (select count(*) from public.offer_seat_claims c where c.offer_code = o.code),
         (select count(*) from public.offer_seat_claims c where c.offer_code = o.code and c.free)
  from public.offers o
  where auth.uid() is not null
    and (o.active or public.is_admin())
  order by o.sort_order, o.code;
$$;
revoke execute on function public.offer_overview() from public, anon;
grant execute on function public.offer_overview() to authenticated;

-- 8. Claim a Founding Merchant free seat, race-safe. Locks the offer row, so two merchants
--    claiming the last seat at once queue here and exactly one gets it. On success, in the same
--    transaction: the claim row, a 12-month complimentary plan, and (when given) the coupon published.
--    Results: claimed, not_open, not_allowed, profile_incomplete, has_plan, coupon_required,
--    coupon_invalid, no_offer, already_claimed, seats_gone.
create or replace function public.claim_founding_seat(p_business_id uuid, p_coupon_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.platform_settings%rowtype;
  v_offer public.offers%rowtype;
  v_business public.businesses%rowtype;
  v_coupon public.coupons%rowtype;
  v_used integer;
  v_free_used integer;
  v_seat integer;
  v_ends timestamptz;
begin
  if auth.uid() is null or not public.can_manage_business(p_business_id) then
    return jsonb_build_object('result', 'not_allowed');
  end if;

  select * into v_settings from public.platform_settings limit 1;
  if now() < v_settings.publishing_opens_at then
    return jsonb_build_object('result', 'not_open', 'opens_at', v_settings.publishing_opens_at);
  end if;

  select * into v_business from public.businesses b where b.id = p_business_id;
  if v_business.id is null or v_business.status <> 'active' then
    return jsonb_build_object('result', 'profile_incomplete');
  end if;

  if public.business_is_publishable(p_business_id) then
    return jsonb_build_object('result', 'has_plan');
  end if;

  if p_coupon_id is null and v_settings.founders_rule = 'profile_and_first_coupon' then
    return jsonb_build_object('result', 'coupon_required');
  end if;

  if p_coupon_id is not null then
    select * into v_coupon from public.coupons c where c.id = p_coupon_id and c.business_id = p_business_id for update;
    if v_coupon.id is null or v_coupon.admin_hold or v_coupon.status = 'published' or v_coupon.expires_at <= now() then
      return jsonb_build_object('result', 'coupon_invalid');
    end if;
  end if;

  select * into v_offer from public.offers o where o.code = 'founding_merchant' for update;
  if v_offer.code is null
     or not v_offer.active
     or (v_offer.window_starts_at is not null and now() < v_offer.window_starts_at)
     or (v_offer.window_ends_at is not null and now() >= v_offer.window_ends_at) then
    return jsonb_build_object('result', 'no_offer');
  end if;

  if exists (select 1 from public.offer_seat_claims c where c.offer_code = v_offer.code and c.business_id = p_business_id) then
    return jsonb_build_object('result', 'already_claimed');
  end if;

  -- The offer row lock is held, so these counts cannot change under us.
  select count(*), count(*) filter (where c.free), coalesce(max(c.seat_number), 0)
    into v_used, v_free_used, v_seat
  from public.offer_seat_claims c
  where c.offer_code = v_offer.code;
  if v_free_used >= v_offer.free_seats or (v_offer.seat_cap is not null and v_used >= v_offer.seat_cap) then
    return jsonb_build_object('result', 'seats_gone');
  end if;

  v_seat := v_seat + 1;
  v_ends := now() + make_interval(months => coalesce(v_offer.term_months, 12));

  insert into public.offer_seat_claims (offer_code, business_id, seat_number, free, coupon_id, claimed_by)
  values (v_offer.code, p_business_id, v_seat, true, p_coupon_id, auth.uid());

  insert into public.subscriptions (business_id, source, status, current_period_end, cancel_at_period_end,
                                    past_due_since, stripe_subscription_id, offer_code)
  values (p_business_id, 'complimentary', 'active', v_ends, false, null, null, v_offer.code)
  on conflict (business_id) do update
    set source = 'complimentary',
        status = 'active',
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = false,
        past_due_since = null,
        stripe_subscription_id = null,
        offer_code = excluded.offer_code;

  if p_coupon_id is not null then
    update public.coupons set status = 'published' where id = p_coupon_id;
  end if;

  return jsonb_build_object('result', 'claimed', 'seat', v_seat, 'ends_at', v_ends);
end;
$$;
revoke execute on function public.claim_founding_seat(uuid, uuid) from public, anon;
grant execute on function public.claim_founding_seat(uuid, uuid) to authenticated;

-- 9. Publishing opens on a set date. Same rules as before, plus: merchants cannot publish before
--    publishing_opens_at. Admins and server code are not affected, and live coupons stay live.
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

  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if now() < (select s.publishing_opens_at from public.platform_settings s limit 1) then
      raise exception 'Publishing has not opened yet'
        using errcode = 'P0001', hint = 'publishing_not_open';
    end if;
    if not public.business_is_publishable(new.business_id) then
      raise exception 'This business needs an active plan to publish coupons'
        using errcode = 'P0001', hint = 'subscription_required';
    end if;
  end if;

  return new;
end;
$$;
