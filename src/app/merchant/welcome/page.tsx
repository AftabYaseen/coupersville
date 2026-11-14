import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireManagedBusiness } from "@/lib/merchant";
import { createAdminClient } from "@/lib/supabase/admin";
import { pioneerOffer } from "@/lib/pioneer";
import { PageLoading } from "@/components/page-loading";
import { PioneerCircleContent } from "@/components/pioneer-circle-content";

export const metadata: Metadata = { title: "Welcome" };

// The Pioneer Circle welcome, shown once to a business that has just finished setup while the
// founding offer's window is open (onboarding sends it here). Opening it records the time, so any
// later visit goes straight to the dashboard. Nothing to sign or tick: the button only continues.
export default function WelcomePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <WelcomeContent />
    </Suspense>
  );
}

async function WelcomeContent() {
  const { business, role } = await requireManagedBusiness("/merchant/welcome");
  if (role !== "owner" || business.pioneer_welcome_seen_at) redirect("/merchant");

  // Only the first opening claims it, so two tabs cannot both show it as new.
  const { data: claimed } = await createAdminClient()
    .from("businesses")
    .update({ pioneer_welcome_seen_at: new Date().toISOString() })
    .eq("id", business.id)
    .is("pioneer_welcome_seen_at", null)
    .select("id");
  if (!claimed?.length) redirect("/merchant");

  const offer = await pioneerOffer();
  const done = (
    <Link href="/merchant" className="btn">
      Got it, take me to my dashboard
    </Link>
  );
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="mb-6 rounded-sm border border-line bg-white p-4">
        {business.name} is set up. You joined during the {offer.name} window, so here is what being a Pioneer looks like. You can
        read it again any time on the{" "}
        <Link href="/pioneer-circle" className="font-medium text-primary underline underline-offset-4">
          {offer.name} page
        </Link>
        , linked at the bottom of every page.
      </p>
      <PioneerCircleContent offer={offer} />
      <div className="mt-8">{done}</div>
    </div>
  );
}
