-- Remove Stripe (2026-11-11). Payments run on Authorize.net; no plan ever came from Stripe
-- (no subscription has source 'stripe' or a Stripe id, and billing_customers is empty).
--
-- 1. claim_founding_seat and checkout_finish stop writing stripe_subscription_id.
-- 2. The Stripe columns on subscriptions, billing_customers and stripe_events are dropped.
-- 3. 'stripe' is removed from subscription_source. Postgres cannot drop an enum value, so the type
--    is rebuilt. Exactly three objects use the type (checked in pg_depend on 2026-11-11): the
--    subscriptions.source column, plan_is_current (argument) and admin_list_businesses (result
--    column). Both functions are dropped and recreated around the change, unchanged apart from the
--    type, with their grants restored. No CASCADE, so anything unexpected stops the migration.

begin;

-- Stops here if any plan still came from Stripe, so nothing is lost by accident.
do $$
begin
  if exists (select 1 from public.subscriptions where source = 'stripe' or stripe_customer_id is not null or stripe_subscription_id is not null)
     or exists (select 1 from public.billing_customers) then
    raise exception 'A plan still refers to Stripe. Nothing was changed.';
  end if;
end;
$$;

-- 1. Functions that wrote stripe_subscription_id. Otherwise unchanged.
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
  select count(*) filter (where c.free), coalesce(max(c.seat_number), 0)
    into v_free_used, v_seat
  from public.offer_seat_claims c
  where c.offer_code = v_offer.code;
  if v_free_used >= v_offer.free_seats
     or (v_offer.seat_cap is not null and public.offer_seats_in_use(v_offer.code) >= v_offer.seat_cap) then
    return jsonb_build_object('result', 'seats_gone');
  end if;

  v_seat := v_seat + 1;
  v_ends := now() + make_interval(months => coalesce(v_offer.term_months, 12));

  insert into public.offer_seat_claims (offer_code, business_id, seat_number, free, coupon_id, claimed_by)
  values (v_offer.code, p_business_id, v_seat, true, p_coupon_id, auth.uid());

  insert into public.subscriptions (business_id, source, status, current_period_end, cancel_at_period_end,
                                    past_due_since, offer_code, term_ends_at)
  values (p_business_id, 'complimentary', 'active', v_ends, false, null, v_offer.code, v_ends)
  on conflict (business_id) do update
    set source = 'complimentary',
        status = 'active',
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = false,
        past_due_since = null,
        offer_code = excluded.offer_code,
        term_ends_at = excluded.term_ends_at;

  if p_coupon_id is not null then
    update public.coupons set status = 'published' where id = p_coupon_id;
  end if;

  return jsonb_build_object('result', 'claimed', 'seat', v_seat, 'ends_at', v_ends);
end;
$$;

