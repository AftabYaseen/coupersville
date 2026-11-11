import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Merchant sign in",
  description: "Sign in to manage your business, create offers, scan coupons and review redemption activity.",
};

const NOTICES: Record<string, string> = {
  link: "That link has expired or was already used. Sign in, or request a new link.",
  suspended: "This account is suspended. Contact Coupersville support for help.",
};

// Merchants and admins sign in here. A shopper only lands here from the sign-in sheet's password
// option, which always carries a next address back to a shopper page; they get plain wording.
function forShopper(next: string | undefined) {
  return Boolean(next && next.startsWith("/") && !next.startsWith("/merchant") && !next.startsWith("/admin"));
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    // No form in the fallback: which wording to show depends on the address, so a shopper would
    // otherwise see the business wording for a moment.
    <Suspense fallback={<p className="min-h-96">Loading</p>}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginContent({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const error = typeof params.error === "string" ? NOTICES[params.error] : undefined;
  return <LoginForm next={next} notice={error} business={!forShopper(next)} />;
}
