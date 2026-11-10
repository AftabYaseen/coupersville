"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireManagedBusiness, subscriptionIsActive } from "@/lib/merchant";
import { couponView } from "@/lib/coupons";
import { endOfDayInZone, formatDay, startOfDayInZone } from "@/lib/dates";
import { canClaimFreeSeat, loadBillingContext } from "@/lib/founding";
import { OFFER_TIME_ZONE, parseClaim } from "@/lib/offers";
import { notifyPlanStarted } from "@/lib/email/notices";
import { COUPON_IMAGE_BUCKET, IMAGE_ERROR, isBusinessImagePath } from "@/lib/storage";
import { verifyStoredImage } from "@/lib/verify-image";
import { couponIntentSchema, couponRuleColumns, couponSchema } from "@/lib/validation/merchant";
import { parseStats } from "@/lib/redemption-stats";
import { campaignLimitError } from "@/lib/limits";
import type { ActionResult } from "@/lib/validation/auth";
import type { PostgrestError } from "@supabase/supabase-js";

const INVALID: ActionResult = { ok: false, error: "Some details are missing or invalid. Check the form and try again." };
const FAILED: ActionResult = { ok: false, error: "We could not save this coupon. Try again in a moment." };
const PLAN_REQUIRED: ActionResult = {
  ok: false,
  error: "You need an active plan to publish. Save this as a draft for now. The Billing page shows your plan and the current offer.",
};
const NOT_OPEN: ActionResult = {
  ok: false,
  error: "Publishing has not opened yet. Save this as a draft for now. The Billing page shows when it opens.",
};

function notOpenYet(opensAt: string): ActionResult {
  return { ok: false, error: `Publishing opens on ${formatDay(opensAt, OFFER_TIME_ZONE)}. Save this as a draft for now.` };
}

const HELD: ActionResult = {
  ok: false,
  error: "Coupersville removed this coupon, so it cannot be published or resumed. You can still edit or delete it.",
};

function writeError(error: PostgrestError): ActionResult {
  if (error.hint === "admin_hold") return HELD;
  if (error.hint === "publishing_not_open") return NOT_OPEN;
  if (error.hint === "campaign_limit") return campaignLimitError(error.details);
  return error.hint === "subscription_required" ? PLAN_REQUIRED : FAILED;
}

async function planIsActive(supabase: Awaited<ReturnType<typeof requireManagedBusiness>>["supabase"], businessId: string) {
  const { data } = await supabase.from("subscriptions").select("*").eq("business_id", businessId).maybeSingle();
  return subscriptionIsActive(data);
}

export async function saveCoupon(couponId: unknown, input: unknown, intentInput: unknown): Promise<ActionResult> {
  const parsed = couponSchema.safeParse(input);
  const intent = couponIntentSchema.safeParse(intentInput);
  const id = couponId === null ? null : z.uuid().safeParse(couponId);
  if (!parsed.success || !intent.success || (id && !id.success)) return INVALID;

  const { business, supabase } = await requireManagedBusiness("/merchant/coupons");
  const v = parsed.data;
  const tz = business.timezone;

  if (v.imagePath && !isBusinessImagePath(v.imagePath, business.id)) {
    return { ok: false, error: "The coupon image could not be saved. Upload it again." };
  }

  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("id", v.categoryId)
    .eq("active", true)
    .maybeSingle();
  if (!category) return { ok: false, error: "That category is no longer available. Choose another." };

  const locationIds = v.allLocations ? [] : [...new Set(v.locationIds)];
  if (locationIds.length) {
    const { count } = await supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .in("id", locationIds);
    if (count !== locationIds.length) return { ok: false, error: "One of the chosen stores is not yours. Choose again." };
  }

  let existing: { id: string; status: "draft" | "published" | "paused"; image_path: string | null; admin_hold: boolean } | null =
    null;
  if (id) {
    const { data } = await supabase
      .from("coupons")
      .select("id, status, image_path, admin_hold")
      .eq("id", id.data)
      .eq("business_id", business.id)
      .maybeSingle();
    if (!data) return { ok: false, error: "This coupon no longer exists." };
    existing = data;
  }
  if (existing?.admin_hold && intent.data === "publish") return HELD;

  if (v.imagePath && v.imagePath !== existing?.image_path && !(await verifyStoredImage(supabase, COUPON_IMAGE_BUCKET, v.imagePath))) {
    return { ok: false, error: IMAGE_ERROR };
  }

  let status: "draft" | "published" | "paused";
  if (intent.data === "publish") status = "published";
  else if (existing && existing.status !== "draft") status = existing.status;
  else status = "draft";

  const startsAt = startOfDayInZone(v.startsOn, tz);
  const expiresAt = endOfDayInZone(v.expiresOn, tz);
  const now = Date.now();

  // A merchant without a plan can still publish a first coupon during the Founders window: the coupon
  // is saved as a draft, then claim_founding_seat publishes it together with a free 12-month plan.
  let claimSeat = false;
  if (status === "published") {
    if (expiresAt.getTime() <= now) {
      return { ok: false, error: "The end date has already passed. Choose a later end date to publish." };
    }
    if (existing?.status !== "published") {
      const billing = await loadBillingContext(supabase, business.id, now);
      if (!billing.publishingOpen) return notOpenYet(billing.publishingOpensAt);
      if (!billing.planCurrent) {
        if (!canClaimFreeSeat(billing, business.status, now)) return PLAN_REQUIRED;
        claimSeat = true;
        status = existing?.status ?? "draft";
      }
    }
  }

  const row = {
    category_id: v.categoryId,
    title: v.title,
    description: v.description,
    discount_type: v.discountType,
    included_products: v.includedProducts,
    limits_text: v.limitsText,
    min_spend: v.minSpend ?? null,
    min_qty: v.minQty ?? null,
    max_people: v.maxPeople ?? null,
    starts_at: startsAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    status,
    image_path: v.imagePath,
    all_locations: v.allLocations,
    total_limit: v.totalLimit ?? null,
    // Offer value, per-customer limit, frequency and schedule.
    ...couponRuleColumns(v),
  };

  const savedId = existing?.id ?? crypto.randomUUID();
  if (existing) {
    const { error } = await supabase.from("coupons").update(row).eq("id", existing.id).eq("business_id", business.id);
    if (error) return writeError(error);
  } else {
    const { error } = await supabase.from("coupons").insert({ id: savedId, business_id: business.id, ...row });
    if (error) return writeError(error);
  }

  const { error: clearError } = await supabase.from("coupon_locations").delete().eq("coupon_id", savedId);
  if (clearError) return FAILED;
  if (locationIds.length) {
    const { error } = await supabase
      .from("coupon_locations")
      .insert(locationIds.map((location_id) => ({ coupon_id: savedId, location_id })));
    if (error) return { ok: false, error: "The coupon was saved, but its stores were not. Choose them again and save." };
  }

  if (existing?.image_path && existing.image_path !== v.imagePath) {
    await supabase.storage.from(COUPON_IMAGE_BUCKET).remove([existing.image_path]);
  }

  if (claimSeat) {
    const { data, error } = await supabase.rpc("claim_founding_seat", { p_business_id: business.id, p_coupon_id: savedId });
    const result = error?.hint === "campaign_limit" ? "campaign_limit" : error ? "failed" : parseClaim(data);
    if (result !== "claimed") {
      // The coupon is saved as a draft. Billing explains why it could not go live.
      redirect(`/merchant/billing?claim=${result}`);
    }
    await notifyPlanStarted(business.id, `founding:${business.id}`);
    redirect("/merchant/billing?claim=claimed");
  }

  const view = couponView({ status, starts_at: row.starts_at, expires_at: row.expires_at, admin_hold: existing?.admin_hold }, now);
  redirect(`/merchant/coupons?view=${view}${view === "live" && status === "published" && existing?.status !== "published" ? "&published=1" : ""}`);
}

