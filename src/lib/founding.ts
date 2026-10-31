import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/supabase/database.types";
import { planIsCurrent } from "@/lib/billing";
import { FOUNDING_OFFER, currentOffer, freeSeatsLeft, inWindow, type Offer } from "@/lib/offers";

type Client = SupabaseClient<Database>;

export type FoundersRule = "profile_and_first_coupon" | "profile_complete";

export type BillingContext = {
  plan: Tables<"subscriptions"> | null;
  planCurrent: boolean;
  offers: Offer[];
  current: Offer | null;
  founding: Offer | null;
  claim: Pick<Tables<"offer_seat_claims">, "offer_code" | "seat_number" | "free" | "claimed_at"> | null;
  publishingOpensAt: string;
  publishingOpen: boolean;
  foundersRule: FoundersRule;
};

// Everything the billing page, the dashboard and the publish action need to know about plans and offers.
export async function loadBillingContext(supabase: Client, businessId: string, now = Date.now()): Promise<BillingContext> {
  const [{ data: plan }, { data: offers }, { data: settings }, { data: claim }] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("business_id", businessId).maybeSingle(),
    supabase.rpc("offer_overview"),
    supabase.from("platform_settings").select("publishing_opens_at, founders_rule, founders_full_early_access").limit(1).maybeSingle(),
    supabase
      .from("offer_seat_claims")
      .select("offer_code, seat_number, free, claimed_at")
      .eq("business_id", businessId)
      .eq("offer_code", FOUNDING_OFFER)
      .maybeSingle(),
  ]);
  const list: Offer[] = offers ?? [];
  const publishingOpensAt = settings?.publishing_opens_at ?? "2026-11-01T07:00:00Z";
  return {
    plan,
    planCurrent: planIsCurrent(plan, now),
    offers: list,
    current: currentOffer(list, now, settings?.founders_full_early_access ?? true),
    founding: list.find((o) => o.code === FOUNDING_OFFER) ?? null,
    claim,
    publishingOpensAt,
    publishingOpen: new Date(publishingOpensAt).getTime() <= now,
    foundersRule: settings?.founders_rule === "profile_complete" ? "profile_complete" : "profile_and_first_coupon",
  };
}

// Whether a merchant without a plan can claim a free Founding seat now. The database function
// claim_founding_seat makes the final, race-safe decision; this only decides what to offer.
export function canClaimFreeSeat(ctx: BillingContext, businessStatus: string, now = Date.now()): boolean {
  const f = ctx.founding;
  return (
    ctx.publishingOpen &&
    !ctx.planCurrent &&
    !ctx.claim &&
    businessStatus === "active" &&
    f !== null &&
    f.active &&
    inWindow(f, now) &&
    freeSeatsLeft(f) > 0 &&
    (f.seat_cap === null || Number(f.seats_used) < f.seat_cap)
  );
}
