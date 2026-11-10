import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_LINE, JOIN_HREF } from "@/lib/site-copy";

export const metadata: Metadata = {
  title: "About Coupersville",
  description: "Coupersville makes digital coupons easier for customers and more practical for businesses.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink sm:text-5xl">A place where businesses and savings meet.</h1>
      <div className="mt-6 grid gap-4 text-lg">
        <p>
          Coupersville was created to make digital coupons easier for customers and more practical for businesses. Shoppers can
          discover offers without clipping paper coupons, and redeem them with just their email and a one-time code. Businesses can
          create and publish their own deals, choose where and when each offer applies and validate redemptions through one-time QR
          coupons.
        </p>
        <p>
          Our goal is simple: help people discover good businesses, enjoy worthwhile savings and have another reason to come back.
        </p>
      </div>
      <p className="mt-8 text-xl font-semibold">{BRAND_LINE}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/search" className="btn">
          Find a deal
        </Link>
        <Link href={JOIN_HREF} className="btn btn-secondary">
          Join as a business
        </Link>
      </div>
    </div>
  );
}
