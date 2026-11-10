"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { notifyPlanStarted } from "@/lib/email/notices";
import { NOT_ADMIN, requireAdminAction } from "@/lib/admin";
import { endOfDayInZone, formatDay } from "@/lib/dates";
import { businessLimitsSchema, enterpriseGrantSchema, planEndSchema } from "@/lib/validation/admin";
import { planIsCurrent } from "@/lib/billing";
import { ENTERPRISE_OFFER } from "@/lib/offers";
import type { ActionResult } from "@/lib/validation/auth";

const NOT_FOUND: ActionResult = { ok: false, error: "That business could not be found." };
const PAID: ActionResult = {
  ok: false,
  error: "This business has a paid plan, so it is read-only here. A complimentary plan can be granted once the paid plan lapses.",
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
  // A current paid plan is read-only here. Once it has lapsed, a complimentary plan may replace it.
  if (plan && plan.source !== "complimentary" && planIsCurrent(plan)) return PAID;

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
    past_due_since: null,
    // A new grant is not a Founding seat. Changing the end date of a running plan keeps its offer.
    ...(planIsCurrent(plan) ? {} : { offer_code: null }),
  };
  const { error } = plan
    ? await ctx.supabase.from("subscriptions").update(row).eq("id", plan.id)
    : await ctx.supabase.from("subscriptions").insert(row);
  if (error) return FAILED;

  // A new plan, not a change of end date to one that is already running.
  if (!planIsCurrent(plan)) {
    await notifyPlanStarted(business.id, `complimentary:${business.id}:${new Date().toISOString()}`);
  }

  refresh();
  const until = endsAt ? `until ${formatDay(endsAt, business.timezone)}` : "with no end date";
  return { ok: true, message: `${business.name} has a complimentary plan ${until}.` };
}

// Grants Enterprise (Custom): a complimentary plan on the enterprise offer, with its own limits.
export async function grantEnterprisePlan(businessId: unknown, input: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(businessId);
  const parsed = enterpriseGrantSchema.safeParse(input);
  if (!id.success) return NOT_FOUND;
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;
  const { business, plan } = await load(ctx, id.data);
  if (!business) return NOT_FOUND;
  if (plan && plan.source !== "complimentary" && planIsCurrent(plan)) return PAID;

  const endsAt = parsed.data.endsOn ? endOfDayInZone(parsed.data.endsOn, business.timezone) : null;
  if (endsAt && endsAt.getTime() <= Date.now()) return { ok: false, error: "The end date has already passed. Choose a later date." };

  const { error: limitsError } = await ctx.supabase.from("business_limit_overrides").upsert({
    business_id: business.id,
    max_locations: parsed.data.maxLocations,
    campaigns_per_month: parsed.data.campaignsPerMonth,
    updated_by: ctx.user.id,
  });
  if (limitsError) return FAILED;

  const row = {
    business_id: business.id,
    source: "complimentary" as const,
    status: "active" as const,
    current_period_end: endsAt?.toISOString() ?? null,
    cancel_at_period_end: false,
    past_due_since: null,
    offer_code: ENTERPRISE_OFFER,
    term_ends_at: null,
  };
  const { error } = plan
    ? await ctx.supabase.from("subscriptions").update(row).eq("id", plan.id)
    : await ctx.supabase.from("subscriptions").insert(row);
  if (error) return FAILED;

  if (!planIsCurrent(plan) || plan?.offer_code !== ENTERPRISE_OFFER) {
    await notifyPlanStarted(business.id, `enterprise:${business.id}:${new Date().toISOString()}`);
  }

  refresh();
  return { ok: true, message: `${business.name} is on Enterprise (Custom).` };
}

// Limits for one business, over its plan's. Both blank removes the override.
export async function setBusinessLimits(businessId: unknown, input: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(businessId);
  const parsed = businessLimitsSchema.safeParse(input);
  if (!id.success) return NOT_FOUND;
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;
  const { data: business } = await ctx.supabase.from("businesses").select("id, name").eq("id", id.data).maybeSingle();
  if (!business) return NOT_FOUND;

  const { maxLocations, campaignsPerMonth } = parsed.data;
  const { error } =
    maxLocations === null && campaignsPerMonth === null
      ? await ctx.supabase.from("business_limit_overrides").delete().eq("business_id", business.id)
      : await ctx.supabase
          .from("business_limit_overrides")
          .upsert({ business_id: business.id, max_locations: maxLocations, campaigns_per_month: campaignsPerMonth, updated_by: ctx.user.id });
  if (error) return { ok: false, error: "We could not save these limits. Try again in a moment." };

  refresh();
  return { ok: true, message: `Limits saved for ${business.name}.` };
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
  if (plan.source !== "complimentary") return PAID;
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
  if (plan.source !== "complimentary") return PAID;

  const { error } = await ctx.supabase
    .from("subscriptions")
    .update({ status: "canceled", current_period_end: new Date().toISOString(), cancel_at_period_end: false })
    .eq("id", plan.id);
  if (error) return FAILED;

  refresh();
  return { ok: true, message: `${business.name}'s complimentary plan is revoked. Its coupons are hidden from shoppers.` };
}
