"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction } from "@/lib/admin";
import { endOfDayInZone, formatDay } from "@/lib/dates";
import { planEndSchema } from "@/lib/validation/admin";
import type { ActionResult } from "@/lib/validation/auth";

const NOT_FOUND: ActionResult = { ok: false, error: "That business could not be found." };
const STRIPE: ActionResult = {
  ok: false,
  error: "This business pays through Stripe, so its plan is managed there. Complimentary plans are for businesses without one.",
};
const FAILED: ActionResult = { ok: false, error: "We could not change this plan. Try again in a moment." };

type Ctx = NonNullable<Awaited<ReturnType<typeof requireAdminAction>>>;

async function load(ctx: Ctx, businessId: string) {
  const [{ data: business }, { data: plan }] = await Promise.all([
    ctx.supabase.from("businesses").select("id, name, timezone").eq("id", businessId).maybeSingle(),
    ctx.supabase.from("subscriptions").select("*").eq("business_id", businessId).maybeSingle(),
  ]);
  return { business, plan };
}

// Grants a complimentary plan, or changes when an existing one ends. A blank end date means no end.
export async function setComplimentaryPlan(businessId: unknown, endsOnInput: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(businessId);
  const endsOn = planEndSchema.safeParse(endsOnInput);
  if (!id.success) return NOT_FOUND;
  if (!endsOn.success) return { ok: false, error: "Choose a valid end date, or leave it blank for no end date." };

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;
  const { business, plan } = await load(ctx, id.data);
  if (!business) return NOT_FOUND;
  if (plan?.source === "stripe") return STRIPE;

  const endsAt = endsOn.data ? endOfDayInZone(endsOn.data, business.timezone) : null;
  if (endsAt && endsAt.getTime() <= Date.now()) {
    return { ok: false, error: "The end date has already passed. Choose a later date." };
  }

  const row = {
    business_id: business.id,
    source: "complimentary" as const,
    status: "active" as const,
    current_period_end: endsAt?.toISOString() ?? null,
    cancel_at_period_end: false,
  };
  const { error } = plan
    ? await ctx.supabase.from("subscriptions").update(row).eq("id", plan.id)
    : await ctx.supabase.from("subscriptions").insert(row);
  if (error) return FAILED;

  refresh();
  const until = endsAt ? `until ${formatDay(endsAt, business.timezone)}` : "with no end date";
  return { ok: true, message: `${business.name} has a complimentary plan ${until}.` };
}

// Adds a year from the current end date, or from today if it has already ended.
export async function extendComplimentaryPlan(businessId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(businessId);
  if (!id.success) return NOT_FOUND;

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;
  const { business, plan } = await load(ctx, id.data);
  if (!business) return NOT_FOUND;
  if (!plan) return { ok: false, error: "This business has no plan to extend. Grant one first." };
  if (plan.source === "stripe") return STRIPE;
  if (plan.status === "active" && !plan.current_period_end) {
    return { ok: false, error: "This plan has no end date, so there is nothing to extend." };
  }

  const from = Math.max(Date.now(), plan.current_period_end ? new Date(plan.current_period_end).getTime() : 0);
  const next = new Date(from);
  next.setUTCFullYear(next.getUTCFullYear() + 1);

  const { error } = await ctx.supabase
    .from("subscriptions")
    .update({ status: "active", current_period_end: next.toISOString(), cancel_at_period_end: false })
    .eq("id", plan.id);
  if (error) return FAILED;

  refresh();
  return { ok: true, message: `${business.name}'s complimentary plan now runs one more year.` };
}

// Ends a complimentary plan now. Its coupons stop showing to shoppers straight away.
export async function revokeComplimentaryPlan(businessId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(businessId);
  if (!id.success) return NOT_FOUND;

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;
  const { business, plan } = await load(ctx, id.data);
  if (!business) return NOT_FOUND;
  if (!plan || plan.status !== "active") return { ok: false, error: "This business has no active plan to revoke." };
  if (plan.source === "stripe") return STRIPE;

  const { error } = await ctx.supabase
    .from("subscriptions")
    .update({ status: "canceled", current_period_end: new Date().toISOString(), cancel_at_period_end: false })
    .eq("id", plan.id);
  if (error) return FAILED;

  refresh();
  return { ok: true, message: `${business.name}'s complimentary plan is revoked. Its coupons are hidden from shoppers.` };
}
