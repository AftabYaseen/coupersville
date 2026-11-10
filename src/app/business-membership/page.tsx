import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { membershipLevels } from "@/lib/membership";
import { JOIN_HREF } from "@/lib/site-copy";

export const metadata: Metadata = {
  title: "Business membership and pricing",
  description:
    "Choose the Coupersville membership level that fits, publish your own coupons and keep more of every sale. Pay annually or monthly.",
};

export default function BusinessMembershipPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink sm:text-5xl">One membership. Plenty of possibilities.</h1>
      <Suspense fallback={<div className="panel mt-6 h-96" aria-hidden />}>
        <Levels />
      </Suspense>
    </div>
  );
}

async function Levels() {
  const { levels, campaignsEach, plusLocations } = await membershipLevels();
  const each = campaignsEach ? `up to ${campaignsEach} campaigns per month` : null;

  const faq: { q: string; a: ReactNode }[] = [
    {
      q: "Is the membership billed monthly?",
      a: "You can choose. Pay annually in full at sign up, or pay monthly. Paying annually costs less than paying monthly for the same 12 months.",
    },
    {
      q: "Does Coupersville take a percentage of sales?",
      a: "No. Coupersville does not charge a commission on coupon redemptions or eligible customer purchases.",
    },
    {
      q: "Can I create more than one coupon?",
      a: (
        <>
          Yes. {each ? `Every membership level includes ${each}` : "Every membership level includes several campaigns per month"}, subject
          to platform terms and acceptable-use requirements. Businesses needing more can{" "}
          <Link href="/contact" className="font-medium text-ink underline underline-offset-4">
            contact us
          </Link>{" "}
          for an Enterprise custom quote.
        </>
      ),
    },
    {
      q: "Can I include more than one location?",
      a: (
        <>
          Yes. Merchant Plus includes up to {plusLocations ?? 3} locations, and you can choose whether each coupon applies everywhere or
          only at selected locations. For more than {plusLocations ?? 3} locations,{" "}
          <Link href="/contact" className="font-medium text-ink underline underline-offset-4">
            contact us
          </Link>{" "}
          for a customized consultation.
        </>
      ),
    },
    {
      q: "What happens if my membership expires?",
      a: "Published coupons are automatically removed from public view and cannot be redeemed. They return when the membership is renewed, provided the coupons have not expired.",
    },
    {
      q: "Can I cancel renewal?",
      a: "Yes. You may turn off automatic renewal before the next billing date. Access continues through the end of the paid membership period.",
    },
  ];

  return (
    <>
      <p className="mt-3 max-w-2xl text-lg">
        Create offers whenever it makes sense for your business. Choose the membership level that fits, publish your own coupons and
        keep more of every sale.{each ? ` Every level includes ${each}.` : ""}
      </p>

      <section className="mt-8" aria-labelledby="levels-heading">
        <h2 id="levels-heading" className="wordmark text-3xl text-ink">
          Membership levels and pricing
        </h2>
        <ul className="mt-4 grid gap-4">
          {levels.map((l) => (
            <li key={l.code} className="panel grid gap-4 p-5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
              <div className="grid content-start gap-3">
                <h3 className="text-xl font-semibold">{l.name}</h3>
                <dl className="grid grid-cols-2 gap-3 tabular sm:grid-cols-1">
                  <div className="rounded-sm border-[1.5px] border-ink p-3">
                    <dt className="text-sm">Pay annually</dt>
                    <dd className="text-2xl font-semibold">{l.annual ?? "Custom quote"}</dd>
                    {l.annual && <dd className="text-sm">Paid in full at sign up</dd>}
                  </div>
                  <div className="rounded-sm border-[1.5px] border-ink p-3">
                    <dt className="text-sm">Pay monthly</dt>
                    <dd className="text-2xl font-semibold">{l.monthly ?? (l.annual ? "Annual only" : "Custom quote")}</dd>
                    {l.monthly && <dd className="text-sm">Per month</dd>}
                  </div>
                </dl>
              </div>
              <div className="grid content-start gap-3">
                <p>{l.details}</p>
                {!l.annual && (
                  <Link href="/contact" className="btn btn-secondary justify-self-start">
                    Contact us for a custom quote
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 font-medium">
          Choose annual or monthly billing. Paying annually costs less than paying monthly for the same 12 months. No redemption
          commissions. No hidden per-coupon charges.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="includes-heading">
        <h2 id="includes-heading" className="wordmark text-3xl text-ink">
          Membership includes
        </h2>
        <ul className="panel mt-4 grid list-disc gap-1.5 p-5 pl-10">
          {each && <li>{each[0].toUpperCase() + each.slice(1)} at every membership level</li>}
          <li>
            Single-location support, up to {plusLocations ?? 3} locations with Merchant Plus and custom multi-location plans with
            Enterprise
          </li>
          <li>Instant coupon publishing</li>
          <li>Percentage, dollar amount, fixed price or free item offers</li>
          <li>Product, purchase, quantity and party-size conditions</li>
          <li>Coupon start and expiration dates</li>
          <li>Single-use QR coupon redemption</li>
          <li>Merchant dashboard and redemption reporting</li>
          <li>Business profile, logo and coupon image uploads</li>
          <li>No commission on coupon redemptions</li>
        </ul>
        <Link href={JOIN_HREF} className="btn mt-6">
          Start my membership
        </Link>
      </section>

      <p className="mt-8 text-sm">
        Memberships renew automatically (annually or monthly, depending on your billing choice) unless renewal is turned off before the
        next billing date. Promotional pricing applies to the initial 12-month term where noted; Early Access renewals convert to the
        then-current General rate unless otherwise specified. These are 2026/2027 introductory prices and are subject to change. If a
        membership expires, the business&apos;s published coupons are removed from public view. Coupon drafts and business information
        remain available if the membership is renewed, subject to the platform&apos;s retention policy.
      </p>

      <section className="mt-10" aria-labelledby="pricing-faq-heading">
        <h2 id="pricing-faq-heading" className="wordmark text-3xl text-ink">
          Pricing questions
        </h2>
        <dl className="mt-4 grid gap-3">
          {faq.map(({ q, a }) => (
            <div key={q} className="panel p-5">
              <dt className="font-semibold">{q}</dt>
              <dd className="mt-1">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
