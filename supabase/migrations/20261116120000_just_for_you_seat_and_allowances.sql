-- Client decisions, 2026-11-12.
--
-- 1. Only a public coupon can claim a free Pioneer Circle seat. claim_founding_seat refuses a Just for
--    You offer with result 'coupon_private'; the coupon stays a draft and the next public coupon claims
--    the seat. Everything else in the function is unchanged.
-- 2. Just for You allowance per business per month, by level: Pioneer Circle 5, Early Bird 5,
--    Main Street 8, Boulevard 12. Still editable in Admin > Offers.

begin;

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
    -- A Just for You offer never claims a seat; the next public coupon does.
    if v_coupon.visibility = 'private' then
      return jsonb_build_object('result', 'coupon_private');
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

update public.offers set private_offers_per_month = 5 where code in ('founding_merchant', 'early_access');
update public.offers set private_offers_per_month = 8 where code = 'general';
update public.offers set private_offers_per_month = 12 where code = 'merchant_plus';

commit;
