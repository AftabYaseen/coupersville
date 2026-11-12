-- Client changes, 2026-11-12.
--
-- 1. Campaign allowance per location. Each offer now sets campaigns per location per month
--    (Pioneer Circle, Early Bird, Main Street 10; Boulevard 20). A business's monthly allowance is
--    that number times its open (active) stores. An admin override is still one total per business.
--    Still counted by calendar month in the business's timezone, resetting on the 1st.
--
-- 2. Just for You private offers. A coupon is either public (everyone) or private (one customer).
--    A private coupon:
--      - never appears in live_coupons, so it is left out of the home page, search, categories,
--        Explore, featured rows and the sitemap, and the coupons table hides it from shoppers;
--      - opens only through private_offer(key), with a random 128-bit key that is set by the
--        database and never changes;
--      - is redeemed once in total (total_limit is fixed at 1), with every other rule still applied;
--      - counts towards its own monthly allowance (offers.private_offers_per_month, default 10), or
--        towards the campaign allowance when platform_settings.private_offers_count_as_campaigns is on.
--    Who can see a coupon cannot change once it has been published.

begin;

-- 1. Offers: campaigns per location, and the Just for You allowance.
alter table public.offers rename column campaigns_per_month to campaigns_per_location;
comment on column public.offers.campaigns_per_location is
  'Campaigns (first publishes) per open location per calendar month. The business allowance is this times its active stores. Null is unlimited.';
update public.offers set campaigns_per_location = 10 where code in ('founding_merchant', 'early_access', 'general');
update public.offers set campaigns_per_location = 20 where code = 'merchant_plus';

alter table public.offers
  add column private_offers_per_month integer default 10
    check (private_offers_per_month is null or private_offers_per_month > 0);
comment on column public.offers.private_offers_per_month is
  'Just for You offers a business may publish per calendar month, when they do not count as campaigns. Null is unlimited.';

comment on column public.business_limit_overrides.campaigns_per_month is
  'Total campaigns per calendar month for this business, replacing campaigns per location times open stores. Null uses the plan.';

-- 2. The setting: do Just for You offers count towards the campaign allowance? Off by default.
alter table public.platform_settings
  add column private_offers_count_as_campaigns boolean not null default false;

-- 3. Coupons: who can see it, and the private link's key.
create type public.coupon_visibility as enum ('public', 'private');
alter table public.coupons
  add column visibility public.coupon_visibility not null default 'public',
  add column private_key text unique;
alter table public.coupons
  add constraint coupons_private_offer_rules check (
    (visibility = 'public' and private_key is null)
    or (visibility = 'private' and private_key ~ '^[0-9a-f]{32}$' and total_limit = 1 and not featured)
  );
comment on column public.coupons.visibility is 'public: listed for everyone. private: Just for You, opened only by its private link.';
comment on column public.coupons.private_key is 'Random key in the Just for You link. Set by the database, never changes.';

-- 4. The campaign ledger records which allowance each first publish used.
alter table public.coupon_campaigns
  add column kind text not null default 'campaign' check (kind in ('campaign', 'private'));
comment on column public.coupon_campaigns.kind is 'campaign: counted towards the campaign allowance. private: a Just for You offer counted on its own.';

-- 5. live_coupons: public coupons only. Same columns as before.
create or replace view public.live_coupons with (security_invoker = true) as
  select c.id, c.business_id, c.category_id, c.title, c.description, c.discount_type, c.discount_value,
         c.included_products, c.limits_text, c.min_spend, c.min_qty, c.max_people, c.starts_at, c.expires_at,
         c.status, c.image_path, c.all_locations, c.per_user_limit, c.total_limit, c.featured, c.created_by,
         c.created_at, c.updated_at, c.admin_hold, c.hold_reason, c.held_by, c.held_at, c.redeem_frequency,
         c.schedule_days, c.schedule_start, c.schedule_end, c.exclusions
  from public.coupons c
  where public.coupon_is_live(c.status, c.starts_at, c.expires_at, c.business_id, c.admin_hold)
    and c.visibility = 'public';

-- 6. Shoppers read public live coupons only. The owner's team, admins and a shopper who redeemed it
--    still read the row.
drop policy coupons_select on public.coupons;
create policy coupons_select on public.coupons for select to anon, authenticated
  using (
    (visibility = 'public' and public.coupon_is_live(status, starts_at, expires_at, business_id, admin_hold))
    or public.can_manage_business(business_id)
    or (select public.is_admin())
    or exists (select 1 from public.redemptions r where r.coupon_id = coupons.id and r.user_id = (select auth.uid()))
  );

