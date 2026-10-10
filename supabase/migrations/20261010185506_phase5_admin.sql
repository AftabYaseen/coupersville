-- Phase 5: admin reads. Writes go through the existing RLS policies, which allow admins everything.
-- Both functions refuse anyone who is not an active admin.

create or replace function public.admin_platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'businesses_active', (select count(*) from public.businesses where status = 'active'),
    'businesses_suspended', (select count(*) from public.businesses where status = 'suspended'),
    'businesses_draft', (select count(*) from public.businesses where status = 'draft'),
    'live_coupons', (select count(*) from public.live_coupons),
    'shoppers', (select count(*) from public.profiles where role = 'consumer'),
    'redemptions_7d', (select count(*) from public.redemptions where redeemed_at >= now() - interval '7 days'),
    'redemptions_30d', (select count(*) from public.redemptions where redeemed_at >= now() - interval '30 days'),
    'redemptions_total', (select count(*) from public.redemptions),
    'top_coupons', coalesce((
      select jsonb_agg(t order by t.redemptions desc, t.title)
      from (
        select c.id, c.title, b.name as business_name, count(*) as redemptions
        from public.redemptions r
        join public.coupons c on c.id = r.coupon_id
        join public.businesses b on b.id = c.business_id
        where r.redeemed_at >= now() - interval '30 days'
        group by c.id, c.title, b.name
        order by count(*) desc, c.title
        limit 5
      ) t
    ), '[]'::jsonb),
    'top_businesses', coalesce((
      select jsonb_agg(t order by t.redemptions desc, t.name)
      from (
        select b.id, b.name, count(*) as redemptions
        from public.redemptions r
        join public.businesses b on b.id = r.business_id
        where r.redeemed_at >= now() - interval '30 days'
        group by b.id, b.name
        order by count(*) desc, b.name
        limit 5
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

-- Merchant list with owner email, plan and counts. Search matches the business name or owner email.
create or replace function public.admin_list_businesses(
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
         coalesce(s.status = 'active' and (s.current_period_end is null or s.current_period_end > now()), false),
         (select count(*) from public.locations l where l.business_id = b.id and l.active),
         (select count(*) from public.coupons c where c.business_id = b.id),
         (select count(*) from public.live_coupons c where c.business_id = b.id),
         (select count(*) from public.redemptions r where r.business_id = b.id and r.redeemed_at >= now() - interval '30 days')
  from public.businesses b
  join public.profiles p on p.id = b.owner_id
  join auth.users u on u.id = b.owner_id
  left join public.categories cat on cat.id = b.primary_category_id
  left join public.subscriptions s on s.business_id = b.id
  where (p_status is null or b.status = p_status)
    and (v_like is null or b.name ilike v_like or u.email ilike v_like)
  order by b.created_at desc
  limit 200;
end;
$$;

revoke execute on function public.admin_platform_stats() from public, anon;
revoke execute on function public.admin_list_businesses(text, public.business_status) from public, anon;
grant execute on function public.admin_platform_stats() to authenticated;
grant execute on function public.admin_list_businesses(text, public.business_status) to authenticated;
