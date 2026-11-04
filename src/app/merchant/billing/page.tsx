import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireManagedBusiness } from "@/lib/merchant";
import { planState } from "@/lib/billing";
import { canClaimFreeSeat, loadBillingContext, type BillingContext } from "@/lib/founding";
import { FOUNDING_OFFER, OFFER_TIME_ZONE, freeSeatsLeft, priceLine, termLabel, windowLabel, type Offer } from "@/lib/offers";
import { formatDay, safeTimeZone } from "@/lib/dates";
import { continueTerms, purchaseTerms, type Cycle } from "@/lib/renewal-terms";
import { PageLoading } from "@/components/page-loading";
import { FormMessage } from "@/components/field";
import { PlanPanel } from "@/components/merchant/plan-panel";
import { ClaimSeatButton } from "@/components/merchant/claim-seat-button";
import { HostedPageButton } from "@/components/merchant/hosted-page-button";
import { RenewalToggle } from "@/components/merchant/renewal-toggle";
import { AutoRefresh } from "@/components/auto-refresh";
import { startCardUpdate, startPlanCheckout } from "./actions";
import { priceFor, priceText, purchasableOffer, refreshCard, renewalTerms, resolveCheckout, sweepCheckouts } from "@/lib/paid-billing";
import { anetConfigured } from "@/lib/authorize-net";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage({ searchParams }: PageProps<"/merchant/billing">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <BillingContent searchParams={searchParams} />
    </Suspense>
  );
}

function clockNow() {
  return Date.now();
}

// After publishing a first coupon (or pressing Claim free seat), the action lands here with the result.
const CLAIM_MESSAGES: Record<string, { tone: "error" | "success"; text: string }> = {
  claimed: { tone: "success", text: "Your free Founding Merchant seat is confirmed. Any coupon you just published is live for shoppers." },
  seats_gone: { tone: "error", text: "The last free Founding seat has just been taken, so your coupon is saved as a draft." },
  not_open: { tone: "error", text: "Publishing has not opened yet, so your coupon is saved as a draft." },
  already_claimed: { tone: "error", text: "This business has already used its Founding seat, so your coupon is saved as a draft." },
  no_offer: { tone: "error", text: "Free Founding seats are not open right now, so your coupon is saved as a draft." },
  profile_incomplete: { tone: "error", text: "Finish your business profile and first store first. Your coupon is saved as a draft." },
  coupon_required: { tone: "error", text: "Publish your first coupon to claim your free seat." },
  coupon_invalid: { tone: "error", text: "That coupon cannot be published, so it is saved as a draft. Check its end date and try again." },
  has_plan: { tone: "success", text: "You already have a plan, so you can publish coupons." },
  not_allowed: { tone: "error", text: "Only the owner or a manager can claim a seat for this business." },
  failed: { tone: "error", text: "We could not claim a seat just now. Your coupon is saved as a draft. Try again in a moment." },
};

// How long after a checkout starts a return with no payment found yet still means "confirming".
// A hosted payment page token lasts 15 minutes.
const CONFIRMING_FOR_MS = 20 * 60_000;

// Back from Accept Hosted: the payment is confirmed with Authorize.net before anything changes.
const CHECKOUT_MESSAGES: Record<string, { tone: "error" | "success"; text: string }> = {
  captured: { tone: "success", text: "Payment received. Your plan is active and your published coupons are live for shoppers." },
  voided: { tone: "error", text: "The last seats were taken while you paid, so your card was not charged. Billing shows what is available now." },
  failed: { tone: "error", text: "The payment did not go through, and your card was not charged. Try again, or use another card." },
  no_payment: { tone: "error", text: "No payment was made. You can try again whenever you are ready." },
  pending_review: { tone: "success", text: "Your payment is being reviewed by our payment processor. Your plan starts as soon as it is approved." },
  busy: { tone: "success", text: "We are confirming your payment. This page updates on its own in a few seconds." },
  retry_later: { tone: "success", text: "We are confirming your payment. This page updates on its own in a few seconds." },
  mismatch: { tone: "error", text: "We could not match this payment. Coupersville has been told and will sort it out." },
  not_found: { tone: "error", text: "We could not find that checkout. Billing shows your plan as it stands." },
};

