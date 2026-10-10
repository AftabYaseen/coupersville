"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction } from "@/lib/admin";
import type { ActionResult } from "@/lib/validation/auth";

const NOT_FOUND: ActionResult = { ok: false, error: "That coupon could not be found." };

const reasonSchema = z.preprocess(
  (v) => (v === null || v === undefined ? "" : v),
  z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v === "" ? null : v)),
);

// Unpublishing puts the coupon on hold: shoppers stop seeing it at once, and the merchant cannot
// resume or republish it. The database records who held it and when.
export async function holdCoupon(couponId: unknown, reasonInput: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(couponId);
  const reason = reasonSchema.safeParse(reasonInput);
  if (!id.success) return NOT_FOUND;
  if (!reason.success) return { ok: false, error: "Keep the reason to 500 characters or fewer." };

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;

  const { data, error } = await ctx.supabase
    .from("coupons")
    .update({ admin_hold: true, hold_reason: reason.data })
    .eq("id", id.data)
    .eq("admin_hold", false)
    .select("title");
  if (error) return { ok: false, error: "We could not unpublish this coupon. Try again in a moment." };
  if (!data?.length) return { ok: false, error: "This coupon is already unpublished by Coupersville." };

  refresh();
  return {
    ok: true,
    message: `"${data[0].title}" is unpublished. Shoppers cannot see it and the merchant cannot put it back.`,
  };
}

// Releasing returns the coupon to whatever state the merchant left it in.
export async function releaseCouponHold(couponId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(couponId);
  if (!id.success) return NOT_FOUND;

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;

  const { data, error } = await ctx.supabase
    .from("coupons")
    .update({ admin_hold: false })
    .eq("id", id.data)
    .eq("admin_hold", true)
    .select("title, status");
  if (error) return { ok: false, error: "We could not release this coupon. Try again in a moment." };
  if (!data?.length) return { ok: false, error: "This coupon is not on hold." };

  refresh();
  return {
    ok: true,
    message:
      data[0].status === "published"
        ? `"${data[0].title}" is released and live again if its dates and plan allow.`
        : `"${data[0].title}" is released. The merchant can publish it again.`,
  };
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
