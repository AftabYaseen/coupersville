-- Phase 2: business timezone, location coordinate read-outs, and the publish lock.

-- Coupon dates are entered as calendar days in the shop's own timezone.
alter table public.businesses
  add column timezone text not null default 'UTC';

-- Computed fields so PostgREST can return a location's pin as plain numbers: select=*,lat,lng
create or replace function public.lat(public.locations)
returns double precision
language sql
stable
set search_path = ''
as $$
  select extensions.st_y($1.geo::extensions.geometry);
$$;

create or replace function public.lng(public.locations)
returns double precision
language sql
stable
set search_path = ''
as $$
  select extensions.st_x($1.geo::extensions.geometry);
$$;

-- A coupon can only move into "published" while its business holds an active subscription.
-- Coupons already published stay published when a subscription lapses; live_coupons hides them.
create or replace function public.protect_coupon_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.featured := false;
    new.created_by := auth.uid();
  elsif new.featured is distinct from old.featured then
    raise exception 'Only an admin can feature a coupon' using errcode = '42501';
  elsif new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed' using errcode = '42501';
  end if;

  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and not public.business_is_publishable(new.business_id) then
    raise exception 'This business needs an active subscription to publish coupons'
      using errcode = 'P0001', hint = 'subscription_required';
  end if;

  return new;
end;
$$;