async function BillingContent({ searchParams }: { searchParams: PageProps<"/merchant/billing">["searchParams"] }) {
  const { claim, checkout, cancelled, card } = await searchParams;
  const { business, supabase } = await requireManagedBusiness("/merchant/billing");
  const now = clockNow();

  let message = typeof claim === "string" ? CLAIM_MESSAGES[claim] : undefined;
  let confirming = false;
  if (anetConfigured()) {
    if (typeof checkout === "string" && /^[0-9a-f-]{36}$/.test(checkout)) {
      const { data: own } = await supabase.from("checkouts").select("id, created_at").eq("id", checkout).eq("business_id", business.id).maybeSingle();
      if (cancelled === "1") message = CHECKOUT_MESSAGES.no_payment;
      else if (own) {
        let result: string = await resolveCheckout(own.id).catch(() => "retry_later" as const);
        // Authorize.net lists a new payment 10 to 20 seconds after it is made, and the merchant is
        // usually back before that. On a recent checkout, keep confirming rather than say nothing was paid.
        if (result === "no_payment" && now - new Date(own.created_at).getTime() < CONFIRMING_FOR_MS) result = "retry_later";
        confirming = result === "retry_later" || result === "busy";
        message = CHECKOUT_MESSAGES[result];
      }
    } else {
      // Picks up a payment the return and the webhook both missed.
      await sweepCheckouts(now, [business.id]).catch(() => null);
    }
    if (card === "updated") {
      const updated = await refreshCard(business.id).catch(() => null);
      message = updated?.last4
        ? { tone: "success", text: `Card saved, ending in ${updated.last4}.` }
        : { tone: "error", text: "No card is saved yet. Add one to keep your plan going." };
    }
  }
  const billing = await loadBillingContext(supabase, business.id, now);

  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-10">
      <div>
        <h1 className="wordmark text-4xl text-ink">Billing</h1>
        <p className="mt-2">Your plan keeps your coupons live on Main Street.</p>
      </div>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      {confirming && <AutoRefresh seconds={5} />}
      {!billing.publishingOpen && (
        <p className="rounded-sm border-[1.5px] border-ink bg-stock-butter p-4">
          Publishing opens on {formatDay(billing.publishingOpensAt, OFFER_TIME_ZONE)}. You can build coupons and save drafts now.
        </p>
      )}
      <PlanPanel
        state={planState(billing.plan, now)}
        timeZone={business.timezone}
        foundingSeat={billing.plan?.offer_code === FOUNDING_OFFER && billing.plan.source === "complimentary"}
      />
      {billing.claim && (
        <p className="text-sm tabular">
          Founding Merchant seat {billing.claim.seat_number}, claimed on {formatDay(billing.claim.claimed_at, business.timezone)}.
        </p>
      )}
      {billing.plan && <PaymentPanel plan={billing.plan} billing={billing} timeZone={business.timezone} />}
      {(!billing.planCurrent || billing.plan?.source === "complimentary") && !freeSeatPlan(billing.plan, billing.planCurrent) && (
        <OfferPanel billing={billing} businessStatus={business.status} now={now} timeZone={safeTimeZone(business.timezone)} />
      )}
      <Link href="/merchant/billing/history" className="font-medium text-ink underline underline-offset-4">
        Billing history
      </Link>
    </div>
  );
}

