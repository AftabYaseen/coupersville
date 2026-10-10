"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction } from "@/lib/admin";
import type { ActionResult } from "@/lib/validation/auth";

// Suspending hides every coupon: live coupons require an active business (coupon_is_live).
export async function setBusinessStatus(businessId: unknown, statusInput: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(businessId);
  const status = z.enum(["active", "suspended"]).safeParse(statusInput);
  if (!id.success || !status.success) return { ok: false, error: "That business could not be found." };

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;

  const { data: business } = await ctx.supabase.from("businesses").select("status, name").eq("id", id.data).maybeSingle();
  if (!business) return { ok: false, error: "That business could not be found." };

  if (status.data === "active" && business.status !== "suspended") {
    return {
      ok: false,
      error:
        business.status === "draft"
          ? "This business has not finished setting up. It goes live when the owner completes onboarding."
          : "This business is already active.",
    };
  }
  if (status.data === "suspended" && business.status === "suspended") {
    return { ok: false, error: "This business is already suspended." };
  }

  const { error } = await ctx.supabase.from("businesses").update({ status: status.data }).eq("id", id.data);
  if (error) return { ok: false, error: "We could not change this business. Try again in a moment." };

  refresh();
  return {
    ok: true,
    message:
      status.data === "suspended"
        ? `${business.name} is suspended. Shoppers no longer see any of its coupons.`
        : `${business.name} is active again. Its live coupons are back for shoppers if its plan is active.`,
  };
}
