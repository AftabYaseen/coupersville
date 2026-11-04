"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireManagedBusiness } from "@/lib/merchant";
import { notifyPlanStarted } from "@/lib/email/notices";
import { FOUNDING_OFFER, parseClaim } from "@/lib/offers";
import { loadBillingContext } from "@/lib/founding";
import { purchasableOffer, startCardPage, startCheckout } from "@/lib/paid-billing";
import { anetConfigured } from "@/lib/authorize-net";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeTimeZone } from "@/lib/dates";
import { continueTerms, purchaseTerms } from "@/lib/renewal-terms";
import type { ActionResult } from "@/lib/validation/auth";

// Claims a free Founding seat without a coupon. Only offered when the qualifying rule is
// "profile complete"; under the default rule the seat is claimed by publishing the first coupon.
// claim_founding_seat decides, race-safe, and the billing page explains the result.
export async function claimFreeSeat(): Promise<void> {
  const { business, supabase } = await requireManagedBusiness("/merchant/billing");
  const { data, error } = await supabase.rpc("claim_founding_seat", { p_business_id: business.id });
  const result = error ? "failed" : parseClaim(data);
  if (result === "claimed") await notifyPlanStarted(business.id, `founding:${business.id}`);
  redirect(`/merchant/billing?claim=${result}`);
}

export type HostedPage = { ok: true; url: string; token: string } | { ok: false; error: string };

const cycleSchema = z.enum(["annual", "monthly"]);
const CLOSED: HostedPage = { ok: false, error: "Payments are not open yet." };
const PROCESSOR: HostedPage = { ok: false, error: "We could not reach our payment processor. Try again in a moment." };

async function paymentsOpen(): Promise<boolean> {
  const { data } = await createAdminClient().from("platform_settings").select("payments_open").eq("singleton", true).maybeSingle();
  return Boolean(data?.payments_open) && anetConfigured();
}

const agreedSchema = z.string().max(4000);
const NOT_AGREED: HostedPage = { ok: false, error: "Tick the box to agree to the automatic renewal terms before you continue." };
const TERMS_CHANGED: HostedPage = { ok: false, error: "The renewal terms have changed since this page loaded. Reload Billing and review them again." };

// Records an automatic-renewal agreement: the exact wording the merchant ticked, and when.
async function recordConsent(row: {
  business_id: string;
  user_id: string;
  context: "checkout" | "add_card";
  offer_code: string;
  billing_cycle: "annual" | "monthly";
  wording: string;
}): Promise<string | null> {
  const { data, error } = await createAdminClient().from("renewal_consents").insert(row).select("id").single();
  return error ? null : data.id;
}

// Opens Accept Hosted for the current offer. Nothing is charged here: the card is authorised on
// Authorize.net's page, and captured once the payment is confirmed. The merchant must first agree
// to the automatic renewal terms shown next to the button; the wording is checked and recorded.
export async function startPlanCheckout(cycleInput: unknown, agreedInput: unknown): Promise<HostedPage> {
  const cycle = cycleSchema.safeParse(cycleInput);
  if (!cycle.success) return { ok: false, error: "Choose annual or monthly." };
  const agreed = agreedSchema.safeParse(agreedInput);
  if (!agreed.success || !agreed.data) return NOT_AGREED;
  const { business, supabase, user } = await requireManagedBusiness("/merchant/billing");
  if (!(await paymentsOpen())) return CLOSED;

  const ctx = await loadBillingContext(supabase, business.id);
  if (!ctx.publishingOpen) return { ok: false, error: "Plans open when publishing opens." };
  if (ctx.planCurrent && ctx.plan?.source !== "complimentary") return { ok: false, error: "You already have a plan." };
  const offer = purchasableOffer(ctx.current);
  if (!offer) return { ok: false, error: "There is no plan to buy right now. Billing shows what is available." };

  const next = offer.renews_into ? (ctx.offers.find((o) => o.code === offer.renews_into) ?? null) : null;
  const wording = purchaseTerms({ offer, next, cycle: cycle.data, now: Date.now(), timeZone: safeTimeZone(business.timezone) });
  if (agreed.data !== wording) return TERMS_CHANGED;
  const consentId = await recordConsent({ business_id: business.id, user_id: user.id, context: "checkout", offer_code: offer.code, billing_cycle: cycle.data, wording });
  if (!consentId) return PROCESSOR;

  const r = await startCheckout({
    businessId: business.id,
    businessName: business.name,
    offer,
    cycle: cycle.data,
    createdBy: user.id,
    email: user.email ?? null,
    returnPath: "/merchant/billing",
  });
  if (r.ok) {
    await createAdminClient().from("renewal_consents").update({ checkout_id: r.checkoutId }).eq("id", consentId);
    return { ok: true, url: r.url, token: r.token };
  }
  // Nothing was bought, so there is no agreement to keep.
  await createAdminClient().from("renewal_consents").delete().eq("id", consentId);
  if (r.reason === "seats_gone") return { ok: false, error: "The last seats on this offer have just been taken. Reload Billing to see what is available." };
  if (r.reason === "has_plan") return { ok: false, error: "You already have a plan." };
  if (r.reason === "no_price") return { ok: false, error: "This offer is annual only." };
  return PROCESSOR;
}

