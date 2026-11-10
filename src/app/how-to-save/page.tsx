import type { Metadata } from "next";
import Link from "next/link";
import { PartyPopper, QrCode, ScanLine, Search, type LucideIcon } from "lucide-react";
import { ACCOUNT_LINE } from "@/lib/site-copy";

export const metadata: Metadata = {
  title: "How to use Coupersville coupons",
  description: "Find a deal, get your one-time QR coupon at the business, show it to be scanned and enjoy the savings.",
};

const STEPS: { title: string; body: string; Icon: LucideIcon }[] = [
  {
    title: "Find a deal",
    body: "Browse Coupersville by category, business or location. Review the offer, participating locations, limits and expiration date.",
    Icon: Search,
  },
  {
    title: "Get your coupon",
    body: "When you are at the business and ready to redeem, select Get my coupon to create your one-time QR coupon. The first time, you enter your email and the one-time code we send you.",
    Icon: QrCode,
  },
  {
    title: "Show the QR code",
    body: "Present the QR code to the business representative for scanning, or read out the 6-digit code beneath it. The code is valid for one redemption only.",
    Icon: ScanLine,
  },
  {
    title: "Enjoy your savings",
    body: "Once the business confirms the coupon, your offer is redeemed and your discount can be applied to the eligible purchase.",
    Icon: PartyPopper,
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Do I need an account?",
    a: `Not to browse. To save or redeem a coupon, you sign up with your email. ${ACCOUNT_LINE}`,
  },
  {
    q: "Can I use the same coupon more than once?",
    a: "Each QR coupon you generate works for one redemption. Whether you can use the deal again depends on the offer: each coupon shows its own limit, such as one per customer, up to a few times, or once a day.",
  },
  {
    q: "Can I take a screenshot of the QR code?",
    a: "Do not rely on a screenshot. QR coupons are time-limited and validated when scanned.",
  },
  {
    q: "What if the coupon expires?",
    a: "Expired coupons cannot be redeemed. The coupon page will show the expiration date and any other restrictions.",
  },
  {
    q: "Where can I use the coupon?",
    a: "Each coupon lists the participating business locations. Some offers apply at every location, while others apply only at selected stores.",
  },
  {
    q: "Who applies the discount?",
    a: "The participating business applies the discount after validating the coupon and confirming that the purchase meets the offer terms.",
  },
];

export default function HowToSavePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink sm:text-5xl">Find it. Get it. Scan it. Save.</h1>
      <p className="mt-3 max-w-xl text-lg">Coupersville makes saving simple. {ACCOUNT_LINE}</p>

      <ol className="mt-8 grid gap-4">
        {STEPS.map(({ title, body, Icon }, i) => (
          <li key={title} className="panel flex gap-4 p-5">
            <span className="offer-text flex size-12 shrink-0 items-center justify-center rounded-sm bg-marigold text-3xl text-ink-deep tabular" aria-hidden>
              {i + 1}
            </span>
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Icon aria-hidden size={20} strokeWidth={1.5} className="text-ink" />
                {title}
              </h2>
              <p className="mt-1">{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-6 rounded-sm border-[1.5px] border-ink bg-stock-butter p-4">
        <span className="font-semibold">Important:</span> Each QR coupon is intended for one customer and one redemption. Do not
        generate the code until you are ready to use it.
      </p>

      <div className="mt-6">
        <Link href="/search" className="btn">
          Start finding deals
        </Link>
      </div>

      <section className="mt-12" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="wordmark text-3xl text-ink">
          Frequently asked questions
        </h2>
        <dl className="mt-4 grid gap-3">
          {FAQ.map(({ q, a }) => (
            <div key={q} className="panel p-5">
              <dt className="font-semibold">{q}</dt>
              <dd className="mt-1">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
