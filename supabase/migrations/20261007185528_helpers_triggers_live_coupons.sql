-- Role helpers, protective triggers, signup trigger, and the live coupon definition.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  );
$$;

-- True for admins and for server-side roles (service_role, postgres, security definer functions).
create or replace function public.is_privileged()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user not in ('anon', 'authenticated') or public.is_admin();
$$;

create or replace function public.has_business_role(
  p_business_id uuid,
  p_roles public.member_role[] default array['owner', 'manager', 'staff']::public.member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    join public.profiles p on p.id = m.user_id
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
      and p.status = 'active'
  );
$$;

create or replace function public.can_manage_business(p_business_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.has_business_role(p_business_id, array['owner', 'manager']::public.member_role[]);
$$;

-- Business is active and holds an active, unexpired subscription.
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
      and s.status = 'active'
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- The single definition of a live coupon. Used by the view, RLS, and redemption functions.
create or replace function public.coupon_is_live(
  p_status public.coupon_status,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_business_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status = 'published'
    and p_starts_at <= now()
    and p_expires_at > now()
    and public.business_is_publishable(p_business_id);
$$;

create view public.live_coupons
with (security_invoker = true)
as
select c.*
from public.coupons c
where public.coupon_is_live(c.status, c.starts_at, c.expires_at, c.business_id);

-- Signup: create a profile. Self-signup can choose consumer or merchant, never admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'role' = 'merchant' then 'merchant'::public.user_role
         else 'consumer'::public.user_role end,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_privileged()
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'Only an admin can change role or status' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_profile_columns
before update on public.profiles
for each row execute function public.protect_profile_columns();

create or replace function public.protect_business_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'draft';
  elsif new.status is distinct from old.status or new.owner_id is distinct from old.owner_id then
    raise exception 'Only an admin can change business status or owner' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_business_columns
before insert or update on public.businesses
for each row execute function public.protect_business_columns();

create or replace function public.add_business_owner_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.business_members (business_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (business_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

create trigger add_business_owner_member
after insert on public.businesses
for each row execute function public.add_business_owner_member();

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
  return new;
end;
$$;

create trigger protect_coupon_columns
before insert or update on public.coupons
for each row execute function public.protect_coupon_columns();

-- Trigger functions are not callable directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.add_business_owner_member() from public, anon, authenticated;
revoke execute on function public.protect_profile_columns() from public, anon, authenticated;
revoke execute on function public.protect_business_columns() from public, anon, authenticated;
revoke execute on function public.protect_coupon_columns() from public, anon, authenticated;