-- A Just for You offer cannot be saved to a list.
drop policy favorites_insert on public.favorites;
create policy favorites_insert on public.favorites for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.coupons c where c.id = favorites.coupon_id and c.visibility = 'public')
  );

-- 7. Column protection: the Just for You rules first, for everyone, then the existing checks.
create or replace function public.protect_coupon_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.visibility is distinct from old.visibility
     and exists (select 1 from public.coupon_campaigns cc where cc.coupon_id = old.id) then
    raise exception 'Who can see this offer cannot change after it is published'
      using errcode = 'P0001', hint = 'visibility_locked';
  end if;

  if new.visibility = 'private' then
    new.total_limit := 1;
    new.featured := false;
    if tg_op = 'UPDATE' and old.visibility = 'private' and old.private_key is not null then
      new.private_key := old.private_key;
    else
      new.private_key := encode(extensions.gen_random_bytes(16), 'hex');
    end if;
  else
    new.private_key := null;
  end if;

  if public.is_privileged() then
    if tg_op = 'UPDATE' and new.admin_hold is distinct from old.admin_hold then
      if new.admin_hold then
        new.held_by := coalesce(auth.uid(), new.held_by);
        new.held_at := now();
      else
        new.hold_reason := null;
        new.held_by := null;
        new.held_at := null;
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.featured := false;
    new.created_by := auth.uid();
    new.admin_hold := false;
    new.hold_reason := null;
    new.held_by := null;
    new.held_at := null;
  else
    if new.featured is distinct from old.featured then
      raise exception 'Only an admin can feature a coupon' using errcode = '42501';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'created_by cannot be changed' using errcode = '42501';
    end if;
    if new.admin_hold is distinct from old.admin_hold
       or new.hold_reason is distinct from old.hold_reason
       or new.held_by is distinct from old.held_by
       or new.held_at is distinct from old.held_at then
      raise exception 'Only Coupersville can place or release a hold'
        using errcode = '42501', hint = 'admin_hold';
    end if;
    if old.admin_hold and new.status = 'published' and old.status is distinct from 'published' then
      raise exception 'Coupersville removed this coupon, so it cannot be published'
        using errcode = '42501', hint = 'admin_hold';
    end if;
  end if;

  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if now() < (select s.publishing_opens_at from public.platform_settings s limit 1) then
      raise exception 'Publishing has not opened yet'
        using errcode = 'P0001', hint = 'publishing_not_open';
    end if;
    if not public.business_is_publishable(new.business_id) then
      raise exception 'This business needs an active plan to publish coupons'
        using errcode = 'P0001', hint = 'subscription_required';
    end if;
  end if;

  return new;
end;
$$;

