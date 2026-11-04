-- Billing Part B: paid plans through Authorize.net.
-- Card details never reach Coupersville: checkout is Accept Hosted, card updates are the hosted
-- profile page. Server code (service role) is the only writer of everything here; the seat and
-- capture steps are functions that lock rows, so each payment is captured and recorded once.
--
-- Note: the new enum value is not used anywhere in this file, so the whole file can run as one
-- transaction. Functions compare against 'complimentary' instead.

alter type public.subscription_source add value if not exists 'authorize_net';

-- 1. Payments open. Off: merchants see no payment buttons; admins can still test checkout.
alter table public.platform_settings add column payments_open boolean not null default false;

-- 2. Plan columns for paid plans and for free seats that continue with a card.
alter table public.subscriptions
  add column billing_cycle text check (billing_cycle in ('annual', 'monthly')),
  add column term_ends_at timestamptz,
  add column anet_customer_profile_id text,
  add column anet_payment_profile_id text,
  add column card_last4 text check (card_last4 ~ '^[0-9]{4}$'),
  add column card_updated_at timestamptz;
create index subscriptions_anet_customer_idx on public.subscriptions (anet_customer_profile_id);

-- 3. Paid plans get the same one-day leeway and 7-day past-due grace whatever the processor.
create or replace function public.plan_is_current(
  p_status public.subscription_status,
  p_source public.subscription_source,
  p_period_end timestamptz,
  p_past_due_since timestamptz
)
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

-- 4. Checkouts: one per Accept Hosted payment page. Seat-capped offers hold a seat while the
--    merchant pays (30 minutes), and while the payment is being confirmed.
create table public.checkouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  offer_code text not null references public.offers (code) on update cascade,
  billing_cycle text not null check (billing_cycle in ('annual', 'monthly')),
  amount_cents integer not null check (amount_cents > 0),
  invoice_number text not null unique check (length(invoice_number) <= 20),
  status text not null default 'pending'
    check (status in ('pending', 'resolving', 'captured', 'voided', 'failed', 'expired')),
  holds_seat boolean not null default false,
  hold_expires_at timestamptz,
  anet_trans_id text unique,
  resolving_until timestamptz,
  outcome text,
  resolved_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checkouts_business_idx on public.checkouts (business_id, created_at desc);
create index checkouts_open_idx on public.checkouts (status) where status in ('pending', 'resolving');
create index checkouts_offer_idx on public.checkouts (offer_code);
create index checkouts_created_by_idx on public.checkouts (created_by);
create trigger set_updated_at before update on public.checkouts for each row execute function public.set_updated_at();
alter table public.checkouts enable row level security;
create policy checkouts_select on public.checkouts for select to authenticated
  using (public.can_manage_business(business_id) or (select public.is_admin()));

-- 5. Renewal attempts. One row per plan, period and retry day (0, 1, 3, 7), claimed before the
--    card is charged, so running the job twice never charges twice. The invoice number is the
--    idempotency key sent to Authorize.net, and how an unknown result is looked up afterwards.
create table public.renewal_attempts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  period_end timestamptz not null,
  attempt_day integer not null check (attempt_day in (0, 1, 3, 7)),
  invoice_number text not null unique check (length(invoice_number) <= 20),
  status text not null default 'pending' check (status in ('pending', 'paid', 'declined', 'unknown', 'not_charged')),
  amount_cents integer not null check (amount_cents > 0),
  offer_code text not null references public.offers (code) on update cascade,
  billing_cycle text not null check (billing_cycle in ('annual', 'monthly')),
  anet_trans_id text,
  response_text text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (business_id, period_end, attempt_day)
);
create index renewal_attempts_status_idx on public.renewal_attempts (status) where status in ('pending', 'unknown');
create index renewal_attempts_offer_idx on public.renewal_attempts (offer_code);
alter table public.renewal_attempts enable row level security;
create policy renewal_attempts_select on public.renewal_attempts for select to authenticated using ((select public.is_admin()));

