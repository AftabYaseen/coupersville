-- Privacy: merchants no longer read redemption rows, which carry the shopper's user id.
-- Shoppers read their own, admins read all, and merchants get counts from business_redemption_stats.
-- Safe to run more than once.

alter policy redemptions_select on public.redemptions
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Counts only. Runs with its own rights now that merchants cannot read the rows, and returns
-- zeros to anyone who does not manage the business.
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
    select (date_trunc('day', now() at time zone b.timezone) at time zone b.timezone) as day_start
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
    'total', (select count(*) from r),
    'by_coupon', coalesce(
      (select jsonb_object_agg(coupon_id, n) from (select coupon_id, count(*) as n from r group by coupon_id) x),
      '{}'::jsonb
    )
  );
$$;

revoke execute on function public.business_redemption_stats(uuid) from public, anon;
grant execute on function public.business_redemption_stats(uuid) to authenticated;
