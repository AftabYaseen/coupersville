import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, CalendarRange, Image as ImageIcon, MapPin, QrCode, Store, Tags, type LucideIcon } from "lucide-react";
import { Ticket } from "@/components/ticket";

export const metadata: Metadata = {
  title: "For businesses",
  description:
    "Put your shop's coupons on Coupersville. Publish instantly, set limits and schedules, cover one or many stores, and see redemption stats. No approvals, no commissions.",
};

const FEATURES: { title: string; body: string; Icon: LucideIcon }[] = [
  { title: "Publish instantly", body: "Create a coupon and publish it. It is live for shoppers straight away.", Icon: Store },
  { title: "Four kinds of offer", body: "Percent off, dollars off, a fixed price, or something free.", Icon: Tags },
  {
    title: "Limits, dates and schedules",
    body: "Once per customer, a few times, or every day. Pick start and end dates, weekdays and hours, a minimum spend, or a total cap.",
    Icon: CalendarRange,
  },
  { title: "One store or many", body: "Add every location and choose which ones each coupon works at.", Icon: MapPin },
  { title: "Images and logos", body: "Add your logo and a photo for each coupon so shoppers know it is you.", Icon: ImageIcon },
  { title: "Redemption stats", body: "See how many times each coupon was redeemed, today, in the last 7 days and overall.", Icon: BarChart3 },
  {
    title: "Secure single-use QR codes",
    body: "Each redemption gets its own QR code and 6-digit code that works once, for a few minutes. Staff scan it on your scanner page.",
    Icon: QrCode,
  },
];

export default function ForBusinessesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink sm:text-5xl">Put your shop on Main Street</h1>
      <p className="mt-3 max-w-2xl text-lg">
        Coupersville brings shoppers to local businesses. Publish coupons in minutes and let people redeem them at your counter.
      </p>
      <p className="mt-4 text-xl font-semibold">No approvals. No commissions. No complicated setup.</p>

      <section className="mt-10" aria-labelledby="offers-heading">
        <h2 id="offers-heading" className="wordmark text-3xl text-ink">
          Your offer, printed on a ticket
        </h2>
        <p className="mt-1">Every coupon looks like this to shoppers, in the colour of your category.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Ticket tint="pink" offer="20% OFF" title="Any cake" merchant="Example bakery" limits="Once per customer" />
          <Ticket tint="sky" offer="$5 OFF" title="Any pair of shoes" merchant="Example shoe shop" limits="Spend $40 or more" />
          <Ticket tint="butter" offer="ONLY $1" title="Regular coffee" merchant="Example cafe" limits="Once a day, weekdays 7 to 10 am" />
          <Ticket tint="mint" offer="FREE" title="Tote bag with any purchase" merchant="Example grocer" limits="First 100 customers" />
        </div>
      </section>

      <section className="mt-12" aria-labelledby="features-heading">
        <h2 id="features-heading" className="wordmark text-3xl text-ink">
          What you get
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {FEATURES.map(({ title, body, Icon }) => (
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

      <section className="mt-12" aria-labelledby="customers-heading">
        <h2 id="customers-heading" className="wordmark text-3xl text-ink">
          Easy for your customers
        </h2>
        <p className="mt-2 max-w-2xl">
          Shoppers browse over a dozen categories without an account, and sign up with just their email when they want to
          redeem. You never see their personal details, only the redemption.
        </p>
      </section>

      {/* PRICING: the client's pricing goes here once confirmed. Do not show a price until then. */}
      <section className="mt-12 rounded-sm border-[1.5px] border-dashed border-ink bg-white p-5" aria-labelledby="pricing-heading">
        <h2 id="pricing-heading" className="text-xl font-semibold">
          Pricing
        </h2>
        <p className="mt-1">One simple annual plan. Pricing is coming soon.</p>
      </section>

      <div className="mt-10">
        <Link href="/signup?type=merchant" className="btn">
          Create a business account
        </Link>
      </div>
    </div>
  );
}
