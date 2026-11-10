import Link from "next/link";
import { cacheLife } from "next/cache";
import { BRAND_LINE, ENDING_SOON_HREF, JOIN_HREF } from "@/lib/site-copy";

// Explore, Business membership, About and Contact join these when their pages exist. Coupon terms,
// Business membership terms and Accessibility wait for the client's texts.
const GROUPS = [
  {
    label: "For shoppers",
    links: [
      { href: "/search", label: "Find deals" },
      { href: "/how-to-save", label: "How to save" },
      { href: ENDING_SOON_HREF, label: "Ending soon" },
    ],
  },
  {
    label: "For businesses",
    links: [
      { href: "/for-businesses", label: "For businesses" },
      { href: JOIN_HREF, label: "Join Coupersville" },
      { href: "/login", label: "Merchant sign in" },
    ],
  },
  {
    label: "Coupersville",
    links: [
      { href: "/privacy", label: "Privacy notice" },
      { href: "/terms", label: "Terms of use" },
    ],
  },
];

async function currentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

export async function SiteFooter() {
  const year = await currentYear();
  return (
    <footer className="mt-16 border-t-[1.5px] border-ink bg-white">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
        <div>
          <Link href="/" className="wordmark text-xl text-ink">
            Coupersville
          </Link>
          <p className="mt-2 text-sm">
            Coupersville helps shoppers discover digital coupons and gives participating businesses an easy way to create, publish
            and manage their own offers.
          </p>
          <p className="mt-2 text-sm font-semibold">{BRAND_LINE}</p>
        </div>
        {GROUPS.map((g) => (
          <nav key={g.label} aria-label={g.label}>
            <p className="font-semibold">{g.label}</p>
            <ul className="mt-1">
              {g.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-flex min-h-11 items-center font-medium text-ink underline-offset-4 hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="mx-auto max-w-5xl px-4 pb-8 text-sm tabular">© {year} Coupersville. All rights reserved.</p>
    </footer>
  );
}
