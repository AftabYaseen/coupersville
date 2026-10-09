"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";

const NOT_SIGNED_IN: ActionResult = { ok: false, error: "Sign in to save coupons." };

export async function saveFavorite(couponId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(couponId);
  if (!id.success) return { ok: false, error: "That coupon could not be found." };

  const user = await getSessionUser();
  if (!user || user.status !== "active") return NOT_SIGNED_IN;

  const supabase = await createClient();
  const { data: live } = await supabase.from("live_coupons").select("id").eq("id", id.data).maybeSingle();
  if (!live) return { ok: false, error: "This coupon is no longer available, so it cannot be saved." };

  const { error } = await supabase
    .from("favorites")
    .upsert({ user_id: user.id, coupon_id: id.data }, { onConflict: "user_id,coupon_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: "We could not save that coupon. Try again in a moment." };

  refresh();
  return { ok: true, message: "Saved to your list." };
}

export async function removeFavorite(couponId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(couponId);
  if (!id.success) return { ok: false, error: "That coupon could not be found." };

  const user = await getSessionUser();
  if (!user) return NOT_SIGNED_IN;

  const supabase = await createClient();
  const { error } = await supabase.from("favorites").delete().eq("user_id", user.id).eq("coupon_id", id.data);
  if (error) return { ok: false, error: "We could not remove that coupon. Try again in a moment." };

  refresh();
  return { ok: true, message: "Removed from your list." };
}
