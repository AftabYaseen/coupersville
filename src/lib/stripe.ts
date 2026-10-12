import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_ANNUAL_PRICE_ID);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key, { appInfo: { name: "Coupersville" } });
  return client;
}

export function annualPriceId(): string {
  const id = process.env.STRIPE_ANNUAL_PRICE_ID;
  if (!id) throw new Error("STRIPE_ANNUAL_PRICE_ID is not set");
  return id;
}

// Link for admins. Test-mode objects live under /test in the dashboard.
export function stripeCustomerUrl(customerId: string): string {
  const test = (process.env.STRIPE_SECRET_KEY ?? "").includes("_test_");
  return `https://dashboard.stripe.com${test ? "/test" : ""}/customers/${encodeURIComponent(customerId)}`;
}

// "$99 a year", read from Stripe so the page never disagrees with Checkout. Null if Stripe is unreachable.
export async function annualPriceLabel(): Promise<string | null> {
  try {
    const price = await getStripe().prices.retrieve(annualPriceId());
    if (price.unit_amount === null || !price.recurring) return null;
    const amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency.toUpperCase(),
      minimumFractionDigits: price.unit_amount % 100 === 0 ? 0 : 2,
    }).format(price.unit_amount / 100);
    return price.recurring.interval === "year" && price.recurring.interval_count === 1 ? `${amount} a year` : amount;
  } catch {
    return null;
  }
}

// The business's one Stripe customer, created on first use. The idempotency key stops two quick
// clicks from making two customers.
export async function ensureStripeCustomer(business: { id: string; name: string; contact_email: string | null }, fallbackEmail: string | null) {
  const admin = createAdminClient();
  const stripe = getStripe();

  const { data: existing } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("business_id", business.id)
    .maybeSingle();
  if (existing) {
    const customer = await stripe.customers.retrieve(existing.stripe_customer_id);
    if (!customer.deleted) return existing.stripe_customer_id;
  }

  const customer = await stripe.customers.create(
    {
      name: business.name,
      email: business.contact_email ?? fallbackEmail ?? undefined,
      metadata: { business_id: business.id },
    },
    { idempotencyKey: `coupersville-customer-${business.id}-${existing ? "replace" : "first"}` },
  );

  if (existing) {
    await admin.from("billing_customers").update({ stripe_customer_id: customer.id }).eq("business_id", business.id);
    return customer.id;
  }
  const { error } = await admin.from("billing_customers").insert({ business_id: business.id, stripe_customer_id: customer.id });
  if (error && error.code !== "23505") throw new Error("Could not save the billing customer");
  const { data: saved } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("business_id", business.id)
    .single();
  return saved?.stripe_customer_id ?? customer.id;
}

export async function stripeCustomerFor(businessId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("billing_customers").select("stripe_customer_id").eq("business_id", businessId).maybeSingle();
  return data?.stripe_customer_id ?? null;
}
