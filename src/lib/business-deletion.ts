import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { offerNames } from "@/lib/offer-names";

// An admin deletes a business.
//
// With no payments, no redemptions and no Founding seat it is deleted completely: the business,
// its stores, coupons, team, invites and plan, and every image it uploaded.
//
// Otherwise only what accounting, disputes and fraud prevention need is kept: the business name,
// store addresses, plan and payment records, the Founding seat (seats are never given back), and
// the coupons that were redeemed, so redemption counts stay right. Everything else goes: the
// description, contact email, phone and website, store phone numbers, images, coupons nobody
// redeemed, the team and staff invites. The business stays suspended with no owner, and its plan
// does not renew.

export type BusinessDeletionPlan = { mode: "delete" | "keep_records"; reasons: string[] };
export type BusinessDeletionResult =
  | { ok: true; mode: "deleted" | "kept_records" }
  | { ok: false; reason: "not_found" | "failed" };

const BUCKETS = ["logos", "coupon-images"] as const;

async function count(admin: SupabaseClient, table: string, businessId: string): Promise<number> {
  const { count: n, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq("business_id", businessId);
  if (error) throw new Error(`count ${table}: ${error.code}`);
  return n ?? 0;
}

// What deleting this business would do, and why.
export async function businessDeletionPlan(businessId: string): Promise<BusinessDeletionPlan> {
  // Untyped: payments is a billing table this check reads by name.
  const admin = createAdminClient() as unknown as SupabaseClient;
  const [redemptions, payments, seats, { data: plan }] = await Promise.all([
    count(admin, "redemptions", businessId),
    count(admin, "payments", businessId),
    count(admin, "offer_seat_claims", businessId),
    admin.from("subscriptions").select("source").eq("business_id", businessId).maybeSingle(),
  ]);
  const reasons: string[] = [];
  if (redemptions) reasons.push(redemptions === 1 ? "1 redemption" : `${redemptions} redemptions`);
  if (payments || (plan && plan.source !== "complimentary")) reasons.push("payment records");
  if (seats) reasons.push(`a ${(await offerNames()).founding} seat`);
  return { mode: reasons.length ? "keep_records" : "delete", reasons };
}

async function removeImages(businessId: string): Promise<boolean> {
  const storage = createAdminClient().storage;
  for (const bucket of BUCKETS) {
    for (;;) {
      const { data, error } = await storage.from(bucket).list(businessId, { limit: 100 });
      if (error) return false;
      if (!data?.length) break;
      const { error: removeError } = await storage.from(bucket).remove(data.map((f) => `${businessId}/${f.name}`));
      if (removeError) return false;
      if (data.length < 100) break;
    }
  }
  return true;
}

export async function deleteBusiness(businessId: string): Promise<BusinessDeletionResult> {
  const admin = createAdminClient();
  const { data: business } = await admin.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!business) return { ok: false, reason: "not_found" };

  let decision: BusinessDeletionPlan;
  try {
    decision = await businessDeletionPlan(businessId);
  } catch {
    return { ok: false, reason: "failed" };
  }
  if (!(await removeImages(businessId))) return { ok: false, reason: "failed" };

  if (decision.mode === "delete") {
    // Cascades remove stores, coupons, team, invites, plan and anything else tied to the business.
    const { error } = await admin.from("businesses").delete().eq("id", businessId);
    return error ? { ok: false, reason: "failed" } : { ok: true, mode: "deleted" };
  }

  const { data: redeemed } = await admin.from("redemptions").select("coupon_id").eq("business_id", businessId);
  const keepCoupons = [...new Set((redeemed ?? []).map((r) => r.coupon_id))];
  let unredeemed = admin.from("coupons").delete().eq("business_id", businessId);
  if (keepCoupons.length) unredeemed = unredeemed.not("id", "in", `(${keepCoupons.join(",")})`);

  const steps = await Promise.all([
    admin
      .from("businesses")
      .update({ status: "suspended", owner_id: null, description: null, contact_email: null, contact_phone: null, website_url: null, logo_path: null, cover_path: null })
      .eq("id", businessId),
    admin.from("locations").update({ phone: null, active: false }).eq("business_id", businessId),
    admin.from("business_members").delete().eq("business_id", businessId),
    admin.from("staff_invites").delete().eq("business_id", businessId),
    admin.from("subscriptions").update({ cancel_at_period_end: true }).eq("business_id", businessId),
  ]);
  const couponsGone = await unredeemed;
  const couponsKept = await admin.from("coupons").update({ status: "paused", image_path: null }).eq("business_id", businessId);
  if (steps.some((s) => s.error) || couponsGone.error || couponsKept.error) return { ok: false, reason: "failed" };
  return { ok: true, mode: "kept_records" };
}
