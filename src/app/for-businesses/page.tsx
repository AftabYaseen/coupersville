import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BarChart3, BadgePercent, Clock3, QrCode, Store, Users, type LucideIcon } from "lucide-react";
import { Ticket } from "@/components/ticket";
import { foundingCallout } from "@/lib/founding-callout";
import { JOIN_HREF } from "@/lib/site-copy";

export const metadata: Metadata = {
  title: "Digital coupons for businesses",
  description:
    "Create digital offers, attract deal-conscious customers and turn promotions into visits. You control the offer, the timing, the locations and the limits.",
};

const REASONS: { title: string; body: string; Icon: LucideIcon }[] = [
  {
    title: "Create offers on your terms",
    body: "Choose a percentage or dollar discount, a fixed price or a free item, plus eligible products, participating locations, redemption limits and expiration date.",
    Icon: BadgePercent,
  },
  { title: "Publish without the wait", body: "Your coupons can go live immediately. There is no routine approval delay.", Icon: Clock3 },
  {
    title: "Reach customers who are ready to save",
    body: "Coupersville helps shoppers discover offers by category, business and location.",
    Icon: Users,
  },
  {
    title: "Redeem with confidence",
    body: "Single-use QR coupons help reduce duplicate redemption and provide immediate validation.",
    Icon: QrCode,
  },
  { title: "See what is working", body: "Use your merchant dashboard to review coupon activity and redemption results.", Icon: BarChart3 },
  { title: "Keep more of the sale", body: "Coupersville does not take a commission from each coupon redemption.", Icon: Store },
];

const STEPS: { title: string; body: string }[] = [
  { title: "Set up your business", body: "Add your business details, logo and participating locations." },
  { title: "Create your offer", body: "Choose the discount, products or services, limits, dates and locations." },
  { title: "Publish instantly", body: "Make the coupon available to Coupersville shoppers when you are ready." },
  { title: "Scan and redeem", body: "Validate the customer's one-time QR coupon at the point of purchase." },
  { title: "Review performance", body: "Track redemptions and learn which offers attract customers." },
];

export default function ForBusinessesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-lg font-medium">Turn an offer into an opportunity.</p>
      <h1 className="wordmark mt-1 text-4xl text-ink sm:text-5xl">Give customers another reason to choose your business.</h1>
      <p className="mt-3 max-w-2xl text-lg">
        Coupersville gives your business a straightforward way to create digital offers, attract deal-conscious customers and turn
        promotions into visits. You control the offer, the timing, the locations and the limits.
      </p>
      <Suspense fallback={null}>
        <FoundingCallout />
      </Suspense>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={JOIN_HREF} className="btn">
          Join Coupersville
        </Link>
        <Link href="/business-membership" className="btn btn-secondary">
          View business membership
        </Link>
      </div>

      <section className="mt-12" aria-labelledby="why-heading">
        <h2 id="why-heading" className="wordmark text-3xl text-ink">
          Why businesses join
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {REASONS.map(({ title, body, Icon }) => (
            <li key={title} className="panel p-5">
              <h3 className="flex items-center gap-2 font-semibold">
                <Icon aria-hidden size={20} strokeWidth={1.5} className="shrink-0 text-ink" />
                {title}
              </h3>
              <p className="mt-1">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12" aria-labelledby="offers-heading">
        <h2 id="offers-heading" className="wordmark text-3xl text-ink">
          Your offer, printed on a ticket
        </h2>
        <p className="mt-1">Every coupon looks like this to shoppers, in the colour of its category, with its own limits.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Ticket tint="pink" offer="20% OFF" title="Any cake" merchant="Example bakery" limits="One per customer" />
          <Ticket tint="sky" offer="$5 OFF" title="Any pair of shoes" merchant="Example shoe shop" limits="Minimum spend $40" />
          <Ticket tint="butter" offer="ONLY $1" title="Regular coffee" merchant="Example cafe" limits="Once a day per customer, weekdays 7 to 10 am" />
          <Ticket tint="mint" offer="FREE" title="Tote bag with any purchase" merchant="Example grocer" limits="First 100 customers" />
        </div>
      </section>

      <section className="mt-12" aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="wordmark text-3xl text-ink">
          How Coupersville works for your business
        </h2>
        <ol className="mt-4 grid gap-3">
          {STEPS.map(({ title, body }, i) => (
            <li key={title} className="panel flex gap-4 p-5">
              <span className="offer-text flex size-12 shrink-0 items-center justify-center rounded-sm bg-marigold text-3xl text-ink-deep tabular" aria-hidden>
                {i + 1}
              </span>
              <div>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-1">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-10">
        <Link href={JOIN_HREF} className="btn">
          Open your door in Coupersville
        </Link>
      </div>
    </div>
  );
}

async function FoundingCallout() {
  const f = await foundingCallout();
  if (!f) return null;
  return (
    <p className="mt-6 rounded-sm border-[1.5px] border-ink bg-stock-butter p-4">
      <span className="font-semibold">{f.name} offer:</span> The first {f.freeSeats} qualifying merchants to join between{" "}
      {f.from} and {f.to} receive one complimentary year. See{" "}
      <Link href="/business-membership" className="font-medium text-ink underline underline-offset-4">
        Business membership
      </Link>{" "}
      for details.
    </p>
  );
}
