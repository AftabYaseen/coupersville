-- Phase 4: redemption preview and verify, shopper redemption reads, Realtime, staff invites, stats.
-- Result codes for preview_redemption and verify_redemption:
--   ok, not_authenticated, location_not_found, not_member, not_found, wrong_business, already_used,
--   expired, coupon_not_live, location_not_eligible, user_limit_reached, total_limit_reached

-- 1. Shared redemption checks ------------------------------------------------------------------

-- Turns what staff scanned or typed into a token id, looking only inside their own business.
-- A 6-digit code prefers an active token; an older used or expired token with the same code is
-- only matched when no active one exists, so it reports "already used" or "expired" honestly.
create or replace function public.resolve_redemption_input(
  p_input text,
  p_business_id uuid,
  out token_id uuid,
  out method public.redemption_method,
  out problem text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_input text := lower(trim(coalesce(p_input, '')));
begin
  if v_input ~ '^[0-9]{6}$' then
    method := 'code';
    select t.id into token_id
    from public.redemption_tokens t
    join public.coupons c on c.id = t.coupon_id
    where t.short_code = v_input and c.business_id = p_business_id
    order by (t.used_at is null and t.expires_at > now()) desc, t.created_at desc
    limit 1;

    if token_id is null then
      problem := case
        when exists (
          select 1 from public.redemption_tokens
          where short_code = v_input and used_at is null and expires_at > now()
        ) then 'wrong_business'
        else 'not_found'
      end;
    end if;
  elsif v_input ~ '^[0-9a-f]{48}$' then
    method := 'qr';
    select t.id into token_id from public.redemption_tokens t where t.token = v_input;
    if token_id is null then
      problem := 'not_found';
    end if;
  else
    method := case when v_input ~ '^[0-9]+$' then 'code' else 'qr' end::public.redemption_method;
    problem := 'not_found';
  end if;
end;
$$;

-- Every rule a redemption must pass. Returns null when it may go ahead.
-- Volatile so each count reads the latest committed rows after the caller has taken its locks.
create or replace function public.redemption_problem(
  p_token public.redemption_tokens,
  p_coupon public.coupons,
  p_location public.locations
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_used integer;
  v_total integer;
begin
  if p_coupon.business_id <> p_location.business_id then
    return 'wrong_business';
  end if;
  if p_token.used_at is not null then
    return 'already_used';
  end if;
  if p_token.expires_at <= now() then
    return 'expired';
  end if;
  if not public.coupon_is_live(p_coupon.status, p_coupon.starts_at, p_coupon.expires_at, p_coupon.business_id) then
    return 'coupon_not_live';
  end if;
  if not p_coupon.all_locations and not exists (
    select 1 from public.coupon_locations
    where coupon_id = p_coupon.id and location_id = p_location.id
  ) then
    return 'location_not_eligible';
  end if;

  select count(*) into v_used from public.redemptions
  where coupon_id = p_coupon.id and user_id = p_token.user_id;
  if v_used >= p_coupon.per_user_limit then
    return 'user_limit_reached';
  end if;

  if p_coupon.total_limit is not null then
    select count(*) into v_total from public.redemptions where coupon_id = p_coupon.id;
    if v_total >= p_coupon.total_limit then
      return 'total_limit_reached';
    end if;
  end if;

  return null;
end;
$$;

-- What staff check by eye on the confirm screen. Only built for the caller's own business.
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
    'min_spend', p_coupon.min_spend,
    'min_qty', p_coupon.min_qty,
    'max_people', p_coupon.max_people,
    'per_user_limit', p_coupon.per_user_limit,
    'stock_tint', (select cat.stock_tint from public.categories cat where cat.id = p_coupon.category_id)
  );
$$;

-- 2. Preview: the confirm screen. Runs every check, records nothing. ----------------------------

create or replace function public.preview_redemption(p_token_or_code text, p_location_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_location public.locations;
  v_found record;
  v_token public.redemption_tokens;
  v_coupon public.coupons;
  v_problem text;
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('result', 'not_authenticated');
  end if;

  select * into v_location from public.locations where id = p_location_id and active;
  if not found then
    return jsonb_build_object('result', 'location_not_found');
  end if;
  if not public.has_business_role(v_location.business_id) then
    return jsonb_build_object('result', 'not_member');
  end if;

  select * into v_found from public.resolve_redemption_input(p_token_or_code, v_location.business_id);
  if v_found.problem is not null then
    return jsonb_build_object('result', v_found.problem, 'method', v_found.method);
  end if;

  select * into v_token from public.redemption_tokens where id = v_found.token_id;
  select * into v_coupon from public.coupons where id = v_token.coupon_id;

  v_problem := public.redemption_problem(v_token, v_coupon, v_location);
  v_result := jsonb_build_object(
    'result', coalesce(v_problem, 'ok'),
    'method', v_found.method,
    'store_name', v_location.store_name
  );

  -- Never describe another business's coupon.
  if v_problem is distinct from 'wrong_business' then
    v_result := v_result || jsonb_build_object(
      'offer', public.redemption_offer(v_coupon),
      'used_at', v_token.used_at,
      'expires_at', v_token.expires_at
    );
  end if;
  return v_result;
end;
$$;

-- 3. Verify: the only writer of redemptions. ----------------------------------------------------
-- Lock order is always token, then coupon. The token lock makes a second verify of the same token
-- wait and then see used_at; the coupon lock serialises every verify for that coupon, so the
-- per-user and total counts cannot be overtaken by a concurrent insert.

create or replace function public.verify_redemption(p_token_or_code text, p_location_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_location public.locations;
  v_found record;
  v_token public.redemption_tokens;
  v_coupon public.coupons;
  v_problem text;
  v_redemption public.redemptions;
begin
  if v_uid is null then
    return jsonb_build_object('result', 'not_authenticated');
  end if;

  select * into v_location from public.locations where id = p_location_id and active;
  if not found then
    return jsonb_build_object('result', 'location_not_found');
  end if;
  if not public.has_business_role(v_location.business_id) then
    return jsonb_build_object('result', 'not_member');
  end if;

  select * into v_found from public.resolve_redemption_input(p_token_or_code, v_location.business_id);
  if v_found.problem is not null then
    return jsonb_build_object('result', v_found.problem, 'method', v_found.method);
  end if;

  select * into v_token from public.redemption_tokens where id = v_found.token_id for update;
  select * into v_coupon from public.coupons where id = v_token.coupon_id for update;

  v_problem := public.redemption_problem(v_token, v_coupon, v_location);
  if v_problem is not null then
    if v_problem = 'already_used' then
      return jsonb_build_object('result', v_problem, 'method', v_found.method, 'used_at', v_token.used_at);
    end if;
    return jsonb_build_object('result', v_problem, 'method', v_found.method);
  end if;

  update public.redemption_tokens set used_at = now() where id = v_token.id;

  insert into public.redemptions (coupon_id, user_id, business_id, location_id, token_id, method, verified_by)
  values (v_coupon.id, v_token.user_id, v_coupon.business_id, v_location.id, v_token.id, v_found.method, v_uid)
  returning * into v_redemption;

  return jsonb_build_object(
    'result', 'ok',
    'method', v_found.method,
    'redemption_id', v_redemption.id,
    'redeemed_at', v_redemption.redeemed_at,
    'store_name', v_location.store_name,
    'offer', public.redemption_offer(v_coupon)
  );
end;
$$;

-- 4. Shopper reads ------------------------------------------------------------------------------

-- One of the caller's own tokens, with what the redeem screen shows. Works after the coupon
-- stops being live, so a just-redeemed or expired screen still renders.
create or replace function public.my_redemption_token(p_token_id uuid)
returns table (
  token_id uuid,
  token text,
  short_code text,
  expires_at timestamptz,
  used_at timestamptz,
  coupon_id uuid,
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
  coupon_expires_at timestamptz,
  business_name text,
  business_timezone text,
  stock_tint public.stock_tint,
  store_count bigint,
  only_store text,
  redeemed_at timestamptz,
  redeemed_store text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.token, t.short_code, t.expires_at, t.used_at,
         c.id, c.title, c.description, c.discount_type, c.discount_value, c.included_products, c.limits_text,
         c.min_spend, c.min_qty, c.max_people, c.per_user_limit, c.expires_at,
         b.name, b.timezone, cat.stock_tint,
         st.n, st.only_store,
         r.redeemed_at, rl.store_name
  from public.redemption_tokens t
  join public.coupons c on c.id = t.coupon_id
  join public.businesses b on b.id = c.business_id
  join public.categories cat on cat.id = c.category_id
  left join public.redemptions r on r.token_id = t.id
  left join public.locations rl on rl.id = r.location_id
  left join lateral (
    select count(*) as n, min(l.store_name) as only_store
    from public.locations l
    where l.business_id = c.business_id and l.active
      and (c.all_locations or exists (
        select 1 from public.coupon_locations cl where cl.coupon_id = c.id and cl.location_id = l.id))
  ) st on true
  where t.id = p_token_id and t.user_id = auth.uid();
$$;

create or replace function public.my_redemptions()
returns table (
  redemption_id uuid,
  redeemed_at timestamptz,
  method public.redemption_method,
  coupon_id uuid,
  title text,
  discount_type public.discount_type,
  discount_value numeric,
  business_name text,
  business_timezone text,
  store_name text,
  store_number text,
  store_city text,
  stock_tint public.stock_tint,
  coupon_is_live boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.redeemed_at, r.method,
         c.id, c.title, c.discount_type, c.discount_value,
         b.name, b.timezone,
         l.store_name, l.store_number, l.city,
         cat.stock_tint,
         public.coupon_is_live(c.status, c.starts_at, c.expires_at, c.business_id)
  from public.redemptions r
  join public.coupons c on c.id = r.coupon_id
  join public.businesses b on b.id = r.business_id
  join public.categories cat on cat.id = c.category_id
  left join public.locations l on l.id = r.location_id
  where r.user_id = auth.uid()
  order by r.redeemed_at desc
  limit 500;
$$;

-- The redeem screen listens for its redemption row. RLS limits each listener to rows it can read.
alter publication supabase_realtime add table public.redemptions;

-- 5. Staff --------------------------------------------------------------------------------------

create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254 and position('@' in email) > 1),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by uuid references public.profiles (id) on delete set null default auth.uid(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index staff_invites_pending_email_idx on public.staff_invites (business_id, email) where accepted_at is null;
create index staff_invites_invited_by_idx on public.staff_invites (invited_by);
create index staff_invites_accepted_by_idx on public.staff_invites (accepted_by);
create trigger set_updated_at before update on public.staff_invites for each row execute function public.set_updated_at();
alter table public.staff_invites enable row level security;

-- Owners manage their invites. Accepting happens in accept_staff_invite.
create policy staff_invites_select on public.staff_invites
  for select to authenticated
  using (public.has_business_role(business_id, array['owner']::public.member_role[]) or (select public.is_admin()));
create policy staff_invites_insert on public.staff_invites
  for insert to authenticated
  with check (
    (public.has_business_role(business_id, array['owner']::public.member_role[]) or (select public.is_admin()))
    and invited_by = (select auth.uid())
    and accepted_at is null
    and accepted_by is null
  );
create policy staff_invites_delete on public.staff_invites
  for delete to authenticated
  using (public.has_business_role(business_id, array['owner']::public.member_role[]) or (select public.is_admin()));

-- An owner can add and remove staff, but nobody except an admin or server code can remove, demote,
-- or add an owner, or move a membership to another person or business.
create or replace function public.protect_owner_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_privileged() then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      raise exception 'The business owner cannot be removed' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.role = 'owner' then
      raise exception 'Only an admin can add an owner' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.role = 'owner' or new.role = 'owner'
     or new.user_id is distinct from old.user_id
     or new.business_id is distinct from old.business_id then
    raise exception 'This membership change needs an admin' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_owner_membership
before insert or update or delete on public.business_members
for each row execute function public.protect_owner_membership();

-- Shown on the join page, including to signed-out visitors holding the link.
create or replace function public.staff_invite_details(p_token text)
returns table (business_name text, masked_email text, expired boolean, accepted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select b.name,
         left(i.email, 1) || repeat('*', greatest(char_length(split_part(i.email, '@', 1)) - 1, 2)) || '@' || split_part(i.email, '@', 2),
         i.expires_at <= now(),
         i.accepted_at is not null
  from public.staff_invites i
  join public.businesses b on b.id = i.business_id
  where i.token = lower(trim(coalesce(p_token, '')));
$$;

-- Results: ok, not_authenticated, account_suspended, not_found, expired, already_accepted,
--   email_not_confirmed, email_mismatch. "ok" includes already_member when they were on the team.
create or replace function public.accept_staff_invite(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.staff_invites;
  v_email text;
  v_confirmed timestamptz;
  v_already boolean;
begin
  if v_uid is null then
    return jsonb_build_object('result', 'not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and status = 'active') then
    return jsonb_build_object('result', 'account_suspended');
  end if;

  select * into v_invite from public.staff_invites where token = lower(trim(coalesce(p_token, ''))) for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_invite.accepted_at is not null then
    return jsonb_build_object('result', case when v_invite.accepted_by = v_uid then 'ok' else 'already_accepted' end,
                              'business_id', v_invite.business_id);
  end if;
  if v_invite.expires_at <= now() then
    return jsonb_build_object('result', 'expired');
  end if;

  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_uid;
  if v_confirmed is null then
    return jsonb_build_object('result', 'email_not_confirmed');
  end if;
  if v_email is distinct from v_invite.email then
    return jsonb_build_object('result', 'email_mismatch');
  end if;

  v_already := exists (
    select 1 from public.business_members where business_id = v_invite.business_id and user_id = v_uid
  );
  if not v_already then
    insert into public.business_members (business_id, user_id, role)
    values (v_invite.business_id, v_uid, 'staff');
  end if;

  update public.staff_invites set accepted_at = now(), accepted_by = v_uid where id = v_invite.id;

  return jsonb_build_object('result', 'ok', 'business_id', v_invite.business_id, 'already_member', v_already);
end;
$$;

-- The team list for owners and managers, with each member's sign-in email.
create or replace function public.business_team(p_business_id uuid)
returns table (member_id uuid, user_id uuid, role public.member_role, full_name text, email text, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.user_id, m.role, p.full_name, u.email, m.created_at
  from public.business_members m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.business_id = p_business_id
    and (public.can_manage_business(p_business_id) or public.is_admin())
  order by case m.role when 'owner' then 0 when 'manager' then 1 else 2 end, m.created_at;
$$;

-- 6. Stats --------------------------------------------------------------------------------------

-- Today and this week (from Monday) are calendar periods in the business timezone.
-- Runs as the caller, so RLS limits it to businesses they manage.
create or replace function public.business_redemption_stats(p_business_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select (date_trunc('day', now() at time zone b.timezone) at time zone b.timezone) as day_start,
           (date_trunc('week', now() at time zone b.timezone) at time zone b.timezone) as week_start
    from public.businesses b
    where b.id = p_business_id
  ),
  r as (
    select coupon_id, redeemed_at from public.redemptions where business_id = p_business_id
  )
  select jsonb_build_object(
    'today', (select count(*) from r, bounds where r.redeemed_at >= bounds.day_start),
    'week', (select count(*) from r, bounds where r.redeemed_at >= bounds.week_start),
    'total', (select count(*) from r),
    'by_coupon', coalesce(
      (select jsonb_object_agg(coupon_id, n) from (select coupon_id, count(*) as n from r group by coupon_id) x),
      '{}'::jsonb
    )
  );
$$;

-- 7. Grants -------------------------------------------------------------------------------------

revoke execute on function public.resolve_redemption_input(text, uuid) from public, anon, authenticated;
revoke execute on function public.redemption_problem(public.redemption_tokens, public.coupons, public.locations) from public, anon, authenticated;
revoke execute on function public.redemption_offer(public.coupons) from public, anon, authenticated;
revoke execute on function public.protect_owner_membership() from public, anon, authenticated;

revoke execute on function public.preview_redemption(text, uuid) from public, anon;
revoke execute on function public.verify_redemption(text, uuid) from public, anon;
revoke execute on function public.my_redemption_token(uuid) from public, anon;
revoke execute on function public.my_redemptions() from public, anon;
revoke execute on function public.accept_staff_invite(text) from public, anon;
revoke execute on function public.business_team(uuid) from public, anon;
revoke execute on function public.business_redemption_stats(uuid) from public, anon;
grant execute on function public.preview_redemption(text, uuid) to authenticated;
grant execute on function public.verify_redemption(text, uuid) to authenticated;
grant execute on function public.my_redemption_token(uuid) to authenticated;
grant execute on function public.my_redemptions() to authenticated;
grant execute on function public.accept_staff_invite(text) to authenticated;
grant execute on function public.business_team(uuid) to authenticated;
grant execute on function public.business_redemption_stats(uuid) to authenticated;
grant execute on function public.staff_invite_details(text) to anon, authenticated;