-- 8. A business's limits. The campaign allowance is the override, else campaigns per location
--    times open stores. Its out columns change, so it is dropped and recreated.
drop function public.business_effective_limits(uuid);
create function public.business_effective_limits(
  p_business_id uuid,
  out max_locations integer,
  out campaigns_per_month integer,
  out campaigns_per_location integer,
  out open_locations integer,
  out campaigns_override boolean,
  out private_offers_per_month integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(x.max_locations, o.max_locations),
         coalesce(x.campaigns_per_month, o.campaigns_per_location * n.open_locations),
         o.campaigns_per_location,
         n.open_locations,
         x.campaigns_per_month is not null,
         o.private_offers_per_month
  from (select p_business_id as id) b
  left join public.subscriptions s on s.business_id = b.id
  left join public.offers o on o.code = coalesce(s.offer_code, 'general')
  left join public.business_limit_overrides x on x.business_id = b.id
  cross join lateral (
    select count(*)::integer as open_locations from public.locations l where l.business_id = b.id and l.active
  ) n;
$$;
revoke execute on function public.business_effective_limits(uuid) from public, anon, authenticated;

-- 9. Usage for the owner, managers and admins. Null for anyone else.
create or replace function public.business_usage(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_month date;
  v_limits record;
begin
  if auth.uid() is null or not (public.can_manage_business(p_business_id) or public.is_admin()) then
    return null;
  end if;
  select b.timezone into v_timezone from public.businesses b where b.id = p_business_id;
  if v_timezone is null then
    return null;
  end if;
  v_month := public.campaign_month(v_timezone);
  select * into v_limits from public.business_effective_limits(p_business_id);
  return jsonb_build_object(
    'locations_used', v_limits.open_locations,
    'locations_limit', v_limits.max_locations,
    'campaigns_used', (select count(*) from public.coupon_campaigns c
                       where c.business_id = p_business_id and c.month = v_month and c.kind = 'campaign'),
    'campaigns_limit', v_limits.campaigns_per_month,
    'campaigns_per_location', v_limits.campaigns_per_location,
    'campaigns_override', v_limits.campaigns_override,
    'private_used', (select count(*) from public.coupon_campaigns c
                     where c.business_id = p_business_id and c.month = v_month and c.kind = 'private'),
    'private_limit', v_limits.private_offers_per_month,
    'private_counts_as_campaigns', coalesce((select s.private_offers_count_as_campaigns from public.platform_settings s limit 1), false),
    'resets_on', (v_month + interval '1 month')::date
  );
end;
$$;

-- 10. Counts a coupon's first publish against the right allowance, and refuses it over the limit.
create or replace function public.count_coupon_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date;
  v_kind text := 'campaign';
  v_limits record;
  v_limit integer;
  v_used integer;
begin
  if tg_op = 'UPDATE' and old.status = 'published' then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('campaigns:' || new.business_id::text, 0));
  if exists (select 1 from public.coupon_campaigns c where c.coupon_id = new.id) then
    return null;
  end if;
  if new.visibility = 'private'
     and not coalesce((select s.private_offers_count_as_campaigns from public.platform_settings s limit 1), false) then
    v_kind := 'private';
  end if;
  select public.campaign_month(b.timezone) into v_month from public.businesses b where b.id = new.business_id;
  select * into v_limits from public.business_effective_limits(new.business_id);
  v_limit := case when v_kind = 'private' then v_limits.private_offers_per_month else v_limits.campaigns_per_month end;
  select count(*) into v_used from public.coupon_campaigns c
  where c.business_id = new.business_id and c.month = v_month and c.kind = v_kind;
  if v_limit is not null and v_used >= v_limit and auth.role() = 'authenticated' then
    if v_kind = 'private' then
      raise exception 'All % Just for You offers for this month are used', v_limit
        using errcode = 'P0001', hint = 'private_limit', detail = to_char(v_month + interval '1 month', 'YYYY-MM-DD');
    end if;
    raise exception 'All % campaigns for this month are used', v_limit
      using errcode = 'P0001', hint = 'campaign_limit', detail = to_char(v_month + interval '1 month', 'YYYY-MM-DD');
  end if;
  insert into public.coupon_campaigns (business_id, coupon_id, month, kind) values (new.business_id, new.id, v_month, v_kind);
  return null;
end;
$$;

-- 11. offer_overview: the renamed column and the Just for You allowance.
drop function public.offer_overview();
create function public.offer_overview()
returns table(code text, name text, window_starts_at timestamptz, window_ends_at timestamptz, seat_cap integer,
              free_seats integer, term_months integer, annual_price_cents integer, monthly_price_cents integer,
              renews_into text, active boolean, max_locations integer, max_live_coupons integer,
              campaigns_per_location integer, private_offers_per_month integer,
              sort_order integer, seats_used bigint, free_seats_used bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.code, o.name, o.window_starts_at, o.window_ends_at, o.seat_cap, o.free_seats, o.term_months,
         o.annual_price_cents, o.monthly_price_cents, o.renews_into, o.active, o.max_locations,
         o.max_live_coupons, o.campaigns_per_location, o.private_offers_per_month, o.sort_order,
         public.offer_seats_in_use(o.code)::bigint,
         (select count(*) from public.offer_seat_claims c where c.offer_code = o.code and c.free)
  from public.offers o
  where auth.uid() is not null
    and ((o.active and not o.admin_only) or public.is_admin())
  order by o.sort_order, o.code;
$$;
revoke execute on function public.offer_overview() from public, anon;
grant execute on function public.offer_overview() to authenticated;

-- 12. Staff see that a coupon is Just for You on the confirm screen.
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
    'exclusions', p_coupon.exclusions,
    'min_spend', p_coupon.min_spend,
    'min_qty', p_coupon.min_qty,
    'max_people', p_coupon.max_people,
    'per_user_limit', p_coupon.per_user_limit,
    'redeem_frequency', p_coupon.redeem_frequency,
    'schedule_days', p_coupon.schedule_days,
    'schedule_start', p_coupon.schedule_start,
    'schedule_end', p_coupon.schedule_end,
    'just_for_you', p_coupon.visibility = 'private',
    'timezone', (select b.timezone from public.businesses b where b.id = p_coupon.business_id),
    'stock_tint', (select cat.stock_tint from public.categories cat where cat.id = p_coupon.category_id)
  );
$$;
revoke execute on function public.redemption_offer(public.coupons) from public, anon, authenticated;

-- 13. A code for a Just for You offer needs its private key, so its id alone gets nothing.
--     The single use is the total_limit of 1, checked here and again under lock in verify_redemption.
drop function public.create_redemption_token(uuid);
create function public.create_redemption_token(p_coupon_id uuid, p_private_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_coupon public.coupons;
  v_problem text;
  v_code text;
  v_token text;
  v_row public.redemption_tokens;
begin
  if v_uid is null then
    return jsonb_build_object('result', 'not_authenticated');
  end if;

  if not exists (select 1 from public.profiles where id = v_uid and status = 'active') then
    return jsonb_build_object('result', 'account_suspended');
  end if;

  select * into v_coupon from public.coupons where id = p_coupon_id;
  if not found
     or not public.coupon_is_live(v_coupon.status, v_coupon.starts_at, v_coupon.expires_at, v_coupon.business_id, v_coupon.admin_hold)
     or (v_coupon.visibility = 'private' and p_private_key is distinct from v_coupon.private_key) then
    return jsonb_build_object('result', 'not_live');
  end if;

  v_problem := public.coupon_rule_problem(v_coupon, v_uid);
  if v_problem is not null then
    return jsonb_build_object('result', v_problem);
  end if;

  -- Retire this user's earlier unused tokens for the same coupon.
  update public.redemption_tokens
     set expires_at = now()
   where coupon_id = p_coupon_id and user_id = v_uid and used_at is null and expires_at > now();

  -- Serialise code generation so two active tokens never share a short code.
  perform pg_advisory_xact_lock(hashtext('redemption_short_code'));
  loop
    v_code := lpad((abs(('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::int::bigint) % 1000000)::text, 6, '0');
    exit when not exists (
      select 1 from public.redemption_tokens
      where short_code = v_code and used_at is null and expires_at > now()
    );
  end loop;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.redemption_tokens (coupon_id, user_id, token, short_code, expires_at)
  values (p_coupon_id, v_uid, v_token, v_code, now() + interval '5 minutes')
  returning * into v_row;

  return jsonb_build_object(
    'result', 'ok',
    'token_id', v_row.id,
    'token', v_row.token,
    'short_code', v_row.short_code,
    'expires_at', v_row.expires_at
  );
end;
$$;
revoke execute on function public.create_redemption_token(uuid, text) from public, anon;
grant execute on function public.create_redemption_token(uuid, text) to authenticated;

-- 14. The Just for You page. Anyone with the link can open it; signing in is needed to redeem.
--     state: live, scheduled (not started yet), used (redeemed), ended, or unavailable (paused,
--     removed by Coupersville, or the business has no current plan). A draft or an unknown key is null.
--     Full details only while live or scheduled.
create function public.private_offer(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_coupon public.coupons;
  v_business public.businesses;
  v_category public.categories;
  v_state text;
  v_result jsonb;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{32}$' then
    return null;
  end if;
  select * into v_coupon from public.coupons c where c.private_key = p_key and c.visibility = 'private';
  if not found or v_coupon.status = 'draft' then
    return null;
  end if;
  select * into v_business from public.businesses b where b.id = v_coupon.business_id;
  select * into v_category from public.categories cat where cat.id = v_coupon.category_id;

  v_state := case
    when exists (select 1 from public.redemptions r where r.coupon_id = v_coupon.id) then 'used'
    when v_coupon.admin_hold then 'unavailable'
    when v_coupon.expires_at <= now() then 'ended'
    when public.coupon_is_live(v_coupon.status, v_coupon.starts_at, v_coupon.expires_at, v_coupon.business_id, v_coupon.admin_hold) then 'live'
    when v_coupon.status = 'published' and v_coupon.starts_at > now()
         and public.coupon_is_live(v_coupon.status, now(), v_coupon.expires_at, v_coupon.business_id, v_coupon.admin_hold) then 'scheduled'
    else 'unavailable'
  end;

  v_result := jsonb_build_object(
    'state', v_state,
    'title', v_coupon.title,
    'business_name', v_business.name,
    'starts_at', v_coupon.starts_at,
    'timezone', v_business.timezone
  );
  if v_state not in ('live', 'scheduled') then
    return v_result;
  end if;

  return v_result || jsonb_build_object(
    'coupon_id', v_coupon.id,
    'description', v_coupon.description,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'included_products', v_coupon.included_products,
    'limits_text', v_coupon.limits_text,
    'exclusions', v_coupon.exclusions,
    'min_spend', v_coupon.min_spend,
    'min_qty', v_coupon.min_qty,
    'max_people', v_coupon.max_people,
    'per_user_limit', v_coupon.per_user_limit,
    'redeem_frequency', v_coupon.redeem_frequency,
    'schedule_days', v_coupon.schedule_days,
    'schedule_start', v_coupon.schedule_start,
    'schedule_end', v_coupon.schedule_end,
    'total_limit', v_coupon.total_limit,
    'expires_at', v_coupon.expires_at,
    'image_path', v_coupon.image_path,
    'all_locations', v_coupon.all_locations,
    'business', jsonb_build_object(
      'name', v_business.name,
      'description', v_business.description,
      'logo_path', v_business.logo_path,
      'website_url', v_business.website_url,
      'contact_phone', v_business.contact_phone
    ),
    'category', jsonb_build_object('slug', v_category.slug, 'name', v_category.name, 'stock_tint', v_category.stock_tint),
    'stores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'store_name', l.store_name, 'store_number', l.store_number,
        'address_line1', l.address_line1, 'address_line2', l.address_line2, 'city', l.city,
        'state', l.state, 'postal_code', l.postal_code, 'country', l.country, 'phone', l.phone
      ) order by l.store_name)
      from public.locations l
      where l.business_id = v_coupon.business_id and l.active
        and (v_coupon.all_locations or exists (
          select 1 from public.coupon_locations cl where cl.coupon_id = v_coupon.id and cl.location_id = l.id))
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.private_offer(text) from public;
grant execute on function public.private_offer(text) to anon, authenticated;

-- 15. The redeem screen links a Just for You offer back to its private page, and Get a new code
--     needs its key. Only the shopper's own codes are returned, and they already had the link.
drop function public.my_redemption_token(uuid);
create function public.my_redemption_token(p_token_id uuid)
returns table(token_id uuid, token text, short_code text, expires_at timestamptz, used_at timestamptz, coupon_id uuid,
              title text, description text, discount_type public.discount_type, discount_value numeric,
              included_products text, limits_text text, min_spend numeric, min_qty integer, max_people integer,
              per_user_limit integer, coupon_expires_at timestamptz, business_name text, business_timezone text,
              stock_tint public.stock_tint, store_count bigint, only_store text, redeemed_at timestamptz,
              redeemed_store text, private_key text)
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
         r.redeemed_at, rl.store_name,
         c.private_key
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
revoke execute on function public.my_redemption_token(uuid) from public, anon;
grant execute on function public.my_redemption_token(uuid) to authenticated;

-- History links a coupon only while it is publicly live. A Just for You offer is used up once
-- redeemed, so it is never linked.
create or replace function public.my_redemptions()
returns table(redemption_id uuid, redeemed_at timestamptz, method public.redemption_method, coupon_id uuid, title text,
              discount_type public.discount_type, discount_value numeric, business_name text, business_timezone text,
              store_name text, store_number text, store_city text, stock_tint public.stock_tint, coupon_is_live boolean)
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
         c.visibility = 'public' and public.coupon_is_live(c.status, c.starts_at, c.expires_at, c.business_id, c.admin_hold)
  from public.redemptions r
  join public.coupons c on c.id = r.coupon_id
  join public.businesses b on b.id = r.business_id
  join public.categories cat on cat.id = c.category_id
  left join public.locations l on l.id = r.location_id
  where r.user_id = auth.uid()
  order by r.redeemed_at desc
  limit 500;
$$;
revoke execute on function public.my_redemptions() from public, anon;
grant execute on function public.my_redemptions() to authenticated;

commit;
