-- Client's final pricing sheet (2026-11-09). All values are defaults, editable on /admin/offers and
-- /admin/settings while the client confirms them.
--
-- 1. Founding Merchant gains a $12 monthly price. 12 monthly payments, then General monthly.
-- 2. Campaigns: a campaign is a coupon's FIRST publish. Each offer includes up to 4 a month, counted
--    per business per calendar month in the business's timezone. No rollover.
-- 3. Locations: the most active stores per offer is now enforced.
-- 4. Enterprise (Custom): inactive, admin-only, no checkout. Granted per business with custom limits.
-- 5. Per-business limit overrides, set by admins.
--
-- A plan with no offer (an admin's complimentary grant), or no plan yet, gets General's limits.
-- Limits refuse signed-in users. Server code and the SQL editor are not refused, but every first
-- publish is still counted.

begin;

-- 1. Offer columns and values.
alter table public.offers
  add column campaigns_per_month integer check (campaigns_per_month is null or campaigns_per_month > 0);
comment on column public.offers.campaigns_per_month is 'First publishes included per calendar month. Null is unlimited.';

update public.offers set monthly_price_cents = 1200 where code = 'founding_merchant';
update public.offers set campaigns_per_month = 4, max_locations = 1 where code in ('founding_merchant', 'early_access', 'general');
update public.offers set campaigns_per_month = 4, max_locations = 3 where code = 'merchant_plus';

insert into public.offers (code, name, window_starts_at, window_ends_at, seat_cap, free_seats, term_months,
                           annual_price_cents, monthly_price_cents, renews_into, active, admin_only, sort_order)
values ('enterprise', 'Enterprise (Custom)', null, null, null, 0, null, 0, null, null, false, true, 5)
on conflict (code) do nothing;

-- 2. The contact address shown as "More than 3 locations? Contact us".
alter table public.platform_settings
  add column enterprise_contact_email text not null default 'admin@opalqsm.com';

-- 3. Per-business overrides. A null column means "use the plan's limit".
create table public.business_limit_overrides (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  max_locations integer check (max_locations is null or max_locations > 0),
  campaigns_per_month integer check (campaigns_per_month is null or campaigns_per_month > 0),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index business_limit_overrides_updated_by_idx on public.business_limit_overrides (updated_by);
create trigger set_updated_at before update on public.business_limit_overrides
for each row execute function public.set_updated_at();
alter table public.business_limit_overrides enable row level security;
create policy business_limit_overrides_select on public.business_limit_overrides for select to authenticated
  using (public.can_manage_business(business_id) or (select public.is_admin()));
create policy business_limit_overrides_insert on public.business_limit_overrides for insert to authenticated
  with check ((select public.is_admin()));
create policy business_limit_overrides_update on public.business_limit_overrides for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy business_limit_overrides_delete on public.business_limit_overrides for delete to authenticated
  using ((select public.is_admin()));

-- 4. The campaign ledger: one row per coupon's first publish. It outlives the coupon, so deleting a
--    coupon never gives a campaign back. Only the trigger below writes here.
create table public.coupon_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  coupon_id uuid unique references public.coupons (id) on delete set null,
  month date not null,
  counted_at timestamptz not null default now()
);
create index coupon_campaigns_business_month_idx on public.coupon_campaigns (business_id, month);
alter table public.coupon_campaigns enable row level security;
create policy coupon_campaigns_select on public.coupon_campaigns for select to authenticated
  using (public.can_manage_business(business_id) or (select public.is_admin()));

-- 5. The first day of the calendar month at an instant, in a timezone. An unknown timezone counts as UTC.
create function public.campaign_month(p_timezone text, p_at timestamptz default now())
returns date
language plpgsql
stable
set search_path = ''
as $$
begin
  return date_trunc('month', p_at at time zone p_timezone)::date;
exception when others then
  return date_trunc('month', p_at at time zone 'UTC')::date;
end;
$$;
revoke execute on function public.campaign_month(text, timestamptz) from public, anon, authenticated;

-- 6. A business's limits: its override, else its plan's offer, else General. Null is unlimited.
create function public.business_effective_limits(p_business_id uuid, out max_locations integer, out campaigns_per_month integer)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(x.max_locations, o.max_locations), coalesce(x.campaigns_per_month, o.campaigns_per_month)
  from (select p_business_id as id) b
  left join public.subscriptions s on s.business_id = b.id
  left join public.offers o on o.code = coalesce(s.offer_code, 'general')
  left join public.business_limit_overrides x on x.business_id = b.id;
$$;
revoke execute on function public.business_effective_limits(uuid) from public, anon, authenticated;

-- 7. Usage and limits, for the owner, managers and admins. Null for anyone else.
create function public.business_usage(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_month date;
  v_limits record;
begin
  if auth.uid() is null or not (public.can_manage_business(p_business_id) or public.is_admin()) then
    return null;
  end if;
  select b.timezone into v_timezone from public.businesses b where b.id = p_business_id;
  if v_timezone is null then
    return null;
  end if;
  v_month := public.campaign_month(v_timezone);
  select * into v_limits from public.business_effective_limits(p_business_id);
  return jsonb_build_object(
    'locations_used', (select count(*) from public.locations l where l.business_id = p_business_id and l.active),
    'locations_limit', v_limits.max_locations,
    'campaigns_used', (select count(*) from public.coupon_campaigns c where c.business_id = p_business_id and c.month = v_month),
    'campaigns_limit', v_limits.campaigns_per_month,
    'resets_on', (v_month + interval '1 month')::date
  );
end;
$$;
revoke execute on function public.business_usage(uuid) from public, anon;
grant execute on function public.business_usage(uuid) to authenticated;

-- 8. Counts a coupon's first publish, and refuses it over the limit. Runs for every path to
--    published, including claim_founding_seat, so a free seat's first coupon counts as one. An
--    advisory lock per business makes two publishes at once queue here.
create function public.count_coupon_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date;
  v_limit integer;
  v_used integer;
begin
  if tg_op = 'UPDATE' and old.status = 'published' then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('campaigns:' || new.business_id::text, 0));
  if exists (select 1 from public.coupon_campaigns c where c.coupon_id = new.id) then
    return null;
  end if;
  select public.campaign_month(b.timezone) into v_month from public.businesses b where b.id = new.business_id;
  select l.campaigns_per_month into v_limit from public.business_effective_limits(new.business_id) l;
  select count(*) into v_used from public.coupon_campaigns c where c.business_id = new.business_id and c.month = v_month;
  if v_limit is not null and v_used >= v_limit and auth.role() = 'authenticated' then
    raise exception 'All % campaigns for this month are used', v_limit
      using errcode = 'P0001', hint = 'campaign_limit', detail = to_char(v_month + interval '1 month', 'YYYY-MM-DD');
  end if;
  insert into public.coupon_campaigns (business_id, coupon_id, month) values (new.business_id, new.id, v_month);
  return null;
end;
$$;
revoke execute on function public.count_coupon_campaign() from public, anon, authenticated;
create trigger count_coupon_campaign after insert or update of status on public.coupons
for each row when (new.status = 'published') execute function public.count_coupon_campaign();

-- Coupons already out count in the month they were created.
insert into public.coupon_campaigns (business_id, coupon_id, month)
select c.business_id, c.id, public.campaign_month(b.timezone, c.created_at)
from public.coupons c
join public.businesses b on b.id = c.business_id
where c.status <> 'draft';

-- 9. Refuses adding or reopening a store over the limit. Only active stores count.
create function public.enforce_location_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
begin
  if tg_op = 'UPDATE' and old.active and new.business_id = old.business_id then
    return new;
  end if;
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('locations:' || new.business_id::text, 0));
  select l.max_locations into v_limit from public.business_effective_limits(new.business_id) l;
  select count(*) into v_used from public.locations l where l.business_id = new.business_id and l.active and l.id <> new.id;
  if v_limit is not null and v_used >= v_limit then
    raise exception 'This plan includes up to % active locations', v_limit
      using errcode = 'P0001', hint = 'location_limit', detail = v_limit::text;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_location_limit() from public, anon, authenticated;
