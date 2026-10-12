import type { Metadata } from "next";
import { Suspense } from "react";
import { requireManagedBusiness } from "@/lib/merchant";
import { planState } from "@/lib/billing";
import { annualPriceLabel, stripeCustomerFor } from "@/lib/stripe";
import { PageLoading } from "@/components/page-loading";
import { FormMessage } from "@/components/field";
import { PlanPanel } from "@/components/merchant/plan-panel";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage({ searchParams }: PageProps<"/merchant/billing">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <BillingContent searchParams={searchParams} />
    </Suspense>
  );
}

function clockNow() {
  return Date.now();
}

async function BillingContent({ searchParams }: { searchParams: PageProps<"/merchant/billing">["searchParams"] }) {
  const { checkout } = await searchParams;
  const { business, supabase } = await requireManagedBusiness("/merchant/billing");
  const [{ data: plan }, customer, priceLabel] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("business_id", business.id).maybeSingle(),
    stripeCustomerFor(business.id),
    annualPriceLabel(),
  ]);

  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-10">
      <div>
        <h1 className="wordmark text-4xl text-ink">Billing</h1>
        <p className="mt-2">One annual plan keeps your coupons live on Main Street.</p>
      </div>
      {checkout === "canceled" && <FormMessage tone="error">Checkout was cancelled. You have not been charged.</FormMessage>}
      <PlanPanel state={planState(plan, clockNow())} timeZone={business.timezone} hasBillingAccount={Boolean(customer)} priceLabel={priceLabel} />
      <p className="text-sm">
        Payments are handled by Stripe. Coupersville never sees or stores your card details.
      </p>
    </div>
  );
}