create or replace function public.checkout_finish(p_checkout_id uuid, p_outcome text, p_note text default null,
                                                  p_customer_profile text default null, p_payment_profile text default null,
                                                  p_last4 text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.checkouts%rowtype;
  v_offer public.offers%rowtype;
  v_seat integer;
  v_end timestamptz;
  v_term timestamptz;
  v_months integer;
begin
  select * into v_checkout from public.checkouts k where k.id = p_checkout_id for update;
  if v_checkout.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_checkout.status in ('captured', 'voided', 'failed') then
    return jsonb_build_object('result', 'already', 'status', v_checkout.status);
  end if;

  if p_outcome <> 'captured' then
    update public.checkouts
       set status = case when p_outcome = 'voided' then 'voided' else 'failed' end,
           outcome = p_note, resolved_at = now(), resolving_until = null
     where id = p_checkout_id;
    return jsonb_build_object('result', 'recorded', 'status', p_outcome);
  end if;

  select * into v_offer from public.offers o where o.code = v_checkout.offer_code for update;
  if v_checkout.holds_seat then
    select coalesce(max(c.seat_number), 0) + 1 into v_seat from public.offer_seat_claims c where c.offer_code = v_offer.code;
    insert into public.offer_seat_claims (offer_code, business_id, seat_number, free, claimed_by)
    values (v_offer.code, v_checkout.business_id, v_seat, false, v_checkout.created_by)
    on conflict (offer_code, business_id) do nothing;
  end if;

  v_months := case v_checkout.billing_cycle when 'monthly' then 1 else 12 end;
  v_end := now() + make_interval(months => v_months);
  v_term := case when v_offer.term_months is null then null else now() + make_interval(months => v_offer.term_months) end;

  insert into public.subscriptions (business_id, source, status, current_period_end, cancel_at_period_end, past_due_since,
                                    offer_code, billing_cycle, term_ends_at,
                                    anet_customer_profile_id, anet_payment_profile_id, card_last4, card_updated_at)
  values (v_checkout.business_id, 'authorize_net', 'active', v_end, false, null, v_offer.code,
          v_checkout.billing_cycle, v_term, p_customer_profile, p_payment_profile, p_last4, now())
  on conflict (business_id) do update
    set source = 'authorize_net', status = 'active', current_period_end = excluded.current_period_end,
        cancel_at_period_end = false, past_due_since = null,
        offer_code = excluded.offer_code, billing_cycle = excluded.billing_cycle, term_ends_at = excluded.term_ends_at,
        anet_customer_profile_id = coalesce(excluded.anet_customer_profile_id, public.subscriptions.anet_customer_profile_id),
        anet_payment_profile_id = coalesce(excluded.anet_payment_profile_id, public.subscriptions.anet_payment_profile_id),
        card_last4 = coalesce(excluded.card_last4, public.subscriptions.card_last4),
        card_updated_at = now();

  insert into public.payments (business_id, anet_trans_id, kind, status, amount_cents, card_last4, offer_code,
                               billing_cycle, period_start, period_end, checkout_id)
  values (v_checkout.business_id, v_checkout.anet_trans_id, 'first', 'paid', v_checkout.amount_cents, p_last4,
          v_offer.code, v_checkout.billing_cycle, now(), v_end, v_checkout.id)
  on conflict (anet_trans_id) do nothing;

  update public.checkouts set status = 'captured', resolved_at = now(), resolving_until = null where id = p_checkout_id;
  return jsonb_build_object('result', 'recorded', 'status', 'captured', 'seat', v_seat, 'ends_at', v_end);
end;
$$;

-- 2. Stripe columns and tables.
alter table public.subscriptions
  drop column stripe_customer_id,
  drop column stripe_subscription_id;
drop table public.billing_customers;
drop table public.stripe_events;

-- 3. subscription_source without 'stripe'.
alter type public.subscription_source rename to subscription_source_old;
create type public.subscription_source as enum ('complimentary', 'authorize_net');

drop function public.admin_list_businesses(text, public.business_status);
drop function public.plan_is_current(public.subscription_status, public.subscription_source_old, timestamptz, timestamptz);

alter table public.subscriptions
  alter column source type public.subscription_source using source::text::public.subscription_source;

create function public.plan_is_current(p_status public.subscription_status, p_source public.subscription_source,
                                       p_period_end timestamptz, p_past_due_since timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (p_status = 'active'
      and (p_period_end is null
           or p_period_end > now() - case when p_source <> 'complimentary' then interval '1 day' else interval '0' end))
    or (p_status = 'past_due'
      and p_source <> 'complimentary'
      and p_past_due_since is not null
      and p_past_due_since > now() - interval '7 days'),
    false
  );
$$;
-- Same grants as before: everyone may call it (it reads nothing).
grant execute on function public.plan_is_current(public.subscription_status, public.subscription_source, timestamptz, timestamptz)
  to public, anon, authenticated, service_role;

-- Same signature, columns and body as 20261028120000; only plan_source has the new type.
create function public.admin_list_businesses(
  p_query text default null,
  p_status public.business_status default null
)
returns table (
  id uuid,
  name text,
  status public.business_status,
  created_at timestamptz,
  timezone text,
  owner_name text,
  owner_email text,
  category_name text,
  plan_source public.subscription_source,
  plan_status public.subscription_status,
  plan_ends_at timestamptz,
  plan_active boolean,
  store_count bigint,
  coupon_count bigint,
  live_coupon_count bigint,
  redemptions_30d bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_like text;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  v_like := case
    when nullif(trim(p_query), '') is null then null
    else '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;

  return query
  select b.id, b.name, b.status, b.created_at, b.timezone,
         p.full_name, u.email::text, cat.name,
         s.source, s.status, s.current_period_end,
         coalesce(public.plan_is_current(s.status, s.source, s.current_period_end, s.past_due_since), false),
         (select count(*) from public.locations l where l.business_id = b.id and l.active),
         (select count(*) from public.coupons c where c.business_id = b.id),
         (select count(*) from public.live_coupons c where c.business_id = b.id),
         (select count(*) from public.redemptions r where r.business_id = b.id and r.redeemed_at >= now() - interval '30 days')
  from public.businesses b
  left join public.profiles p on p.id = b.owner_id
  left join auth.users u on u.id = b.owner_id
  left join public.categories cat on cat.id = b.primary_category_id
  left join public.subscriptions s on s.business_id = b.id
  where (p_status is null or b.status = p_status)
    and (v_like is null or b.name ilike v_like or u.email ilike v_like)
  order by b.created_at desc
  limit 200;
end;
$$;
-- Same grants as before: admins call it signed in; it checks is_admin() itself.
revoke execute on function public.admin_list_businesses(text, public.business_status) from public, anon;
grant execute on function public.admin_list_businesses(text, public.business_status) to authenticated, service_role;

drop type public.subscription_source_old;

commit;
