-- Phase 3: shop labels for categories, consumer search, and the saved list.

-- Each category is presented as a shop on Main Street.
alter table public.categories add column shop_label text;

update public.categories set shop_label = v.label
from (values
  ('restaurants', 'The restaurant'),
  ('grocery', 'The grocer'),
  ('bakeries', 'The bakery'),
  ('toys', 'The toy shop'),
  ('jewelry', 'The jeweler'),
  ('clothes', 'The clothes shop'),
  ('shoes', 'The shoe shop'),
  ('household-supplies', 'The general store'),
  ('pharmacy', 'The pharmacy'),
  ('luggage-bags-wallets', 'The luggage shop'),
  ('millinery', 'The hat shop'),
  ('beauty', 'The beauty salon'),
  ('other', 'Around town')
) as v(slug, label)
where categories.slug = v.slug;

update public.categories set shop_label = name where shop_label is null;
alter table public.categories alter column shop_label set not null;

-- Consumer search. Reads only from live_coupons, so nothing unpublished, paused, expired,
-- or from an unsubscribed or suspended business can be returned. Runs as the caller (RLS applies).
create or replace function public.search_live_coupons(
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
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  description text,
  discount_type public.discount_type,
  discount_value numeric,
  included_products text,
  limits_text text,
  min_spend numeric,
  min_qty integer,
  max_people integer,
  per_user_limit integer,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  featured boolean,
  business_id uuid,
  business_name text,
  business_timezone text,
  category_slug text,
  category_name text,
  shop_label text,
  stock_tint public.stock_tint,
  store_count bigint,
  nearest_store text,
  distance_m double precision,
  total_count bigint
)
language sql
stable
set search_path = ''
as $$
  with params as (
    select
      nullif(trim(p_query), '') as term,
      nullif(trim(p_place), '') as place,
      case when p_lat is not null and p_lng is not null
        then extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
      end as pt
  ),
  pattern as (
    select
      '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%' as term_like,
      place,
      pt
    from params
  ),
  base as (
    select c.*, b.name as business_name, b.timezone as business_timezone,
           cat.slug as category_slug, cat.name as category_name, cat.shop_label, cat.stock_tint
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
  )
  select id, title, description, discount_type, discount_value, included_products, limits_text,
         min_spend, min_qty, max_people, per_user_limit, starts_at, expires_at, created_at, featured,
         business_id, business_name, business_timezone, category_slug, category_name, shop_label, stock_tint,
         coalesce(store_count, 0), nearest_store, distance_m, count(*) over ()
  from ranked
  order by
    case when p_sort = 'nearest' then distance_m end asc nulls last,
    case when p_sort = 'ending_soon' then expires_at end asc,
    starts_at desc,
    created_at desc,
    id
  limit greatest(1, least(p_limit, 60))
  offset greatest(0, p_offset);
$$;

grant execute on function public.search_live_coupons(
  text, text, public.discount_type, integer, text, double precision, double precision, double precision, text, boolean, integer, integer
) to anon, authenticated;

-- The saved list, including coupons that stopped being live after they were saved.
-- Only the fields needed for a marked "ended" stub are returned, and only for the caller's own saves.
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
         public.coupon_is_live(c.status, c.starts_at, c.expires_at, c.business_id)
  from public.favorites f
  join public.coupons c on c.id = f.coupon_id
  join public.businesses b on b.id = c.business_id
  join public.categories cat on cat.id = c.category_id
  where f.user_id = auth.uid()
  order by f.created_at desc;
$$;

revoke execute on function public.my_saved_coupons() from public, anon;
grant execute on function public.my_saved_coupons() to authenticated;
