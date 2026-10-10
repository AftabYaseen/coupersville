"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavLink } from "@/lib/merchant-links";

export function MerchantNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  if (pathname.startsWith("/merchant/onboarding")) return null;
  return <MerchantNavLinks pathname={pathname} links={links} />;
}

// Rendered on its own as the static fallback, before the current path and role are known.
export function MerchantNavLinks({ pathname, links }: { pathname: string | null; links: NavLink[] }) {
  return (
    <nav aria-label="Merchant" className="min-h-11 border-b-[1.5px] border-ink bg-white">
      <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
        {links.map((link) => {
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
