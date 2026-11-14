import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import welcomeSign from "../../../public/town-sign.jpg";
import { BRAND_LINE, JOIN_HREF } from "@/lib/site-copy";

export const metadata: Metadata = {
  title: "About Coupersville",
  description: "Coupersville makes digital coupons easier for customers and more practical for businesses.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="wordmark text-4xl text-primary sm:text-5xl">A place where businesses and savings meet.</h1>
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
      {/* The client’s welcome sign, moved here from the home page in the 2026-11 rebrand. */}
      <figure className="mt-8 overflow-hidden rounded-lg border border-line bg-white p-2 shadow-md sm:p-3">
        <Image
          src={welcomeSign}
          alt="A wooden sign reading Welcome to Coupersville, Find Your Joy, Population: Growing Every Day, beside a tree-lined main street of shops."
          sizes="(max-width: 767px) calc(100vw - 3rem), 720px"
          className="h-auto w-full rounded-md"
        />
      </figure>
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
