import "server-only";
import { createClient } from "@/lib/supabase/server";
import { describeLimits } from "@/lib/coupons";
import { EXPIRING_SOON_MS } from "@/lib/dates";
import type { Enums } from "@/lib/supabase/database.types";
import { NEAR_ME_RADIUS_M, PAGE_SIZE, type SearchQuery } from "@/lib/validation/search";

export type LiveCoupon = {
  id: string;
  title: string;
  description: string | null;
  discountType: Enums<"discount_type">;
  discountValue: number;
  includedProducts: string | null;
  limits: string;
  expiresAt: string;
  expiringSoon: boolean;
  businessName: string;
  timeZone: string;
  categorySlug: string;
  shopLabel: string;
  tint: Enums<"stock_tint">;
  storeText: string;
};

type SearchOptions = {
  query?: string;
  category?: string;
  discountType?: Enums<"discount_type">;
  endingWithinDays?: number;
  sort?: "newest" | "ending_soon" | "nearest";
  lat?: number;
  lng?: number;
  radiusM?: number;
  place?: string;
  featuredOnly?: boolean;
  limit?: number;
  offset?: number;
};

function miles(meters: number): string {
  const mi = meters / 1609.344;
  if (mi < 0.1) return "under 0.1 mi";
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

// Every consumer list goes through search_live_coupons, which only reads the live_coupons view.
export async function searchLiveCoupons(options: SearchOptions): Promise<{ coupons: LiveCoupon[]; total: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_live_coupons", {
    p_query: options.query,
    p_category: options.category,
    p_discount_type: options.discountType,
    p_ending_within_days: options.endingWithinDays,
    p_sort: options.sort ?? "newest",
    p_lat: options.lat,
    p_lng: options.lng,
    p_radius_m: options.radiusM,
    p_place: options.place,
    p_featured_only: options.featuredOnly ?? false,
    p_limit: options.limit ?? PAGE_SIZE,
    p_offset: options.offset ?? 0,
  });
  if (error) throw new Error("Could not load coupons");

  const now = Date.now();
  const coupons = (data ?? []).map((row): LiveCoupon => {
    const distance = row.distance_m as number | null;
    const storeCount = Number(row.store_count);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      discountType: row.discount_type,
      discountValue: Number(row.discount_value),
      includedProducts: row.included_products,
      limits: describeLimits(row),
      expiresAt: row.expires_at,
      expiringSoon: new Date(row.expires_at).getTime() - now <= EXPIRING_SOON_MS,
      businessName: row.business_name,
      timeZone: row.business_timezone,
      categorySlug: row.category_slug,
      shopLabel: row.shop_label,
      tint: row.stock_tint,
      storeText:
        distance !== null && row.nearest_store
          ? `${row.nearest_store}, ${miles(distance)} away`
          : storeCount === 1
            ? "1 store"
            : `${storeCount} stores`,
    };
  });
  return { coupons, total: data?.length ? Number(data[0].total_count) : 0 };
}

// A city or ZIP takes precedence over device location, so the two never fight.
export function searchOptionsFrom(q: SearchQuery): SearchOptions & { usingLocation: boolean } {
  const usingLocation = !q.place && q.lat !== undefined && q.lng !== undefined;
  const sort = q.sort === "nearest" && !usingLocation ? "newest" : q.sort;
  return {
    query: q.q,
    category: q.category,
    discountType: q.type,
    endingWithinDays: q.ending ? 7 : undefined,
    sort,
    lat: usingLocation ? q.lat : undefined,
    lng: usingLocation ? q.lng : undefined,
    radiusM: usingLocation ? NEAR_ME_RADIUS_M : undefined,
    place: q.place,
    limit: PAGE_SIZE,
    offset: (q.page - 1) * PAGE_SIZE,
    usingLocation,
  };
}

export async function getLiveCouponDetail(id: string) {
  const supabase = await createClient();
  const { data: coupon } = await supabase
    .from("live_coupons")
    .select(
      "*, businesses(name, description, logo_path, website_url, contact_phone, timezone), categories(slug, name, shop_label, stock_tint)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!coupon || !coupon.id || !coupon.business_id || !coupon.businesses || !coupon.categories) return null;

  let storeQuery = supabase
    .from("locations")
    .select("id, store_name, store_number, address_line1, address_line2, city, state, postal_code, phone")
    .eq("business_id", coupon.business_id)
    .eq("active", true)
    .order("store_name");
  if (!coupon.all_locations) {
    const { data: links } = await supabase.from("coupon_locations").select("location_id").eq("coupon_id", coupon.id);
    storeQuery = storeQuery.in("id", (links ?? []).map((l) => l.location_id));
  }
  const { data: stores } = await storeQuery;

  return {
    coupon,
    business: coupon.businesses,
    shop: coupon.categories,
    stores: stores ?? [],
    expiringSoon: new Date(coupon.expires_at!).getTime() - Date.now() <= EXPIRING_SOON_MS,
    limits: describeLimits(coupon),
  };
}

export async function isSaved(userId: string, couponId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", userId)
    .eq("coupon_id", couponId)
    .maybeSingle();
  return Boolean(data);
}

export async function listSaved() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_saved_coupons");
  const now = Date.now();
  return (data ?? []).map((row) => ({
    ...row,
    discount_value: Number(row.discount_value),
    ended: new Date(row.expires_at).getTime() <= now,
    expiringSoon: row.is_live && new Date(row.expires_at).getTime() - now <= EXPIRING_SOON_MS,
  }));
}

export async function listShops() {
  const supabase = await createClient();
  const [{ data: categories }, { data: live }] = await Promise.all([
    supabase.from("categories").select("id, slug, name, shop_label, stock_tint").eq("active", true).order("sort_order"),
    supabase.from("live_coupons").select("category_id"),
  ]);
  const counts = new Map<string, number>();
  for (const row of live ?? []) {
    if (row.category_id) counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }
  return (categories ?? []).map((c) => ({ ...c, liveCount: counts.get(c.id) ?? 0 }));
}

export async function getShop(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, slug, name, shop_label, stock_tint")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  return data;
}
