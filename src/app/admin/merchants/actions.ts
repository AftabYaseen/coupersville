"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction } from "@/lib/admin";
import { deleteBusiness } from "@/lib/business-deletion";
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

// Deletes a business, after the admin types its name. See src/lib/business-deletion.ts for what is
// removed and what is kept.
export async function deleteBusinessAction(businessId: unknown, confirmInput: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(businessId);
  const confirm = z.string().max(200).safeParse(confirmInput);
  if (!id.success) return { ok: false, error: "That business could not be found." };

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;

  const { data: business } = await ctx.supabase.from("businesses").select("name").eq("id", id.data).maybeSingle();
  if (!business) return { ok: false, error: "That business could not be found." };
  if (!confirm.success || confirm.data.trim() !== business.name.trim()) {
    return { ok: false, error: "Type the business name exactly as shown to confirm." };
  }

  const result = await deleteBusiness(id.data);
  if (!result.ok) {
    if (result.reason === "not_found") return { ok: false, error: "That business could not be found." };
    return { ok: false, error: "We could not delete this business. Try again in a moment." };
  }
  if (result.mode === "deleted") redirect("/admin/merchants?deleted=1");
  refresh();
  return {
    ok: true,
    message: `${business.name} is deleted. Its name, store addresses, plan and payment records and redemption counts are kept, and it stays hidden from shoppers.`,
  };
}
