"use server";

import { redirect } from "next/navigation";
import { absoluteUrl } from "@/lib/site";
import { requireManagedBusiness } from "@/lib/merchant";
import { planIsCurrent, planState, type PlanState } from "@/lib/billing";
import { annualPriceId, ensureStripeCustomer, getStripe, stripeConfigured, stripeCustomerFor } from "@/lib/stripe";
import type { ActionResult } from "@/lib/validation/auth";

const NOT_READY: ActionResult = { ok: false, error: "Billing is not set up yet. Contact Coupersville support." };
const STRIPE_DOWN: ActionResult = { ok: false, error: "We could not reach our payment provider. Try again in a moment." };

// Opens Stripe Checkout for the annual plan. Nothing is marked paid here: the webhook does that.
export async function startCheckout(): Promise<ActionResult> {
  if (!stripeConfigured()) return NOT_READY;
  const { business, supabase, user } = await requireManagedBusiness("/merchant/billing");

  const { data: plan } = await supabase.from("subscriptions").select("*").eq("business_id", business.id).maybeSingle();
  if (plan?.source === "stripe" && planIsCurrent(plan)) {
    return { ok: false, error: "You already have an annual plan. Use Manage billing to change your card or cancel." };
  }

  let url: string | null;
  try {
    const customer = await ensureStripeCustomer(business, user.email);
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: annualPriceId(), quantity: 1 }],
      client_reference_id: business.id,
      metadata: { business_id: business.id },
      subscription_data: { metadata: { business_id: business.id } },
      success_url: absoluteUrl("/merchant/billing/success?session_id={CHECKOUT_SESSION_ID}"),
      cancel_url: absoluteUrl("/merchant/billing?checkout=canceled"),
    });
    url = session.url;
  } catch (error) {
    console.error(`checkout for business ${business.id} failed: ${error instanceof Error ? error.message : "unknown"}`);
    return STRIPE_DOWN;
  }
  if (!url) return STRIPE_DOWN;
  redirect(url);
}

// Opens the Stripe Customer Portal: card, invoices and cancellation.
export async function openBillingPortal(): Promise<ActionResult> {
  if (!stripeConfigured()) return NOT_READY;
  const { business } = await requireManagedBusiness("/merchant/billing");
  const customer = await stripeCustomerFor(business.id);
  if (!customer) return { ok: false, error: "You have no billing account yet. Start your annual plan first." };

  let url: string;
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer,
      return_url: absoluteUrl("/merchant/billing"),
    });
    url = session.url;
  } catch (error) {
    console.error(`portal for business ${business.id} failed: ${error instanceof Error ? error.message : "unknown"}`);
    return STRIPE_DOWN;
  }
  redirect(url);
}

// Read-only, for the "Confirming your payment" page while it waits for the webhook.
export async function currentPlanState(): Promise<PlanState> {
  const { business, supabase } = await requireManagedBusiness("/merchant/billing");
  const { data: plan } = await supabase.from("subscriptions").select("*").eq("business_id", business.id).maybeSingle();
  return planState(plan);
}
