import "server-only";
import { redirect } from "next/navigation";
import { requireMerchantAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type Business = Tables<"businesses">;
export type Subscription = Tables<"subscriptions">;

// For owner and manager pages. Staff go to the scanner; merchants without a business go to onboarding.
export async function requireManagedBusiness(nextPath: string) {
  const { user, memberships } = await requireMerchantAccess(nextPath);
  const membership = memberships.find((m) => m.role === "owner" || m.role === "manager");

  if (!membership) {
    redirect(memberships.length === 0 ? "/merchant/onboarding" : "/merchant/scan");
  }

  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", membership.businessId)
    .single();

  if (!business || business.status === "draft") {
    redirect("/merchant/onboarding");
  }

  return { user, business, role: membership.role, supabase };
}

export async function listActiveCategories() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name, slug, stock_tint")
    .eq("active", true)
    .order("sort_order");
  return data ?? [];
}

export function listTimezones(): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

export function subscriptionIsActive(subscription: Subscription | null, now = Date.now()): boolean {
  if (!subscription || subscription.status !== "active") return false;
  return !subscription.current_period_end || new Date(subscription.current_period_end).getTime() > now;
}
