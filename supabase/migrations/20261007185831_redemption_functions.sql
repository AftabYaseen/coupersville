-- Atomic redemption. Both functions return jsonb: { "result": "<code>", ... }.
-- create_redemption_token results: ok, not_authenticated, account_suspended, not_live, user_limit_reached, total_limit_reached
-- verify_redemption results: ok, not_authenticated, location_not_found, not_member, not_found, wrong_business,
--   already_used, expired, coupon_not_live, location_not_eligible, user_limit_reached, total_limit_reached

create or replace function public.create_redemption_token(p_coupon_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_coupon public.coupons;
  v_used integer;
  v_total integer;
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
  if not found or not public.coupon_is_live(v_coupon.status, v_coupon.starts_at, v_coupon.expires_at, v_coupon.business_id) then
    return jsonb_build_object('result', 'not_live');
  end if;

  select count(*) into v_used from public.redemptions where coupon_id = p_coupon_id and user_id = v_uid;
  if v_used >= v_coupon.per_user_limit then
    return jsonb_build_object('result', 'user_limit_reached');
  end if;

  if v_coupon.total_limit is not null then
    select count(*) into v_total from public.redemptions where coupon_id = p_coupon_id;
    if v_total >= v_coupon.total_limit then
      return jsonb_build_object('result', 'total_limit_reached');
    end if;
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

create or replace function public.verify_redemption(p_token_or_code text, p_location_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_input text := trim(coalesce(p_token_or_code, ''));
  v_method public.redemption_method;
  v_location public.locations;
  v_token public.redemption_tokens;
  v_coupon public.coupons;
  v_used integer;
  v_total integer;
  v_redemption_id uuid;
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

  if v_input ~ '^[0-9]{6}$' then
    v_method := 'code';
    select t.* into v_token
    from public.redemption_tokens t
    join public.coupons c on c.id = t.coupon_id
    where t.short_code = v_input and c.business_id = v_location.business_id
    order by t.created_at desc
    limit 1
    for update of t;

    if not found then
      if exists (
        select 1 from public.redemption_tokens
        where short_code = v_input and used_at is null and expires_at > now()
      ) then
        return jsonb_build_object('result', 'wrong_business');
      end if;
      return jsonb_build_object('result', 'not_found');
    end if;
  else
    v_method := 'qr';
    select * into v_token from public.redemption_tokens where token = v_input for update;
    if not found then
      return jsonb_build_object('result', 'not_found');
    end if;
  end if;

  -- Lock the coupon so concurrent verifications cannot exceed total_limit.
  select * into v_coupon from public.coupons where id = v_token.coupon_id for update;

  if v_coupon.business_id <> v_location.business_id then
    return jsonb_build_object('result', 'wrong_business');
  end if;

  if v_token.used_at is not null then
    return jsonb_build_object('result', 'already_used', 'used_at', v_token.used_at);
  end if;

  if v_token.expires_at <= now() then
    return jsonb_build_object('result', 'expired');
  end if;

  if not public.coupon_is_live(v_coupon.status, v_coupon.starts_at, v_coupon.expires_at, v_coupon.business_id) then
    return jsonb_build_object('result', 'coupon_not_live');
  end if;

  if not v_coupon.all_locations and not exists (
    select 1 from public.coupon_locations
    where coupon_id = v_coupon.id and location_id = v_location.id
  ) then
    return jsonb_build_object('result', 'location_not_eligible');
  end if;

  select count(*) into v_used from public.redemptions
  where coupon_id = v_coupon.id and user_id = v_token.user_id;
  if v_used >= v_coupon.per_user_limit then
    return jsonb_build_object('result', 'user_limit_reached');
  end if;

  if v_coupon.total_limit is not null then
    select count(*) into v_total from public.redemptions where coupon_id = v_coupon.id;
    if v_total >= v_coupon.total_limit then
      return jsonb_build_object('result', 'total_limit_reached');
    end if;
  end if;

  update public.redemption_tokens set used_at = now() where id = v_token.id;

  insert into public.redemptions (coupon_id, user_id, business_id, location_id, token_id, method, verified_by)
  values (v_coupon.id, v_token.user_id, v_coupon.business_id, v_location.id, v_token.id, v_method, v_uid)
  returning id into v_redemption_id;

  return jsonb_build_object(
    'result', 'ok',
    'redemption_id', v_redemption_id,
    'coupon_id', v_coupon.id,
    'title', v_coupon.title,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'min_spend', v_coupon.min_spend,
    'min_qty', v_coupon.min_qty,
    'limits_text', v_coupon.limits_text
  );
end;
$$;

revoke execute on function public.create_redemption_token(uuid) from public, anon;
revoke execute on function public.verify_redemption(text, uuid) from public, anon;
grant execute on function public.create_redemption_token(uuid) to authenticated;
grant execute on function public.verify_redemption(text, uuid) to authenticated;
