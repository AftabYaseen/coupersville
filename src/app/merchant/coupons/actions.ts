"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireManagedBusiness, subscriptionIsActive } from "@/lib/merchant";
import { couponView } from "@/lib/coupons";
import { endOfDayInZone, startOfDayInZone } from "@/lib/dates";
import { COUPON_IMAGE_BUCKET, isBusinessImagePath } from "@/lib/storage";
import { couponIntentSchema, couponSchema } from "@/lib/validation/merchant";
import type { ActionResult } from "@/lib/validation/auth";
import type { PostgrestError } from "@supabase/supabase-js";

const INVALID: ActionResult = { ok: false, error: "Some details are missing or invalid. Check the form and try again." };
const FAILED: ActionResult = { ok: false, error: "We could not save this coupon. Try again in a moment." };
const PLAN_REQUIRED: ActionResult = {
  ok: false,
  error: "Your plan is not active yet, so this coupon cannot be published. Save it as a draft for now.",
};

function writeError(error: PostgrestError): ActionResult {
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

  let existing: { id: string; status: "draft" | "published" | "paused"; image_path: string | null } | null = null;
  if (id) {
    const { data } = await supabase
      .from("coupons")
      .select("id, status, image_path")
      .eq("id", id.data)
      .eq("business_id", business.id)
      .maybeSingle();
    if (!data) return { ok: false, error: "This coupon no longer exists." };
    existing = data;
  }

  let status: "draft" | "published" | "paused";
  if (intent.data === "publish") status = "published";
  else if (existing && existing.status !== "draft") status = existing.status;
  else status = "draft";

  const startsAt = startOfDayInZone(v.startsOn, tz);
  const expiresAt = endOfDayInZone(v.expiresOn, tz);
  const now = Date.now();

  if (status === "published") {
    if (expiresAt.getTime() <= now) {
      return { ok: false, error: "The end date has already passed. Choose a later end date to publish." };
    }
    if (existing?.status !== "published" && !(await planIsActive(supabase, business.id))) return PLAN_REQUIRED;
  }

  const row = {
    category_id: v.categoryId,
    title: v.title,
    description: v.description,
    discount_type: v.discountType,
    discount_value: v.discountValue,
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
    per_user_limit: v.perUserLimit,
    total_limit: v.totalLimit ?? null,
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

  const view = couponView({ status, starts_at: row.starts_at, expires_at: row.expires_at }, now);
  redirect(`/merchant/coupons?view=${view}`);
}

export async function setCouponStatus(couponId: unknown, statusInput: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(couponId);
  const status = z.enum(["published", "paused"]).safeParse(statusInput);
  if (!id.success || !status.success) return INVALID;

  const { business, supabase } = await requireManagedBusiness("/merchant/coupons");
  const { data: coupon } = await supabase
    .from("coupons")
    .select("status, expires_at")
    .eq("id", id.data)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!coupon || coupon.status === "draft") return FAILED;

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

export async function deleteDraftCoupon(couponId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(couponId);
  if (!id.success) return INVALID;

  const { business, supabase } = await requireManagedBusiness("/merchant/coupons");
  const { data: deleted, error } = await supabase
    .from("coupons")
    .delete()
    .eq("id", id.data)
    .eq("business_id", business.id)
    .eq("status", "draft")
    .select("image_path");
  if (error || !deleted?.length) return { ok: false, error: "Only drafts can be deleted. Pause a published coupon instead." };

  const image = deleted[0].image_path;
  if (image) await supabase.storage.from(COUPON_IMAGE_BUCKET).remove([image]);

  redirect("/merchant/coupons?view=draft");
}
