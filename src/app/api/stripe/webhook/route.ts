import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { subscriptionIdFrom, syncStripeSubscription } from "@/lib/billing-sync";

// Stripe calls this for checkout, subscription and invoice events. It is the only code that
// writes Stripe plan state. Logs carry the event id, type and outcome only: never payloads,
// customer details or card data.

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret) {
    console.error("stripe webhook: STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 500 });
  }
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // The signature covers the exact bytes Stripe sent, so read the raw body.
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    console.warn("stripe webhook: signature check failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: seen } = await admin.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) {
    console.info(`stripe webhook ${event.id} ${event.type}: duplicate, ignored`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const subscriptionId = HANDLED.has(event.type) ? subscriptionIdFrom(event) : null;
    const outcome = subscriptionId ? await syncStripeSubscription(subscriptionId) : "not_relevant";

    // Recorded only after it succeeded, so Stripe's retry of a failed event is still processed.
    const { error } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
    if (error && error.code !== "23505") throw new Error(`could not record event: ${error.code}`);

    console.info(`stripe webhook ${event.id} ${event.type}: ${outcome}`);
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    console.error(`stripe webhook ${event.id} ${event.type}: failed (${reason})`);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
