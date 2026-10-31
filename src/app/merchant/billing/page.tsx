import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireManagedBusiness } from "@/lib/merchant";
import { planState } from "@/lib/billing";
import { canClaimFreeSeat, loadBillingContext, type BillingContext } from "@/lib/founding";
import { FOUNDING_OFFER, OFFER_TIME_ZONE, freeSeatsLeft, priceLine, termLabel, windowLabel, type Offer } from "@/lib/offers";
import { formatDay } from "@/lib/dates";
import { PageLoading } from "@/components/page-loading";
import { FormMessage } from "@/components/field";
import { PlanPanel } from "@/components/merchant/plan-panel";
import { ClaimSeatButton } from "@/components/merchant/claim-seat-button";

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

async function BillingContent({ searchParams }: { searchParams: PageProps<"/merchant/billing">["searchParams"] }) {
  const { claim } = await searchParams;
  const { business, supabase } = await requireManagedBusiness("/merchant/billing");
  const now = clockNow();
  const billing = await loadBillingContext(supabase, business.id, now);
  const message = typeof claim === "string" ? CLAIM_MESSAGES[claim] : undefined;

  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-10">
      <div>
        <h1 className="wordmark text-4xl text-ink">Billing</h1>
        <p className="mt-2">Your plan keeps your coupons live on Main Street.</p>
      </div>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
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
      {!billing.planCurrent && <OfferPanel billing={billing} businessStatus={business.status} now={now} />}
    </div>
  );
}

function OfferPanel({ billing, businessStatus, now }: { billing: BillingContext; businessStatus: string; now: number }) {
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
      {founding && isCurrent && !canClaim && freeLeft === 0 && <PaymentsSoon />}
      {founding && !isCurrent && freeLeft > 0 && (
        <p>The first {offer.free_seats} merchants to publish a coupon get their first 12 months free, with no card needed.</p>
      )}
      {!founding && <PaymentsSoon />}
    </section>
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
