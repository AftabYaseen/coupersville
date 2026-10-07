-- Extensions and enum types

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.user_role as enum ('consumer', 'merchant', 'admin');
create type public.account_status as enum ('active', 'suspended');
create type public.stock_tint as enum ('mint', 'pink', 'sky', 'butter');
create type public.business_status as enum ('draft', 'active', 'suspended');
create type public.member_role as enum ('owner', 'manager', 'staff');
create type public.discount_type as enum ('percent', 'amount');
create type public.coupon_status as enum ('draft', 'published', 'paused');
create type public.redemption_method as enum ('qr', 'code');
create type public.subscription_source as enum ('stripe', 'complimentary');
create type public.subscription_status as enum ('active', 'past_due', 'canceled', 'expired');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