function OfferPanel({ billing, businessStatus, now, timeZone }: { billing: BillingContext; businessStatus: string; now: number; timeZone: string }) {
  const upcoming =
    billing.offers
      .filter((o) => o.active && o.window_starts_at && new Date(o.window_starts_at).getTime() > now)
      .sort((a, b) => (a.window_starts_at ?? "").localeCompare(b.window_starts_at ?? ""))[0] ?? null;
  const offer = billing.current ?? upcoming;
  if (!offer) {
    return (
      <section className="panel grid gap-3 p-5">
        <h2 className="text-xl font-semibold">Plans</h2>
        <PaymentsSoon />
      </section>
    );
  }

  const founding = offer.code === FOUNDING_OFFER;
  const isCurrent = offer === billing.current;
  const canClaim = founding && canClaimFreeSeat(billing, businessStatus, now);
  const freeLeft = founding ? freeSeatsLeft(offer) : 0;
  // Paid sign-up: payments open, publishing open, and the offer is current and has seats.
  const buyable = billing.paymentsOpen && billing.publishingOpen && isCurrent ? purchasableOffer(offer) : null;

  return (
    <section className="panel grid gap-4 p-5" aria-labelledby="offer-heading">
      <div>
        <h2 id="offer-heading" className="text-xl font-semibold">
          {offer.name}: {priceLine(offer)}
        </h2>
        <p className="mt-1 text-sm tabular">
          {isCurrent ? windowLabel(offer) : `Opens on ${formatDay(offer.window_starts_at!, OFFER_TIME_ZONE)}`}. {termText(offer, billing.offers)}
        </p>
      </div>
      <SeatsLeft offer={offer} />

      {canClaim && billing.foundersRule === "profile_and_first_coupon" && (
        <div className="grid gap-3">
          <p>
            {freeLeft === 1 ? "One free seat is left." : `${freeLeft} free seats are left.`} Publish your first coupon to claim
            one: your first 12 months are free, and no card is needed.
          </p>
          <Link href="/merchant/coupons/new" className="btn w-fit">
            Create coupon
          </Link>
        </div>
      )}
      {canClaim && billing.foundersRule === "profile_complete" && (
        <div className="grid gap-3">
          <p>Your profile is complete, so you can claim a free seat now: your first 12 months are free, and no card is needed.</p>
          <ClaimSeatButton />
        </div>
      )}
      {buyable && (
        <BuyPlan
          offer={buyable}
          next={buyable.renews_into ? (billing.offers.find((o) => o.code === buyable.renews_into) ?? null) : null}
          now={now}
          timeZone={timeZone}
        />
      )}
      {founding && isCurrent && !canClaim && freeLeft === 0 && !buyable && <PaymentsSoon />}
      {founding && !isCurrent && freeLeft > 0 && (
        <p>The first {offer.free_seats} merchants to publish a coupon get their first 12 months free, with no card needed.</p>
      )}
      {!founding && !buyable && <PaymentsSoon />}
    </section>
  );
}

const isFreeSeat = (plan: Tables<"subscriptions"> | null) =>
  plan?.source === "complimentary" && plan.offer_code === FOUNDING_OFFER && plan.term_ends_at !== null;
const freeSeatPlan = (plan: Tables<"subscriptions"> | null, current: boolean) => current && isFreeSeat(plan);

// The card, the next renewal and its price, and the buttons to change them.
async function PaymentPanel({ plan, billing, timeZone }: { plan: Tables<"subscriptions">; billing: BillingContext; timeZone: string }) {
  const paid = plan.source === "authorize_net";
  const free = isFreeSeat(plan) && billing.planCurrent;
  if (!paid && !free) return null;
  if (paid && !["active", "past_due"].includes(plan.status)) return null;
  if (free && !billing.paymentsOpen) return null;

  const admin = createAdminClient();
  const { data: offerRows } = await admin.from("offers").select("*");
  // A renewal held for review by the payment processor has not failed.
  const { count: reviewing } = await admin
    .from("renewal_attempts")
    .select("id", { count: "exact", head: true })
    .eq("business_id", plan.business_id)
    .eq("status", "pending")
    .not("anet_trans_id", "is", null);
  const terms = renewalTerms(plan, new Map((offerRows ?? []).map((o) => [o.code, o])));
  const general = offerRows?.find((o) => o.code === "general");
  const ends = plan.current_period_end ? formatDay(plan.current_period_end, timeZone) : "the end of this period";
  const cycles: [string, string][] = general
    ? ([["annual", priceText(general.annual_price_cents, "annual")], ...(general.monthly_price_cents ? [["monthly", priceText(general.monthly_price_cents, "monthly")]] : [])] as [string, string][])
    : [["annual", "Annual"]];
  // A free seat adding a card agrees to continue on General automatically.
  const continueTermsFor =
    free && general && plan.current_period_end
      ? Object.fromEntries(cycles.map(([c]) => [c, continueTerms({ next: general, cycle: c as Cycle, endsAt: plan.current_period_end!, timeZone: safeTimeZone(timeZone) })]))
      : undefined;

  return (
    <section className="panel grid gap-4 p-5" aria-labelledby="payment-heading">
      <h2 id="payment-heading" className="text-xl font-semibold">
        {free ? "After your free year" : "Payment"}
      </h2>
      {free && !plan.anet_payment_profile_id && (
        <p>
          Your free Founding seat ends on {ends}. Add a card to continue on General from then. Nothing is charged until that date.
        </p>
      )}
      {plan.anet_payment_profile_id && !plan.cancel_at_period_end && terms && (
        <p className="tabular">
          {free ? "Continues on" : "Renews on"} {ends} as {terms.offer.name}, {priceText(terms.amountCents, terms.cycle)}, using the card ending in {plan.card_last4 ?? "****"}.
        </p>
      )}
      {plan.cancel_at_period_end && (
        <p>Renewal is cancelled. {free ? "Your free seat" : "Your plan"} stays active until {ends}, then your coupons are hidden from shoppers.</p>
      )}
      {plan.status === "past_due" && reviewing ? (
        <p>Your renewal payment is being reviewed by our payment processor. Your coupons stay live meanwhile.</p>
      ) : plan.status === "past_due" ? (
        <p className="text-signal">Your last payment failed. Update your card: we try it again 1, 3 and 7 days after the renewal date.</p>
      ) : null}
      <div className="flex flex-wrap items-start gap-4">
        {free && !plan.anet_payment_profile_id ? (
          <HostedPageButton label="Add card" pendingLabel="Opening the secure card page" start={startCardUpdate} cycles={cycles} terms={continueTermsFor} />
        ) : (
          <HostedPageButton
            label="Update card"
            pendingLabel="Opening the secure card page"
            variant={plan.status === "past_due" && !reviewing ? "primary" : "secondary"}
            start={startCardUpdate}
            cycles={free ? cycles : undefined}
          />
        )}
        {plan.anet_payment_profile_id && <RenewalToggle cancelled={plan.cancel_at_period_end} endsOn={ends} />}
      </div>
      <p className="text-sm">Cards are handled by Authorize.net. Coupersville never sees or stores your card number.</p>
    </section>
  );
}

