import Image from "next/image";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { BRAND_LINE, ENDING_SOON_HREF, JOIN_HREF } from "@/lib/site-copy";
import { pioneerOffer } from "@/lib/pioneer";

// Coupon terms, Business membership terms and Accessibility wait for the client's texts.
// The Pioneer Circle link takes its label from the offers table (cached for an hour).
const groups = (pioneerName: string) => [
  {
    label: "For shoppers",
    links: [
      { href: "/search", label: "Find deals" },
      { href: "/explore", label: "Explore" },
      { href: "/how-to-save", label: "How to save" },
      { href: ENDING_SOON_HREF, label: "Ending soon" },
    ],
  },
  {
    label: "For businesses",
    links: [
      { href: "/for-businesses", label: "For businesses" },
      { href: "/business-membership", label: "Business membership" },
      { href: "/pioneer-circle", label: pioneerName },
      { href: JOIN_HREF, label: "Join Coupersville" },
      { href: "/login", label: "Merchant sign in" },
    ],
  },
  {
    label: "Coupersville",
    links: [
      { href: "/about", label: "About" },
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact" },
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
  const [year, pioneer] = await Promise.all([currentYear(), pioneerOffer()]);
  return (
    <footer className="mt-16 bg-evergreen-900 text-[#c9d6cf]">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
        <div>
          {/* The reversed logo, for dark surfaces. */}
          <Link href="/" className="inline-flex min-h-11 items-center rounded-sm">
            <Image
              src="/brand/coupersville-logo-reversed-transparent.svg"
              alt="Coupersville"
              width={714}
              height={164}
              unoptimized
              className="h-9 w-auto"
            />
          </Link>
          <p className="mt-3 text-sm">
            Coupersville helps shoppers discover digital coupons and gives participating businesses an easy way to create, publish
            and manage their own offers.
          </p>
          <p className="mt-2 text-sm font-semibold text-white">{BRAND_LINE}</p>
        </div>
        {groups(pioneer.name).map((g) => (
          <nav key={g.label} aria-label={g.label}>
            <p className="font-semibold text-white">{g.label}</p>
            <ul className="mt-1">
              {g.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-[#c9d6cf] underline-offset-4 hover:text-white hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="mx-auto max-w-5xl border-t border-white/15 px-4 py-5 text-sm tabular">© {year} Coupersville. All rights reserved.</p>
    </footer>
  );
}
