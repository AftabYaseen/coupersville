-- Phase 6: Stripe billing.
-- The webhook handler (server code with the secret key) is the only writer of Stripe plan state.

-- One Stripe customer per business, reused for every checkout and portal session.
create table public.billing_customers (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);
alter table public.billing_customers enable row level security;
create policy billing_customers_select on public.billing_customers
  for select to authenticated
  using (public.can_manage_business(business_id) or (select public.is_admin()));
-- No insert, update or delete policies: only server code writes here.

-- Webhook events already handled, so a repeated delivery is ignored.
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
-- No policies: only server code reads or writes here.

-- When a Stripe plan became past due. Coupons stay live for 7 days from here.
alter table public.subscriptions add column past_due_since timestamptz;

-- The single rule for whether a plan lets coupons go live.
--   Active: until its end date. Stripe plans get one extra day, so a renewal webhook arriving a
--   little late never hides coupons.
--   Past due (Stripe only): for 7 days after the payment failed, then treated as expired.
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
           or p_period_end > now() - case when p_source = 'stripe' then interval '1 day' else interval '0' end))
    or (p_status = 'past_due'
      and p_source = 'stripe'
      and p_past_due_since is not null
      and p_past_due_since > now() - interval '7 days'),
    false
  );
$$;

create or replace function public.business_is_publishable(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.businesses b
    join public.subscriptions s on s.business_id = b.id
    where b.id = p_business_id
      and b.status = 'active'
      and public.plan_is_current(s.status, s.source, s.current_period_end, s.past_due_since)
  );
$$;

-- Same signature and columns as before; plan_active now follows plan_is_current.
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
