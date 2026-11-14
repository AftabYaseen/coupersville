import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Bookmark, CircleUser, History, LayoutDashboard, ScanLine, Search, Store, type LucideIcon } from "lucide-react";
import { getMemberships, getSessionUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { JOIN_HREF } from "@/lib/site-copy";

function NavLink({ href, label, Icon }: { href: string; label: string; Icon: LucideIcon }) {
  return (
    <Link href={href} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2.5 font-medium text-primary hover:bg-mint-100">
      <Icon aria-hidden size={20} strokeWidth={1.5} />
      <span className="sr-only md:not-sr-only">{label}</span>
    </Link>
  );
}

const SITE_LINKS = [
  { href: "/search", label: "Find deals" },
  { href: "/explore", label: "Explore" },
  { href: "/how-to-save", label: "How to save" },
  { href: "/for-businesses", label: "For businesses" },
  { href: "/business-membership", label: "Business membership" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-cream-50">
      <div className="mx-auto flex min-h-[72px] max-w-5xl items-center justify-between gap-3 px-4">
        {/* The horizontal lockup; at least 120px wide (brand minimum). */}
        <Link href="/" className="inline-flex min-h-11 shrink-0 items-center rounded-sm">
          <Image
            src="/brand/coupersville-logo-horizontal.svg"
            alt="Coupersville"
            width={714}
            height={164}
            unoptimized
            preload
            className="h-9 w-auto sm:h-10"
          />
        </Link>
        <div className="flex items-center gap-1">
          <Suspense fallback={<div className="h-11 w-11" aria-hidden />}>
            <UserNav />
          </Suspense>
        </div>
      </div>
      <div className="border-t border-line">
        <nav aria-label="Coupersville" className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-1 px-2">
          {SITE_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex min-h-11 items-center rounded-sm px-2.5 text-sm font-medium text-evergreen-900 hover:bg-mint-100 hover:text-primary"
            >
              {l.label}
            </Link>
          ))}
          <Suspense fallback={null}>
            <MerchantSignIn />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}

// Shoppers never need to sign in from the header: saving or redeeming asks for their email.
async function MerchantSignIn() {
  if (await getSessionUser()) return null;
  return (
    <Link href="/login" className="inline-flex min-h-11 items-center rounded-sm px-2.5 text-sm font-semibold text-primary hover:underline">
      Merchant sign in
    </Link>
  );
}

async function UserNav() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <nav className="flex items-center gap-2" aria-label="Get started">
        <Link href={JOIN_HREF} className="btn btn-secondary hidden px-3 sm:inline-flex">
          Join Coupersville
        </Link>
        <Link href="/search" className="btn px-3">
          Find a deal
        </Link>
      </nav>
    );
  }

  // Staff who are shoppers otherwise get a direct way to their shop's scanner.
  const memberships = user.role === "consumer" ? await getMemberships(user.id) : [];
  const portal =
    user.role === "admin"
      ? { href: "/admin", label: "Admin", Icon: LayoutDashboard }
      : user.role === "merchant"
        ? { href: "/merchant", label: "Merchant portal", Icon: Store }
        : memberships.length > 0
          ? { href: "/merchant/scan", label: "Scanner", Icon: ScanLine }
          : null;

  return (
    <nav className="flex items-center gap-1" aria-label="Account">
      {portal && <NavLink {...portal} />}
      {!portal && <NavLink href="/search" label="Find deals" Icon={Search} />}
      <NavLink href="/saved" label="Saved" Icon={Bookmark} />
      {!portal && <NavLink href="/history" label="History" Icon={History} />}
      <NavLink href="/account" label="Account" Icon={CircleUser} />
      <form action={signOut} className="hidden sm:block">
        <button type="submit" className="btn btn-secondary ml-1 px-3">
          Sign out
        </button>
      </form>
    </nav>
  );
}
