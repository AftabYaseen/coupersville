import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, QrCode, Search, UserRound, type LucideIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "How it works",
  description: "Browse coupons from local shops, save the ones you like, and redeem them in store with a QR code. Browsing needs no account.",
};

const STEPS: { title: string; body: string; Icon: LucideIcon }[] = [
  {
    title: "Browse deals",
    body: "Look through coupons from the shops in town, by category, by search, or near you. Over a dozen categories, from bakeries to shoes. No account needed to browse.",
    Icon: Search,
  },
  {
    title: "Sign up once",
    body: "When you want to save or redeem a coupon, enter your email and the code we send you. That makes your free shopper account. No password needed.",
    Icon: UserRound,
  },
  {
    title: "Save instantly",
    body: "Tap Save coupon and it goes in your saved list, ready for when you are in the shop.",
    Icon: Bookmark,
  },
  {
    title: "Redeem with QR",
    body: "At the counter, tap Redeem now. Staff scan the QR code, or type the 6-digit code, and the discount is yours. Each code works once and only for a few minutes.",
    Icon: QrCode,
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink sm:text-5xl">How Coupersville works</h1>
      <p className="mt-3 max-w-xl text-lg">Coupons from the shops in your town, on your phone. Here is the whole thing in four steps.</p>

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

      <section className="mt-10" aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="wordmark text-3xl text-ink">
          Good to know
        </h2>
        <ul className="mt-4 grid gap-3">
          <li className="panel p-5">
            <h3 className="font-semibold">Browsing is open to everyone</h3>
            <p className="mt-1">You only need an account to save or redeem a coupon. The shopper account is free.</p>
          </li>
          <li className="panel p-5">
            <h3 className="font-semibold">Each shop sets its own rules</h3>
            <p className="mt-1">
              A coupon might work once per person, a few times, or every day. Some only work on certain days or hours, or need a
              minimum spend. Every coupon shows its rules in plain words before you redeem.
            </p>
          </li>
          <li className="panel p-5">
            <h3 className="font-semibold">Shops never see who you are</h3>
            <p className="mt-1">Staff see the coupon and its limits when they scan, never your name or email.</p>
          </li>
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/search" className="btn">
          Browse coupons
        </Link>
        <Link href="/for-businesses" className="btn btn-secondary">
          Coupersville for businesses
        </Link>
      </div>
    </div>
  );
}
