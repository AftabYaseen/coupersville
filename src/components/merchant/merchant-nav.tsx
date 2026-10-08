"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/merchant", label: "Dashboard" },
  { href: "/merchant/coupons", label: "Coupons" },
  { href: "/merchant/locations", label: "Stores" },
  { href: "/merchant/business", label: "Business" },
];

export function MerchantNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/merchant/onboarding")) return null;
  return <MerchantNavLinks pathname={pathname} />;
}

// Rendered on its own as the static fallback, before the current path is known.
export function MerchantNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Merchant" className="border-b-[1.5px] border-ink bg-white">
      <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
        {LINKS.map((link) => {
          const active =
            pathname !== null &&
            (link.href === "/merchant" ? pathname === "/merchant" : pathname.startsWith(link.href));
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-[3px] px-3 font-medium whitespace-nowrap ${
                  active ? "border-ink text-ink" : "border-transparent text-ink-deep"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
