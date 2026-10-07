import type { Metadata } from "next";
import { Suspense } from "react";
import { requireMerchantAccess } from "@/lib/auth";
import { PageLoading } from "@/components/page-loading";

export const metadata: Metadata = { title: "Merchant portal" };

export default function MerchantPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <MerchantHome />
    </Suspense>
  );
}

async function MerchantHome() {
  const { user, memberships } = await requireMerchantAccess("/merchant");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink">Merchant portal</h1>
      <p className="mt-2">Signed in as {user.fullName ?? user.email}.</p>

      <section className="panel mt-8 p-5">
        <h2 className="text-xl font-semibold">Your businesses</h2>
        {memberships.length === 0 ? (
          <p className="mt-2">
            You have not set up a business yet. Business setup, locations, and coupons open in the next build phase.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {memberships.map((m) => (
              <li key={m.businessId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{m.businessName}</span>
                <span className="text-sm">
                  {m.role}, {m.businessStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
