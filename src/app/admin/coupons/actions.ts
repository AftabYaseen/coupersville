"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction } from "@/lib/admin";
import type { ActionResult } from "@/lib/validation/auth";

const NOT_FOUND: ActionResult = { ok: false, error: "That coupon could not be found." };

// Unpublishing pauses the coupon, which takes it away from shoppers at once.
export async function unpublishCoupon(couponId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(couponId);
  if (!id.success) return NOT_FOUND;

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;

  const { data, error } = await ctx.supabase
    .from("coupons")
    .update({ status: "paused" })
    .eq("id", id.data)
    .eq("status", "published")
    .select("title");
  if (error) return { ok: false, error: "We could not unpublish this coupon. Try again in a moment." };
  if (!data?.length) return { ok: false, error: "This coupon is not published, so there is nothing to unpublish." };

  refresh();
  return { ok: true, message: `"${data[0].title}" is unpublished. Shoppers can no longer see it.` };
}

export async function setCouponFeatured(couponId: unknown, featuredInput: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(couponId);
  const featured = z.boolean().safeParse(featuredInput);
  if (!id.success || !featured.success) return NOT_FOUND;

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;

  const { data, error } = await ctx.supabase
    .from("coupons")
    .update({ featured: featured.data })
    .eq("id", id.data)
    .select("title");
  if (error) return { ok: false, error: "We could not change Featured. Try again in a moment." };
  if (!data?.length) return NOT_FOUND;

  refresh();
  return {
    ok: true,
    message: featured.data ? `"${data[0].title}" is featured on the home page.` : `"${data[0].title}" is no longer featured.`,
  };
}