// Opens the hosted card page. Paid plans: "Update card". Free Founding seats: "Add card", with the
// cycle the plan continues on when the free year ends, after agreeing to those renewal terms.
export async function startCardUpdate(cycleInput: unknown, agreedInput: unknown = null): Promise<HostedPage> {
  const { business, supabase, user } = await requireManagedBusiness("/merchant/billing");
  const { data: plan } = await supabase.from("subscriptions").select("*").eq("business_id", business.id).maybeSingle();
  if (!plan) return { ok: false, error: "You have no plan to add a card to." };
  const freeSeat = plan.source === "complimentary" && plan.offer_code === FOUNDING_OFFER && plan.term_ends_at !== null;
  if (plan.source !== "authorize_net" && !freeSeat) return { ok: false, error: "This plan does not use a card." };

  let cycle: "annual" | "monthly" | undefined;
  if (freeSeat) {
    if (!(await paymentsOpen())) return CLOSED;
    const parsed = cycleSchema.safeParse(cycleInput);
    if (!parsed.success) return { ok: false, error: "Choose annual or monthly." };
    cycle = parsed.data;
    const agreed = agreedSchema.safeParse(agreedInput);
    if (!agreed.success || !agreed.data) return NOT_AGREED;
    const { data: founding } = await supabase.from("offers").select("renews_into").eq("code", FOUNDING_OFFER).maybeSingle();
    const { data: next } = await supabase.from("offers").select("*").eq("code", founding?.renews_into ?? "general").maybeSingle();
    if (!next || !plan.current_period_end) return PROCESSOR;
    const wording = continueTerms({ next, cycle, endsAt: plan.current_period_end, timeZone: safeTimeZone(business.timezone) });
    if (agreed.data !== wording) return TERMS_CHANGED;
    if (!(await recordConsent({ business_id: business.id, user_id: user.id, context: "add_card", offer_code: next.code, billing_cycle: cycle, wording }))) return PROCESSOR;
  }
  try {
    const page = await startCardPage({ businessId: business.id, businessName: business.name, email: user.email ?? null, returnPath: "/merchant/billing?card=updated", cycle });
    return page ? { ok: true, ...page } : PROCESSOR;
  } catch {
    return PROCESSOR;
  }
}

// Cancel: no more renewals; the plan lasts until the end of the period already paid for.
export async function setRenewal(renewInput: unknown): Promise<ActionResult> {
  const renew = z.boolean().safeParse(renewInput);
  if (!renew.success) return { ok: false, error: "Something went wrong. Reload and try again." };
  const { business, supabase } = await requireManagedBusiness("/merchant/billing");
  const { data: plan } = await supabase.from("subscriptions").select("*").eq("business_id", business.id).maybeSingle();
  const freeSeat = plan?.source === "complimentary" && plan.offer_code === FOUNDING_OFFER && plan.term_ends_at !== null;
  if (!plan || (plan.source !== "authorize_net" && !freeSeat) || !["active", "past_due"].includes(plan.status)) {
    return { ok: false, error: "You have no plan that renews." };
  }
  // Subscription rows are written by server code only.
  const { error } = await createAdminClient().from("subscriptions").update({ cancel_at_period_end: !renew.data }).eq("business_id", business.id);
  if (error) return { ok: false, error: "We could not change this. Try again in a moment." };
  refresh();
  return {
    ok: true,
    message: renew.data ? "Your plan will renew." : "Renewal cancelled. Your plan stays active until the end of the period you have paid for.",
  };
}
