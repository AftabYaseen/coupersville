import type { Metadata } from "next";
import { Suspense } from "react";
import { requireManagedBusiness } from "@/lib/merchant";
import { PageLoading } from "@/components/page-loading";
import { ConfirmingPayment } from "@/components/merchant/confirming-payment";

export const metadata: Metadata = { title: "Confirming your payment" };

// Stripe sends people here after Checkout. This page changes nothing: it waits until the webhook
// has recorded the plan, then says so.
export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <SuccessContent />
    </Suspense>
  );
}

async function SuccessContent() {
  await requireManagedBusiness("/merchant/billing/success");
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <ConfirmingPayment />
    </div>
  );
}
