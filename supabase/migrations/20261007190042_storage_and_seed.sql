-- Storage buckets. Object paths start with the owning business id: "<business_id>/<file>".

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos', 'logos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('coupon-images', 'coupon-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_manage_business_path(p_name text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_folder text := (storage.foldername(p_name))[1];
begin
  if v_folder is null or v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.can_manage_business(v_folder::uuid) or public.is_admin();
end;
$$;

create policy business_images_select on storage.objects
  for select to authenticated
  using (bucket_id in ('logos', 'coupon-images') and public.can_manage_business_path(name));
create policy business_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id in ('logos', 'coupon-images') and public.can_manage_business_path(name));
create policy business_images_update on storage.objects
  for update to authenticated
  using (bucket_id in ('logos', 'coupon-images') and public.can_manage_business_path(name))
  with check (bucket_id in ('logos', 'coupon-images') and public.can_manage_business_path(name));
create policy business_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id in ('logos', 'coupon-images') and public.can_manage_business_path(name));

-- Seed categories, rotating the four stock tints.
insert into public.categories (name, slug, stock_tint, sort_order)
values
  ('Restaurants', 'restaurants', 'mint', 1),
  ('Grocery', 'grocery', 'pink', 2),
  ('Bakeries', 'bakeries', 'sky', 3),
  ('Toys', 'toys', 'butter', 4),
  ('Jewelry', 'jewelry', 'mint', 5),
  ('Clothes', 'clothes', 'pink', 6),
  ('Shoes', 'shoes', 'sky', 7),
  ('Household Supplies', 'household-supplies', 'butter', 8),
  ('Pharmacy', 'pharmacy', 'mint', 9),
  ('Luggage/Bags/Wallets', 'luggage-bags-wallets', 'pink', 10),
  ('Millinery', 'millinery', 'sky', 11),
  ('Beauty', 'beauty', 'butter', 12),
  ('Other', 'other', 'mint', 13)
on conflict (slug) do nothing;

insert into public.platform_settings (singleton) values (true)
on conflict (singleton) do nothing;
