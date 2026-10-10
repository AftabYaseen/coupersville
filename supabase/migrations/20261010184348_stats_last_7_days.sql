-- Dashboard: "This week" becomes "Last 7 days" (a rolling window, not a calendar week).

create or replace function public.business_redemption_stats(p_business_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select (date_trunc('day', now() at time zone b.timezone) at time zone b.timezone) as day_start
    from public.businesses b
    where b.id = p_business_id
  ),
  r as (
    select coupon_id, redeemed_at from public.redemptions where business_id = p_business_id
  )
  select jsonb_build_object(
    'today', (select count(*) from r, bounds where r.redeemed_at >= bounds.day_start),
    'last_7_days', (select count(*) from r where r.redeemed_at >= now() - interval '7 days'),
    'total', (select count(*) from r),
    'by_coupon', coalesce(
      (select jsonb_object_agg(coupon_id, n) from (select coupon_id, count(*) as n from r group by coupon_id) x),
      '{}'::jsonb
    )
  );
$$;