-- 6. Billing history. Only the last 4 digits of a card are ever stored.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  anet_trans_id text unique,
  kind text not null check (kind in ('first', 'renewal')),
  status text not null check (status in ('paid', 'declined', 'voided')),
  amount_cents integer not null check (amount_cents >= 0),
  card_last4 text check (card_last4 ~ '^[0-9]{4}$'),
  offer_code text references public.offers (code) on update cascade,
  billing_cycle text check (billing_cycle in ('annual', 'monthly')),
  period_start timestamptz,
  period_end timestamptz,
  checkout_id uuid references public.checkouts (id) on delete set null,
  renewal_attempt_id uuid references public.renewal_attempts (id) on delete set null,
  created_at timestamptz not null default now()
);
create index payments_business_idx on public.payments (business_id, created_at desc);
create index payments_checkout_idx on public.payments (checkout_id);
create index payments_attempt_idx on public.payments (renewal_attempt_id);
create index payments_offer_idx on public.payments (offer_code);
alter table public.payments enable row level security;
create policy payments_select on public.payments for select to authenticated
  using (public.can_manage_business(business_id) or (select public.is_admin()));

-- 7. Webhook notifications already handled, so a repeated delivery is ignored.
create table public.anet_events (
  id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);
alter table public.anet_events enable row level security;
-- No policies: server code only.

-- 8. Seats in use on an offer: claims plus live holds (a checkout being paid or confirmed).
create or replace function public.offer_seats_in_use(p_offer_code text, p_except_checkout uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.offer_seat_claims c where c.offer_code = p_offer_code)::integer
       + (select count(*) from public.checkouts k
          where k.offer_code = p_offer_code
            and k.holds_seat
            and k.id is distinct from p_except_checkout
            and (k.status = 'resolving' or (k.status = 'pending' and k.hold_expires_at > now())))::integer;
$$;
revoke execute on function public.offer_seats_in_use(text, uuid) from public, anon, authenticated;

-- 9. Start a checkout. Locks the offer row so two merchants cannot hold the last seat.
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
  if v_offer.code is null or not v_offer.active then
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

-- 10. Take the right to capture or void an authorised checkout. Every path (return page, webhook,
--     sweep) calls this first. Only one caller at a time gets 'capture' or 'void' (a 5-minute lease);
--     the others get 'busy' or the final state.
create or replace function public.checkout_start_resolving(p_checkout_id uuid, p_trans_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.checkouts%rowtype;
  v_offer public.offers%rowtype;
begin
  select * into v_checkout from public.checkouts k where k.id = p_checkout_id for update;
  if v_checkout.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_checkout.status in ('captured', 'voided', 'failed') then
    return jsonb_build_object('result', v_checkout.status);
  end if;
  if v_checkout.anet_trans_id is not null and v_checkout.anet_trans_id <> p_trans_id then
    return jsonb_build_object('result', 'trans_mismatch');
  end if;
  if v_checkout.status = 'resolving' and v_checkout.resolving_until > now() then
    return jsonb_build_object('result', 'busy');
  end if;

  select * into v_offer from public.offers o where o.code = v_checkout.offer_code for update;
  update public.checkouts
     set status = 'resolving', anet_trans_id = p_trans_id, resolving_until = now() + interval '5 minutes'
   where id = p_checkout_id;

  if v_checkout.holds_seat and v_offer.seat_cap is not null
     and public.offer_seats_in_use(v_offer.code, p_checkout_id) >= v_offer.seat_cap then
    return jsonb_build_object('result', 'void', 'reason', 'seats_gone');
  end if;
  return jsonb_build_object('result', 'capture');
end;
$$;
revoke execute on function public.checkout_start_resolving(uuid, text) from public, anon, authenticated;

-- 11. Record the outcome. 'captured' creates the paid seat claim (seat-capped offers), the plan and
--     the payment row in one transaction. Running it again does nothing.
create or replace function public.checkout_finish(
  p_checkout_id uuid,
  p_outcome text,
  p_note text default null,
  p_customer_profile text default null,
  p_payment_profile text default null,
  p_last4 text default null
)
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
                                    stripe_subscription_id, offer_code, billing_cycle, term_ends_at,
                                    anet_customer_profile_id, anet_payment_profile_id, card_last4, card_updated_at)
  values (v_checkout.business_id, 'authorize_net', 'active', v_end, false, null, null, v_offer.code,
          v_checkout.billing_cycle, v_term, p_customer_profile, p_payment_profile, p_last4, now())
  on conflict (business_id) do update
    set source = 'authorize_net', status = 'active', current_period_end = excluded.current_period_end,
        cancel_at_period_end = false, past_due_since = null, stripe_subscription_id = null,
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
revoke execute on function public.checkout_finish(uuid, text, text, text, text, text) from public, anon, authenticated;

