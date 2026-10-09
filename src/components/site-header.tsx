import Link from "next/link";
import { Suspense } from "react";
import { Bookmark, CircleUser, LayoutDashboard, Search, Store, type LucideIcon } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";

function NavLink({ href, label, Icon }: { href: string; label: string; Icon: LucideIcon }) {
  return (
    <Link href={href} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2 font-medium text-ink">
      <Icon aria-hidden size={20} strokeWidth={1.5} />
      <span className="sr-only md:not-sr-only">{label}</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b-[1.5px] border-ink bg-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-4">
        <Link href="/" className="wordmark text-2xl text-ink">
          Coupersville
        </Link>
        <div className="flex items-center gap-1">
          <NavLink href="/search" label="Search" Icon={Search} />
          <Suspense fallback={<div className="h-11 w-11" aria-hidden />}>
            <UserNav />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

async function UserNav() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <Link href="/login" className="btn btn-secondary ml-1 px-3">
        Sign in
      </Link>
    );
  }

  const portal =
    user.role === "admin"
      ? { href: "/admin", label: "Admin", Icon: LayoutDashboard }
      : user.role === "merchant"
        ? { href: "/merchant", label: "Merchant portal", Icon: Store }
        : null;

  return (
    <nav className="flex items-center gap-1" aria-label="Account">
      {portal && <NavLink {...portal} />}
      <NavLink href="/saved" label="Saved" Icon={Bookmark} />
      <NavLink href="/account" label="Account" Icon={CircleUser} />
      <form action={signOut} className="hidden sm:block">
        <button type="submit" className="btn btn-secondary ml-1 px-3">
          Sign out
        </button>
      </form>
    </nav>
  );
}
