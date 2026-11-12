import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/admin";
import { addDays, dayInZone } from "@/lib/dates";
import { ENTERPRISE_OFFER, FOUNDING_OFFER, OFFER_TIME_ZONE, freeSeatsLeft, priceLine, termLabel, windowLabel, type Offer } from "@/lib/offers";
import { PageLoading } from "@/components/page-loading";
import { OfferForm } from "@/components/admin/offer-form";

export const metadata: Metadata = { title: "Offers" };

export default function OffersPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <OffersContent />
    </Suspense>
  );
}

const dollars = (cents: number | null) => (cents === null ? "" : String(cents / 100));

async function OffersContent() {
  const { supabase } = await requireAdminPage("/admin/offers");
  const { data } = await supabase.rpc("offer_overview");
  const offers: Offer[] = data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink">Offers</h1>
      <p className="mt-2">
        What a merchant signs up for, and when. Dates are Pacific time. Names and prices show on the Business membership page,
        Billing and emails, so a change here appears everywhere. Payments are not open yet, so the only seats that can be taken
        are free {offers.find((o) => o.code === FOUNDING_OFFER)?.name ?? "founding"} seats.
      </p>

      {offers.length === 0 ? (
        <p className="panel mt-6 p-5">No offers found. Run the database migrations, then reload.</p>
      ) : (
        <ul className="mt-6 grid gap-6">
          {offers.map((o) => (
            <li key={o.code} className="panel grid gap-4 p-5">
              <div>
                <h2 className="text-xl font-semibold">
                  {o.name}
                  {!o.active && <span className="ml-2 text-base font-medium">(inactive)</span>}
                </h2>
                <p className="mt-1 text-sm tabular">
                  {o.code === ENTERPRISE_OFFER ? "Custom, no checkout. Granted on a merchant's page, with its own limits." : `${priceLine(o)}. ${windowLabel(o)}. ${termLabel(o.term_months)}.`}
                </p>
              </div>
              {(o.seat_cap !== null || o.free_seats > 0) && (
                <dl className="grid grid-cols-2 gap-3 tabular sm:grid-cols-3">
                  <div className="rounded-sm border-[1.5px] border-ink p-3">
                    <dt className="text-sm">Seats taken</dt>
                    <dd className="text-2xl font-semibold">
                      {Number(o.seats_used)}
                      {o.seat_cap !== null && ` of ${o.seat_cap}`}
                    </dd>
                  </div>
                  {o.free_seats > 0 && (
                    <div className="rounded-sm border-[1.5px] border-ink p-3">
                      <dt className="text-sm">Free seats taken</dt>
                      <dd className="text-2xl font-semibold">
                        {Number(o.free_seats_used)} of {o.free_seats}
                      </dd>
                    </div>
                  )}
                  {o.free_seats > 0 && (
                    <div className="rounded-sm border-[1.5px] border-ink p-3">
                      <dt className="text-sm">Free seats left</dt>
                      <dd className="text-2xl font-semibold">{freeSeatsLeft(o)}</dd>
                    </div>
                  )}
                </dl>
              )}
              {o.code !== ENTERPRISE_OFFER && <OfferForm
                code={o.code}
                seatsUsed={Number(o.seats_used)}
                freeSeatsUsed={Number(o.free_seats_used)}
                renewOptions={offers.filter((x) => x.code !== o.code && x.code !== ENTERPRISE_OFFER).map((x) => ({ code: x.code, name: x.name }))}
                defaults={{
                  name: o.name,
                  startsOn: o.window_starts_at ? dayInZone(o.window_starts_at, OFFER_TIME_ZONE) : "",
                  // Stored ends are exclusive; the form shows the last day.
                  endsOn: o.window_ends_at ? addDays(dayInZone(o.window_ends_at, OFFER_TIME_ZONE), -1) : "",
                  seatCap: o.seat_cap === null ? "" : String(o.seat_cap),
                  freeSeats: String(o.free_seats),
                  term: o.term_months === null ? "ongoing" : "12",
                  annualPrice: dollars(o.annual_price_cents),
                  monthlyPrice: dollars(o.monthly_price_cents),
                  renewsInto: o.renews_into ?? "",
                  active: o.active,
                  maxLocations: o.max_locations === null ? "" : String(o.max_locations),
                  maxLiveCoupons: o.max_live_coupons === null ? "" : String(o.max_live_coupons),
                  campaignsPerLocation: o.campaigns_per_location === null ? "" : String(o.campaigns_per_location),
                  privateOffersPerMonth: o.private_offers_per_month === null ? "" : String(o.private_offers_per_month),
                }}
              />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