export async function setCouponStatus(couponId: unknown, statusInput: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(couponId);
  const status = z.enum(["published", "paused"]).safeParse(statusInput);
  if (!id.success || !status.success) return INVALID;

  const { business, supabase } = await requireManagedBusiness("/merchant/coupons");
  const { data: coupon } = await supabase
    .from("coupons")
    .select("status, expires_at, admin_hold")
    .eq("id", id.data)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!coupon || coupon.status === "draft") return FAILED;
  if (coupon.admin_hold) return HELD;

  if (status.data === "published") {
    if (new Date(coupon.expires_at).getTime() <= Date.now()) {
      return { ok: false, error: "This coupon has ended. Change its end date, then publish it again." };
    }
    if (!(await planIsActive(supabase, business.id))) return PLAN_REQUIRED;
  }

  const { error } = await supabase
    .from("coupons")
    .update({ status: status.data })
    .eq("id", id.data)
    .eq("business_id", business.id);
  if (error) return writeError(error);

  refresh();
  return {
    ok: true,
    message: status.data === "paused" ? "Coupon paused. Shoppers cannot see it." : "Coupon resumed.",
  };
}

// Drafts can always be deleted, and so can a coupon Coupersville removed. A removed coupon that was
// redeemed is kept, because deleting it would also delete those redemptions from the records.
export async function deleteCoupon(couponId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(couponId);
  if (!id.success) return INVALID;

  const { business, supabase } = await requireManagedBusiness("/merchant/coupons");
  const { data: coupon } = await supabase
    .from("coupons")
    .select("status, admin_hold")
    .eq("id", id.data)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!coupon) return { ok: false, error: "This coupon no longer exists." };
  if (coupon.status !== "draft" && !coupon.admin_hold) {
    return { ok: false, error: "Only drafts can be deleted. Pause a published coupon instead." };
  }
  if (coupon.admin_hold) {
    // Merchants cannot read redemption rows; the stats function gives the count.
    const { data: stats, error: statsError } = await supabase.rpc("business_redemption_stats", { p_business_id: business.id });
    if (statsError) return { ok: false, error: "We could not check this coupon. Try again in a moment." };
    if ((parseStats(stats).byCoupon[id.data] ?? 0) > 0) {
      return { ok: false, error: "This coupon has been redeemed, so it is kept for your records. Shoppers cannot see it." };
    }
  }

  const { data: deleted, error } = await supabase
    .from("coupons")
    .delete()
    .eq("id", id.data)
    .eq("business_id", business.id)
    .select("image_path");
  if (error || !deleted?.length) return { ok: false, error: "We could not delete this coupon. Try again in a moment." };

  const image = deleted[0].image_path;
  if (image) await supabase.storage.from(COUPON_IMAGE_BUCKET).remove([image]);

  redirect(coupon.admin_hold ? "/merchant/coupons" : "/merchant/coupons?view=draft");
}
