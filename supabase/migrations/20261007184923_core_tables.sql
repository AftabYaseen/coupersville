-- Core tables. RLS is enabled here; policies live in a later migration.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'consumer',
  full_name text,
  phone text,
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  stock_tint public.stock_tint not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  primary_category_id uuid references public.categories (id) on delete set null,
  logo_path text,
  cover_path text,
  contact_email text,
  contact_phone text,
  website_url text,
  status public.business_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index businesses_owner_id_idx on public.businesses (owner_id);
create index businesses_primary_category_id_idx on public.businesses (primary_category_id);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);
create index business_members_user_id_idx on public.business_members (user_id);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  store_name text not null,
  store_number text,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text,
  postal_code text,
  geo extensions.geography(Point, 4326),
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index locations_business_id_idx on public.locations (business_id);
create index locations_geo_idx on public.locations using gist (geo);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  description text,
  discount_type public.discount_type not null,
  discount_value numeric(10, 2) not null check (discount_value > 0),
  included_products text,
  limits_text text,
  min_spend numeric(10, 2) check (min_spend is null or min_spend >= 0),
  min_qty integer check (min_qty is null or min_qty >= 1),
  max_people integer check (max_people is null or max_people >= 1),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status public.coupon_status not null default 'draft',
  image_path text,
  all_locations boolean not null default true,
  per_user_limit integer not null default 1 check (per_user_limit >= 1),
  total_limit integer check (total_limit is null or total_limit >= 1),
  featured boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_dates_check check (expires_at > starts_at),
  constraint coupons_percent_check check (discount_type <> 'percent' or discount_value <= 100)
);
create index coupons_business_id_idx on public.coupons (business_id);
create index coupons_category_id_idx on public.coupons (category_id);
create index coupons_created_by_idx on public.coupons (created_by);
create index coupons_live_idx on public.coupons (status, expires_at, starts_at);
create index coupons_featured_idx on public.coupons (featured) where featured;

create table public.coupon_locations (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (coupon_id, location_id)
);
create index coupon_locations_location_id_idx on public.coupon_locations (location_id);

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, coupon_id)
);
create index favorites_coupon_id_idx on public.favorites (coupon_id);

create table public.redemption_tokens (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  short_code text not null check (short_code ~ '^[0-9]{6}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index redemption_tokens_coupon_id_idx on public.redemption_tokens (coupon_id);
create index redemption_tokens_user_id_idx on public.redemption_tokens (user_id);
create index redemption_tokens_short_code_idx on public.redemption_tokens (short_code) where used_at is null;

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  business_id uuid not null references public.businesses (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  token_id uuid unique references public.redemption_tokens (id) on delete set null,
  method public.redemption_method not null,
  verified_by uuid references public.profiles (id) on delete set null,
  redeemed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index redemptions_coupon_user_idx on public.redemptions (coupon_id, user_id);
create index redemptions_user_id_idx on public.redemptions (user_id);
create index redemptions_business_id_idx on public.redemptions (business_id, redeemed_at desc);
create index redemptions_location_id_idx on public.redemptions (location_id);
create index redemptions_verified_by_idx on public.redemptions (verified_by);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  source public.subscription_source not null,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status public.subscription_status not null default 'active',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  redemption_method text not null default 'qr_with_code'
    check (redemption_method in ('qr_with_code', 'qr_only', 'code_only')),
  coupon_moderation text not null default 'instant'
    check (coupon_moderation in ('instant', 'review')),
  subscription_expiry text not null default 'hide_coupons'
    check (subscription_expiry in ('hide_coupons')),
  consumer_login text not null default 'browse_open'
    check (consumer_login in ('browse_open', 'login_required')),
  plans text not null default 'single_annual'
    check (plans in ('single_annual')),
  region_restriction text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at triggers
create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.businesses for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.business_members for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.locations for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.coupons for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.platform_settings for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.locations enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_locations enable row level security;
alter table public.favorites enable row level security;
alter table public.redemption_tokens enable row level security;
alter table public.redemptions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.platform_settings enable row level security;