-- 12. A renewal was paid: move the plan one period on from where it ended, switching to the offer
--     the attempt was priced on (Founding and Early Access renew into General). Running it again
--     does nothing.
create or replace function public.apply_renewal(p_attempt_id uuid, p_trans_id text, p_last4 text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.renewal_attempts%rowtype;
  v_plan public.subscriptions%rowtype;
  v_offer public.offers%rowtype;
  v_end timestamptz;
begin
  select * into v_attempt from public.renewal_attempts a where a.id = p_attempt_id for update;
  if v_attempt.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_attempt.status = 'paid' then
    return jsonb_build_object('result', 'already');
  end if;
  select * into v_plan from public.subscriptions s where s.business_id = v_attempt.business_id for update;
  select * into v_offer from public.offers o where o.code = v_attempt.offer_code;
  v_end := v_attempt.period_end + make_interval(months => case v_attempt.billing_cycle when 'monthly' then 1 else 12 end);

  update public.subscriptions
     set source = 'authorize_net', status = 'active', past_due_since = null, cancel_at_period_end = false,
         current_period_end = v_end, billing_cycle = v_attempt.billing_cycle,
         term_ends_at = case
           when v_plan.offer_code is distinct from v_attempt.offer_code then
             case when v_offer.term_months is null then null else v_attempt.period_end + make_interval(months => v_offer.term_months) end
           else v_plan.term_ends_at end,
         offer_code = v_attempt.offer_code,
         card_last4 = coalesce(p_last4, v_plan.card_last4)
   where business_id = v_attempt.business_id;

  update public.renewal_attempts
     set status = 'paid', anet_trans_id = p_trans_id, resolved_at = now()
   where id = p_attempt_id;

  insert into public.payments (business_id, anet_trans_id, kind, status, amount_cents, card_last4, offer_code,
                               billing_cycle, period_start, period_end, renewal_attempt_id)
  values (v_attempt.business_id, p_trans_id, 'renewal', 'paid', v_attempt.amount_cents, coalesce(p_last4, v_plan.card_last4),
          v_attempt.offer_code, v_attempt.billing_cycle, v_attempt.period_end, v_end, v_attempt.id)
  on conflict (anet_trans_id) do nothing;

  return jsonb_build_object('result', 'renewed', 'ends_at', v_end);
end;
$$;
revoke execute on function public.apply_renewal(uuid, text, text) from public, anon, authenticated;

-- 13. Free seats: same as before, plus the seat count includes paid seats being held, and the
--     12-month term is recorded so a card added later continues on General when it ends.
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
                                    past_due_since, stripe_subscription_id, offer_code, term_ends_at)
  values (p_business_id, 'complimentary', 'active', v_ends, false, null, null, v_offer.code, v_ends)
  on conflict (business_id) do update
    set source = 'complimentary',
        status = 'active',
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = false,
        past_due_since = null,
        stripe_subscription_id = null,
        offer_code = excluded.offer_code,
        term_ends_at = excluded.term_ends_at;

  if p_coupon_id is not null then
    update public.coupons set status = 'published' where id = p_coupon_id;
  end if;

  return jsonb_build_object('result', 'claimed', 'seat', v_seat, 'ends_at', v_ends);
end;
$$;

-- 14. Seats taken on the Offers page include paid seats.
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
         public.offer_seats_in_use(o.code)::bigint,
         (select count(*) from public.offer_seat_claims c where c.offer_code = o.code and c.free)
  from public.offers o
  where auth.uid() is not null
    and (o.active or public.is_admin())
  order by o.sort_order, o.code;
$$;

-- 15. Server code calls the billing functions with the service role.
grant execute on function public.offer_seats_in_use(text, uuid) to service_role;
grant execute on function public.begin_paid_checkout(uuid, text, text, integer, text, uuid, integer) to service_role;
grant execute on function public.checkout_start_resolving(uuid, text) to service_role;
grant execute on function public.checkout_finish(uuid, text, text, text, text, text) to service_role;
grant execute on function public.apply_renewal(uuid, text, text) to service_role;
