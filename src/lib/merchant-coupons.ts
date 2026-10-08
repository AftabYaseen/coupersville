import "server-only";
import { requireManagedBusiness } from "@/lib/merchant";
import { subscriptionIsActive } from "@/lib/merchant";
import { dayInZone } from "@/lib/dates";

type Ctx = Awaited<ReturnType<typeof requireManagedBusiness>>;

// Everything the coupon builder needs besides the coupon itself.
export async function loadCouponBuilderData({ business, supabase }: Pick<Ctx, "business" | "supabase">) {
  const [{ data: categories }, { data: locations }, { data: subscription }] = await Promise.all([
    supabase.from("categories").select("id, name, stock_tint").eq("active", true).order("sort_order"),
    supabase
      .from("locations")
      .select("id, store_name, store_number, active")
      .eq("business_id", business.id)
      .order("store_name"),
    supabase.from("subscriptions").select("*").eq("business_id", business.id).maybeSingle(),
  ]);

  const now = Date.now();
  return {
    categories: (categories ?? []).map((c) => ({ id: c.id, name: c.name, tint: c.stock_tint })),
    locations: (locations ?? []).map((l) => ({
      id: l.id,
      label: l.store_number ? `${l.store_name} #${l.store_number}` : l.store_name,
      active: l.active,
    })),
    planActive: subscriptionIsActive(subscription, now),
    today: dayInZone(now, business.timezone),
  };
}
