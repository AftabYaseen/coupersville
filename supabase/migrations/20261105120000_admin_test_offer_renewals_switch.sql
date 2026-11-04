-- Going live with Authorize.net (2026-11-05).
--
-- 1. An admin-only $1.00 test offer, so an admin can run one real end-to-end payment through
--    "Test checkout" on a test business. It is inactive and admin-only: merchants never see it in
--    offer_overview() (even if someone later switches it on), it is never the current offer, and it
--    has no seat cap, so a checkout for it holds no seat and claims no Founding seat.
-- 2. A "renewals enabled" setting, off. While it is off the daily job charges no renewals or
--    retries and sends no renewal reminders. First payments (checkout, sweep) are unaffected.

alter table public.offers add column if not exists admin_only boolean not null default false;
comment on column public.offers.admin_only is 'Only admins can see or buy it (the $1 live payment test).';

insert into public.offers (code, name, window_starts_at, window_ends_at, seat_cap, free_seats, term_months,
                           annual_price_cents, monthly_price_cents, renews_into, active, admin_only, sort_order)
values ('admin_test', 'Admin payment test', null, null, null, 0, null, 100, null, null, false, true, 99)
on conflict (code) do nothing;

alter table public.platform_settings add column if not exists renewals_enabled boolean not null default false;
comment on column public.platform_settings.renewals_enabled is 'Off: the daily job charges no renewals or retries and sends no renewal reminders.';

-- Merchants see active offers that are not admin-only; admins see every offer.
create or replace function public.offer_overview()
returns table(code text, name text, window_starts_at timestamptz, window_ends_at timestamptz, seat_cap integer,
              free_seats integer, term_months integer, annual_price_cents integer, monthly_price_cents integer,
              renews_into text, active boolean, max_locations integer, max_live_coupons integer, sort_order integer,
              seats_used bigint, free_seats_used bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.code, o.name, o.window_starts_at, o.window_ends_at, o.seat_cap, o.free_seats, o.term_months,
         o.annual_price_cents, o.monthly_price_cents, o.renews_into, o.active, o.max_locations,
         o.max_live_coupons, o.sort_order,
         public.offer_seats_in_use(o.code)::bigint,
         (select count(*) from public.offer_seat_claims c where c.offer_code = o.code and c.free)
  from public.offers o
  where auth.uid() is not null
    and ((o.active and not o.admin_only) or public.is_admin())
  order by o.sort_order, o.code;
$$;

-- An admin-only offer can be bought while inactive (only the admin "Test checkout" asks for it).
create or replace function public.begin_paid_checkout(
  p_business_id uuid,
  p_offer_code text,
  p_cycle text,
  p_amount_cents integer,
  p_invoice text,
  p_created_by uuid,
  p_hold_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers%rowtype;
  v_id uuid;
begin
  select * into v_offer from public.offers o where o.code = p_offer_code for update;
  if v_offer.code is null or not (v_offer.active or v_offer.admin_only) then
    return jsonb_build_object('result', 'no_offer');
  end if;
  if exists (select 1 from public.subscriptions s
             where s.business_id = p_business_id and s.source <> 'complimentary'
               and public.plan_is_current(s.status, s.source, s.current_period_end, s.past_due_since)) then
    return jsonb_build_object('result', 'has_plan');
  end if;
  if v_offer.seat_cap is not null and public.offer_seats_in_use(v_offer.code) >= v_offer.seat_cap then
    return jsonb_build_object('result', 'seats_gone');
  end if;
  insert into public.checkouts (business_id, offer_code, billing_cycle, amount_cents, invoice_number,
                                holds_seat, hold_expires_at, created_by)
  values (p_business_id, v_offer.code, p_cycle, p_amount_cents, p_invoice,
          v_offer.seat_cap is not null, now() + make_interval(mins => p_hold_minutes), p_created_by)
  returning id into v_id;
  return jsonb_build_object('result', 'ok', 'id', v_id);
end;
$$;
revoke execute on function public.begin_paid_checkout(uuid, text, text, integer, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.begin_paid_checkout(uuid, text, text, integer, text, uuid, integer) to service_role;
