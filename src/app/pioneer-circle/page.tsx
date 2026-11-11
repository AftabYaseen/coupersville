import type { Metadata } from "next";
import Link from "next/link";
import { firstSeats, pioneerOffer } from "@/lib/pioneer";
import { PioneerCircleContent } from "@/components/pioneer-circle-content";
import { JOIN_HREF } from "@/lib/site-copy";

// Public page from the client's text (2026-11-11). The name and seat count come from the offers
// table (cached for an hour), so the page stays static.

export async function generateMetadata(): Promise<Metadata> {
  const offer = await pioneerOffer();
  return {
    title: offer.name,
    description: `The Coupersville ${offer.name} celebrates the ${firstSeats(offer)} businesses that join at the beginning and help shape what Coupersville will become.`,
  };
}

export default async function PioneerCirclePage() {
  const offer = await pioneerOffer();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PioneerCircleContent offer={offer} seatsNote />
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={JOIN_HREF} className="btn">
          Join Coupersville
        </Link>
        <Link href="/business-membership" className="btn btn-secondary">
          See membership and pricing
        </Link>
        <Link href="/faq#pioneer-circle" className="btn btn-secondary">
          {offer.name} questions
        </Link>
      </div>
    </div>
  );
}
