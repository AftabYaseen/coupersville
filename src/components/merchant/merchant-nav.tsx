"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavLink } from "@/lib/merchant-links";

export function MerchantNav({ links, label = "Merchant" }: { links: NavLink[]; label?: string }) {
  const pathname = usePathname();
  if (pathname.startsWith("/merchant/onboarding")) return null;
  return <MerchantNavLinks pathname={pathname} links={links} label={label} />;
}

// Rendered on its own as the static fallback, before the current path and role are known.
// Also used for the admin portal.
export function MerchantNavLinks({
  pathname,
  links,
  label = "Merchant",
}: {
  pathname: string | null;
  links: NavLink[];
  label?: string;
}) {
  return (
    <nav aria-label={label} className="min-h-11 border-b border-line bg-white">
      <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
        {links.map((link) => {
          // A portal's home link ("/merchant", "/admin") only matches itself.
          const isHome = link.href.split("/").length === 2;
          const active =
            pathname !== null && (isHome ? pathname === link.href : pathname.startsWith(link.href));
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-[3px] px-3 font-medium whitespace-nowrap ${
                  active ? "border-line text-primary" : "border-transparent text-evergreen-900"
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
