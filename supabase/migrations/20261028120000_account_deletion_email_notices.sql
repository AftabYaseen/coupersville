-- Phase 7: account deletion and email notices.

-- A business outlives its owner's account, so its redemption records are kept.
-- Deleting the owner suspends the business (server code) and clears owner_id here.
alter table public.businesses alter column owner_id drop not null;
alter table public.businesses drop constraint businesses_owner_id_fkey;
alter table public.businesses
  add constraint businesses_owner_id_fkey
  foreign key (owner_id) references public.profiles (id) on delete set null;

-- Emails that must go out once only (welcome, plan ending, plan ended, and so on).
-- Server code claims a row before sending, so a second run of the daily job skips it.
create table public.email_notices (
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  primary key (kind, ref)
);
alter table public.email_notices enable row level security;
revoke all on public.email_notices from anon, authenticated;

-- Same signature and columns as before; a business whose owner deleted their account
-- is still listed, with no owner name or email.
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
