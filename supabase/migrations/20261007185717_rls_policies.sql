-- Row level security policies

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

-- categories
create policy categories_select on public.categories
  for select to anon, authenticated
  using (active or (select public.is_admin()));
create policy categories_insert on public.categories
  for insert to authenticated with check ((select public.is_admin()));
create policy categories_update on public.categories
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy categories_delete on public.categories
  for delete to authenticated using ((select public.is_admin()));

-- businesses
create policy businesses_select on public.businesses
  for select to anon, authenticated
  using (status = 'active' or public.has_business_role(id) or (select public.is_admin()));
create policy businesses_insert on public.businesses
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role in ('merchant', 'admin') and p.status = 'active'
    )
  );
create policy businesses_update on public.businesses
  for update to authenticated
  using (public.can_manage_business(id) or (select public.is_admin()))
  with check (public.can_manage_business(id) or (select public.is_admin()));
create policy businesses_delete on public.businesses
  for delete to authenticated using ((select public.is_admin()));

-- business_members
create policy business_members_select on public.business_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_business(business_id) or (select public.is_admin()));
create policy business_members_insert on public.business_members
  for insert to authenticated
  with check (public.has_business_role(business_id, array['owner']::public.member_role[]) or (select public.is_admin()));
create policy business_members_update on public.business_members
  for update to authenticated
  using (public.has_business_role(business_id, array['owner']::public.member_role[]) or (select public.is_admin()))
  with check (public.has_business_role(business_id, array['owner']::public.member_role[]) or (select public.is_admin()));
create policy business_members_delete on public.business_members
  for delete to authenticated
  using (public.has_business_role(business_id, array['owner']::public.member_role[]) or (select public.is_admin()));

-- locations
create policy locations_select on public.locations
  for select to anon, authenticated
  using (
    (active and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'active'))
    or public.has_business_role(business_id)
    or (select public.is_admin())
  );
create policy locations_insert on public.locations
  for insert to authenticated
  with check (public.can_manage_business(business_id) or (select public.is_admin()));
create policy locations_update on public.locations
  for update to authenticated
  using (public.can_manage_business(business_id) or (select public.is_admin()))
  with check (public.can_manage_business(business_id) or (select public.is_admin()));
create policy locations_delete on public.locations
  for delete to authenticated
  using (public.can_manage_business(business_id) or (select public.is_admin()));

-- coupons: consumers see live coupons, plus coupons they have redeemed (for history).
create policy coupons_select on public.coupons
  for select to anon, authenticated
  using (
    public.coupon_is_live(status, starts_at, expires_at, business_id)
    or public.can_manage_business(business_id)
    or (select public.is_admin())
    or exists (select 1 from public.redemptions r where r.coupon_id = coupons.id and r.user_id = (select auth.uid()))
  );
create policy coupons_insert on public.coupons
  for insert to authenticated
  with check (public.can_manage_business(business_id) or (select public.is_admin()));
create policy coupons_update on public.coupons
  for update to authenticated
  using (public.can_manage_business(business_id) or (select public.is_admin()))
  with check (public.can_manage_business(business_id) or (select public.is_admin()));
create policy coupons_delete on public.coupons
  for delete to authenticated
  using (public.can_manage_business(business_id) or (select public.is_admin()));

-- coupon_locations: location must belong to the coupon's business.
create policy coupon_locations_select on public.coupon_locations
  for select to anon, authenticated
  using (exists (select 1 from public.coupons c where c.id = coupon_id));
create policy coupon_locations_insert on public.coupon_locations
  for insert to authenticated
  with check (
    exists (
      select 1 from public.coupons c
      join public.locations l on l.business_id = c.business_id
      where c.id = coupon_id and l.id = location_id
        and (public.can_manage_business(c.business_id) or (select public.is_admin()))
    )
  );
create policy coupon_locations_delete on public.coupon_locations
  for delete to authenticated
  using (
    exists (
      select 1 from public.coupons c
      where c.id = coupon_id
        and (public.can_manage_business(c.business_id) or (select public.is_admin()))
    )
  );

-- favorites
create policy favorites_select on public.favorites
  for select to authenticated using (user_id = (select auth.uid()));
create policy favorites_insert on public.favorites
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy favorites_delete on public.favorites
  for delete to authenticated using (user_id = (select auth.uid()));

-- redemption_tokens: read own only. Writes happen in security definer functions.
create policy redemption_tokens_select on public.redemption_tokens
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- redemptions: read own, or your business's. Writes happen in verify_redemption.
create policy redemptions_select on public.redemptions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.can_manage_business(business_id)
    or (select public.is_admin())
  );

-- subscriptions: admins and server code write; business managers read.
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (public.can_manage_business(business_id) or (select public.is_admin()));
create policy subscriptions_insert on public.subscriptions
  for insert to authenticated with check ((select public.is_admin()));
create policy subscriptions_update on public.subscriptions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy subscriptions_delete on public.subscriptions
  for delete to authenticated using ((select public.is_admin()));

-- platform_settings
create policy platform_settings_select on public.platform_settings
  for select to anon, authenticated using (true);
create policy platform_settings_update on public.platform_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