create trigger enforce_location_limit before insert or update of active, business_id on public.locations
for each row when (new.active) execute function public.enforce_location_limit();

-- 10. offer_overview gains the campaign limit. Its columns change, so it is dropped and recreated.
drop function public.offer_overview();
create function public.offer_overview()
returns table(code text, name text, window_starts_at timestamptz, window_ends_at timestamptz, seat_cap integer,
              free_seats integer, term_months integer, annual_price_cents integer, monthly_price_cents integer,
              renews_into text, active boolean, max_locations integer, max_live_coupons integer, campaigns_per_month integer,
              sort_order integer, seats_used bigint, free_seats_used bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.code, o.name, o.window_starts_at, o.window_ends_at, o.seat_cap, o.free_seats, o.term_months,
         o.annual_price_cents, o.monthly_price_cents, o.renews_into, o.active, o.max_locations,
         o.max_live_coupons, o.campaigns_per_month, o.sort_order,
         public.offer_seats_in_use(o.code)::bigint,
         (select count(*) from public.offer_seat_claims c where c.offer_code = o.code and c.free)
  from public.offers o
  where auth.uid() is not null
    and ((o.active and not o.admin_only) or public.is_admin())
  order by o.sort_order, o.code;
$$;
revoke execute on function public.offer_overview() from public, anon;
grant execute on function public.offer_overview() to authenticated;

-- 11. Enterprise has no checkout. Everything else in this function is unchanged.
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
  if v_offer.code is null or v_offer.code = 'enterprise' or not (v_offer.active or v_offer.admin_only) then
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

commit;
