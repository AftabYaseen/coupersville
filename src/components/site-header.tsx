import Link from "next/link";
import { Suspense } from "react";
import { CircleUser, LayoutDashboard, Store } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";

export function SiteHeader() {
  return (
    <header className="border-b-[1.5px] border-ink bg-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="wordmark text-2xl text-ink">
          Coupersville
        </Link>
        <Suspense fallback={<div className="h-11 w-24" aria-hidden />}>
          <UserNav />
        </Suspense>
      </div>
    </header>
  );
}

async function UserNav() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <Link href="/login" className="btn btn-secondary">
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
    <nav className="flex items-center gap-1 sm:gap-2" aria-label="Account">
      {portal && (
        <Link href={portal.href} className="inline-flex min-h-11 items-center gap-1.5 px-2 font-medium text-ink">
          <portal.Icon aria-hidden size={20} strokeWidth={1.5} />
          <span className="hidden sm:inline">{portal.label}</span>
          <span className="sr-only sm:hidden">{portal.label}</span>
        </Link>
      )}
      <Link href="/account" className="inline-flex min-h-11 items-center gap-1.5 px-2 font-medium text-ink">
        <CircleUser aria-hidden size={20} strokeWidth={1.5} />
        <span className="hidden sm:inline">Account</span>
        <span className="sr-only sm:hidden">Account</span>
      </Link>
      <form action={signOut}>
        <button type="submit" className="btn btn-secondary px-3">
          Sign out
        </button>
      </form>
    </nav>
  );
}
