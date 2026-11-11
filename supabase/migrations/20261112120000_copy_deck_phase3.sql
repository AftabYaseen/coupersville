-- Copy deck phase 3 (2026-11-12).
--
-- 1. coupons.exclusions: what the offer does not cover, shown under Good to know ("None stated"
--    when empty) and to staff when they confirm a redemption. live_coupons gains it as its last
--    column (create or replace, so its grants and security_invoker stay).
-- 2. locations.country, from the reshaped merchant sign-up. Optional; older stores have none.
-- 3. business_redemption_stats adds this_month: redemptions since the 1st of this calendar month in
--    the business timezone (campaign_month). Same signature, so its grants stay.
-- 4. redemption_offer adds exclusions, so the scanner can show them before staff confirm.
-- 5. search_live_coupons gains p_business (business name contains), p_available_now (inside the
--    coupon's days and hours right now, business timezone) and the 'savings' sort. The signature
--    changes, so the old function is dropped and the new one created with the same grants. Nothing
--    else in the database calls it (checked 2026-11-12).
--
--    Biggest savings compares offers of the same kind only, since a percentage and a dollar amount
--    cannot be ranked without the price: free first, then percentage off (highest first), then
--    dollar amount off (highest first), then fixed price (lowest first), then newest.

begin;

-- 1 and 2. New columns.
alter table public.coupons
  add column exclusions text check (exclusions is null or length(exclusions) <= 500);
comment on column public.coupons.exclusions is 'What the offer does not cover. Shown under Good to know, "None stated" when empty.';

alter table public.locations
  add column country text check (country is null or length(country) <= 60);
comment on column public.locations.country is 'Optional. From the merchant sign-up form or the store form.';

-- live_coupons: same columns in the same order, exclusions added last.
create or replace view public.live_coupons
with (security_invoker = true)
as
select id, business_id, category_id, title, description, discount_type, discount_value, included_products,
       limits_text, min_spend, min_qty, max_people, starts_at, expires_at, status, image_path, all_locations,
       per_user_limit, total_limit, featured, created_by, created_at, updated_at, admin_hold, hold_reason,
       held_by, held_at, redeem_frequency, schedule_days, schedule_start, schedule_end, exclusions
from public.coupons c
where public.coupon_is_live(status, starts_at, expires_at, business_id, admin_hold);

-- 3. Redemption counts, now with this calendar month.
create or replace function public.business_redemption_stats(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with allowed as (
    select public.can_manage_business(p_business_id) or public.is_admin() as ok
  ),
  bounds as (
    select (date_trunc('day', now() at time zone b.timezone) at time zone b.timezone) as day_start,
           (public.campaign_month(b.timezone, now())::timestamp at time zone b.timezone) as month_start
    from public.businesses b
    where b.id = p_business_id
  ),
  r as (
    select red.coupon_id, red.redeemed_at
    from public.redemptions red, allowed
    where red.business_id = p_business_id and allowed.ok
  )
  select jsonb_build_object(
    'today', (select count(*) from r, bounds where r.redeemed_at >= bounds.day_start),
    'last_7_days', (select count(*) from r where r.redeemed_at >= now() - interval '7 days'),
    'this_month', (select count(*) from r, bounds where r.redeemed_at >= bounds.month_start),
    'total', (select count(*) from r),
    'by_coupon', coalesce(
      (select jsonb_object_agg(coupon_id, n) from (select coupon_id, count(*) as n from r group by coupon_id) x),
      '{}'::jsonb
    )
  );
$$;

-- 4. The offer as staff see it before confirming.
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
    'exclusions', p_coupon.exclusions,
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

-- 5. Search with the business name and available-now filters and the savings sort.
drop function public.search_live_coupons(text, text, public.discount_type, integer, text, double precision,
                                         double precision, double precision, text, boolean, integer, integer);

create function public.search_live_coupons(
  p_query text default null,
  p_category text default null,
  p_discount_type public.discount_type default null,
  p_ending_within_days integer default null,
  p_sort text default 'newest',
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_m double precision default null,
  p_place text default null,
  p_featured_only boolean default false,
  p_limit integer default 24,
  p_offset integer default 0,
  p_business text default null,
  p_available_now boolean default false
)
returns table (
  id uuid, title text, description text, discount_type public.discount_type, discount_value numeric,
  included_products text, limits_text text, min_spend numeric, min_qty integer, max_people integer,
  per_user_limit integer, starts_at timestamptz, expires_at timestamptz, created_at timestamptz, featured boolean,
  business_id uuid, business_name text, business_timezone text, category_slug text, category_name text,
  shop_label text, stock_tint public.stock_tint, store_count bigint, nearest_store text, distance_m double precision,
  total_count bigint
)
language sql
stable
set search_path = ''
as $$
  with params as (
    select
      nullif(trim(p_query), '') as term,
      nullif(trim(p_business), '') as business_term,
      nullif(trim(p_place), '') as place,
      case when p_lat is not null and p_lng is not null
        then extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
      end as pt
  ),
  pattern as (
    select
      '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%' as term_like,
      '%' || replace(replace(replace(business_term, '\', '\\'), '%', '\%'), '_', '\_') || '%' as business_like,
      place,
      pt
    from params
  ),
  base as (
    select c.*, b.name as business_name, b.timezone as business_timezone,
           cat.slug as category_slug, cat.name as category_name, cat.shop_label, cat.stock_tint,
           (now() at time zone b.timezone) as local_now
    from public.live_coupons c
    join public.businesses b on b.id = c.business_id
    join public.categories cat on cat.id = c.category_id
    cross join pattern p
    where (p_category is null or cat.slug = p_category)
      and (p_discount_type is null or c.discount_type = p_discount_type)
      and (p_ending_within_days is null or c.expires_at <= now() + make_interval(days => p_ending_within_days))
      and (not p_featured_only or c.featured)
      and (p.term_like is null
           or c.title ilike p.term_like
           or b.name ilike p.term_like
           or coalesce(c.included_products, '') ilike p.term_like)
      and (p.business_like is null or b.name ilike p.business_like)
  ),
  ranked as (
    select base.*, st.store_count, st.place_match, n.store_name as nearest_store, n.distance_m
    from base
    cross join pattern p
    left join lateral (
      select count(*) as store_count,
             bool_or(p.place is not null and (l.city ilike p.place or l.postal_code ilike p.place || '%')) as place_match
      from public.locations l
      where l.business_id = base.business_id and l.active
        and (base.all_locations or exists (
          select 1 from public.coupon_locations cl where cl.coupon_id = base.id and cl.location_id = l.id))
    ) st on true
    left join lateral (
      select l.store_name, extensions.st_distance(l.geo, p.pt) as distance_m
      from public.locations l
      where p.pt is not null and l.geo is not null
        and l.business_id = base.business_id and l.active
        and (base.all_locations or exists (
          select 1 from public.coupon_locations cl where cl.coupon_id = base.id and cl.location_id = l.id))
      order by extensions.st_distance(l.geo, p.pt)
      limit 1
    ) n on true
    where (p.place is null or coalesce(st.place_match, false))
      and (p.pt is null or p_radius_m is null or n.distance_m <= p_radius_m)
      -- Available now: inside the coupon's days and hours in the business timezone, the same test
      -- coupon_rule_problem makes when a code is requested.
      and (not p_available_now or (
        (base.schedule_days is null or extract(isodow from base.local_now)::smallint = any (base.schedule_days))
        and (base.schedule_start is null
             or (base.local_now::time >= base.schedule_start and base.local_now::time < base.schedule_end))
      ))
  )
  select id, title, description, discount_type, discount_value, included_products, limits_text,
         min_spend, min_qty, max_people, per_user_limit, starts_at, expires_at, created_at, featured,
         business_id, business_name, business_timezone, category_slug, category_name, shop_label, stock_tint,
         coalesce(store_count, 0), nearest_store, distance_m, count(*) over ()
  from ranked
  order by
    case when p_sort = 'nearest' then distance_m end asc nulls last,
    case when p_sort = 'ending_soon' then expires_at end asc,
    case when p_sort = 'savings' then
      case discount_type when 'free' then 0 when 'percent' then 1 when 'amount' then 2 else 3 end
    end asc,
    case when p_sort = 'savings' and discount_type in ('percent', 'amount') then discount_value end desc nulls last,
    case when p_sort = 'savings' and discount_type = 'fixed_price' then discount_value end asc nulls last,
    starts_at desc,
    created_at desc,
    id
  limit greatest(1, least(p_limit, 60))
  offset greatest(0, p_offset);
$$;
-- Same grants as before: anyone may search live coupons.
grant execute on function public.search_live_coupons(text, text, public.discount_type, integer, text, double precision,
                                                     double precision, double precision, text, boolean, integer, integer,
                                                     text, boolean)
  to public, anon, authenticated, service_role;

commit;
