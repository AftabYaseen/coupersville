import "server-only";
import type Stripe from "stripe";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { planIsCurrent } from "@/lib/billing";
import type { Enums } from "@/lib/supabase/database.types";

// Copies a Stripe subscription's current state into public.subscriptions. Called only from the
// webhook handler, which makes it the only writer of Stripe plan state.
//
// It always fetches the subscription fresh from Stripe and ignores what the event said, so events
// that arrive late or out of order cannot roll a plan back to an older state.

type Status = Enums<"subscription_status">;

// Incomplete means the first payment has not gone through: nothing to record yet.
function mapStatus(status: Stripe.Subscription.Status): Status | null {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
    case "incomplete_expired":
    case "paused":
      return "expired";
    default:
      return null;
  }
}

function periodEnd(sub: Stripe.Subscription): number | null {
  const ends = sub.items.data.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  return ends.length ? Math.max(...ends) : null;
}

const toIso = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null);

async function businessFor(sub: Stripe.Subscription): Promise<string | null> {
  const admin = createAdminClient();
  const fromMetadata = z.uuid().safeParse(sub.metadata?.business_id);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const candidate = fromMetadata.success
    ? fromMetadata.data
    : (await admin.from("billing_customers").select("business_id").eq("stripe_customer_id", customerId).maybeSingle()).data
        ?.business_id;
  if (!candidate) return null;
  const { data } = await admin.from("businesses").select("id").eq("id", candidate).maybeSingle();
  return data?.id ?? null;
}

export type SyncOutcome =
  | "updated"
  | "created"
  | "replaced_complimentary"
  | "replaced_older_subscription"
  | "ignored_not_started"
  | "ignored_older_subscription"
  | "ignored_complimentary_kept"
  | "ignored_unknown_business";

export async function syncStripeSubscription(subscriptionId: string): Promise<SyncOutcome> {
  const stripe = getStripe();
  const admin = createAdminClient();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  const status = mapStatus(sub.status);
  if (!status) return "ignored_not_started";

  const businessId = await businessFor(sub);
  if (!businessId) return "ignored_unknown_business";

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await admin.from("billing_customers").upsert({ business_id: businessId, stripe_customer_id: customerId }, { onConflict: "business_id", ignoreDuplicates: true });

  const { data: row } = await admin.from("subscriptions").select("*").eq("business_id", businessId).maybeSingle();
  const live = status === "active" || status === "past_due";
  const cancelling = sub.cancel_at_period_end || sub.cancel_at !== null;
  const endSeconds = sub.status === "canceled" ? (sub.ended_at ?? periodEnd(sub)) : (cancelling && sub.cancel_at) || periodEnd(sub);

  const sameSubscription = row?.source === "stripe" && row.stripe_subscription_id === sub.id;
  const past_due_since =
    status !== "past_due" ? null : sameSubscription && row?.status === "past_due" && row.past_due_since ? row.past_due_since : new Date().toISOString();

  const values = {
    business_id: businessId,
    source: "stripe" as const,
    status,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    current_period_end: toIso(endSeconds),
    cancel_at_period_end: status === "active" && cancelling,
    past_due_since,
  };

  if (!row) {
    const { error } = await admin.from("subscriptions").insert(values);
    if (error) throw new Error(`insert failed: ${error.code}`);
    return "created";
  }

  if (sameSubscription) {
    const { error } = await admin.from("subscriptions").update(values).eq("id", row.id);
    if (error) throw new Error(`update failed: ${error.code}`);
    return "updated";
  }

  if (row.source === "complimentary") {
    // A paid plan that has started replaces a complimentary one. Anything else leaves it alone.
    if (!live) return "ignored_complimentary_kept";
    const { error } = await admin.from("subscriptions").update(values).eq("id", row.id);
    if (error) throw new Error(`replace failed: ${error.code}`);
    return "replaced_complimentary";
  }

  // A different Stripe subscription. The newer live one wins; an old one never overwrites a current plan.
  if (!live && planIsCurrent(row)) return "ignored_older_subscription";
  const { error } = await admin.from("subscriptions").update(values).eq("id", row.id);
  if (error) throw new Error(`replace failed: ${error.code}`);
  // Stop the old subscription so the business is never charged twice.
  if (live && row.stripe_subscription_id) {
    const old = await stripe.subscriptions.retrieve(row.stripe_subscription_id).catch(() => null);
    if (old && old.status !== "canceled" && old.status !== "incomplete_expired") {
      await stripe.subscriptions.cancel(old.id, { prorate: false });
    }
  }
  return "replaced_older_subscription";
}

// The subscription an event is about, whatever the event type and API version of the payload.
export function subscriptionIdFrom(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as Record<string, unknown>;
  const asId = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "id" in v ? String((v as { id: unknown }).id) : null);

  if (event.type === "checkout.session.completed") {
    return obj.mode === "subscription" ? asId(obj.subscription) : null;
  }
  if (event.type.startsWith("customer.subscription.")) return asId(obj.id);
  if (event.type.startsWith("invoice.")) {
    const parent = obj.parent as { subscription_details?: { subscription?: unknown } } | null | undefined;
    return asId(parent?.subscription_details?.subscription) ?? asId(obj.subscription);
  }
  return null;
}