function BuyPlan({ offer, next, now, timeZone }: { offer: Offer; next: Offer | null; now: number; timeZone: string }) {
  const cycles: [string, string][] = [["annual", priceText(priceFor(offer, "annual")!, "annual")]];
  const monthly = priceFor(offer, "monthly");
  if (monthly) cycles.push(["monthly", priceText(monthly, "monthly")]);
  // The automatic renewal terms for each choice, agreed with an unticked box before payment.
  const terms = Object.fromEntries(cycles.map(([c]) => [c, purchaseTerms({ offer, next, cycle: c as Cycle, now, timeZone })]));
  return (
    <div className="grid gap-3">
      <HostedPageButton label="Continue to payment" pendingLabel="Opening secure payment" start={startPlanCheckout} cycles={cycles} terms={terms} />
      <p className="text-sm">You pay on Authorize.net&apos;s secure page. Your card is charged only once your plan is confirmed.</p>
    </div>
  );
}

function SeatsLeft({ offer }: { offer: Offer }) {
  if (offer.seat_cap === null && offer.free_seats === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-3 tabular">
      {offer.free_seats > 0 && (
        <div className="rounded-sm border-[1.5px] border-ink p-3">
          <dt className="text-sm">Free seats left</dt>
          <dd className="text-2xl font-semibold">
            {freeSeatsLeft(offer)} of {offer.free_seats}
          </dd>
        </div>
      )}
      {offer.seat_cap !== null && (
        <div className="rounded-sm border-[1.5px] border-ink p-3">
          <dt className="text-sm">Seats left</dt>
          <dd className="text-2xl font-semibold">
            {Math.max(0, offer.seat_cap - Number(offer.seats_used))} of {offer.seat_cap}
          </dd>
        </div>
      )}
    </dl>
  );
}

function termText(offer: Offer, offers: Offer[]): string {
  const next = offer.renews_into ? offers.find((o) => o.code === offer.renews_into) : null;
  if (offer.term_months === null) return "Ongoing.";
  return next ? `${termLabel(offer.term_months)}, then ${next.name}.` : `${termLabel(offer.term_months)}.`;
}

function PaymentsSoon() {
  return (
    <p className="rounded-sm border-[1.5px] border-ink bg-stock-sky p-3">
      Payments open soon. Until then, you can build your coupons and save them as drafts.
    </p>
  );
}
