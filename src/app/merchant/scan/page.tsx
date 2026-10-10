import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireMerchantAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageLoading } from "@/components/page-loading";
import { Scanner, type ScanStore } from "@/components/merchant/scanner";

export const metadata: Metadata = { title: "Scanner" };

export default function ScanPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ScanContent />
    </Suspense>
  );
}

async function ScanContent() {
  const { user, memberships } = await requireMerchantAccess("/merchant/scan");
  const teams = memberships.filter((m) => m.businessStatus !== "draft");
  if (teams.length === 0) {
    if (user.role === "merchant" || memberships.some((m) => m.role === "owner")) redirect("/merchant/onboarding");
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="wordmark text-4xl text-ink">Scanner</h1>
        <p className="panel mt-6 p-5">You are not on a shop&apos;s team yet. Ask the owner to send you an invite link.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: locations } = await supabase
    .from("locations")
    .select("id, business_id, store_name, store_number, city")
    .in(
      "business_id",
      teams.map((t) => t.businessId),
    )
    .eq("active", true)
    .order("store_name");

  const names = new Map(teams.map((t) => [t.businessId, t.businessName]));
  const stores: ScanStore[] = (locations ?? []).map((l) => ({
    id: l.id,
    label: l.store_number ? `${l.store_name} #${l.store_number}` : l.store_name,
    detail: teams.length > 1 ? `${names.get(l.business_id)}, ${l.city}` : l.city,
  }));

  if (stores.length === 0) {
    const manages = teams.some((t) => t.role !== "staff");
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="wordmark text-4xl text-ink">Scanner</h1>
        <div className="panel mt-6 grid gap-4 p-5">
          <p>There are no open stores to redeem at.</p>
          {manages ? (
            <Link href="/merchant/locations/new" className="btn justify-self-start">
              Add store
            </Link>
          ) : (
            <p>Ask the owner to open a store, then come back.</p>
          )}
        </div>
      </div>
    );
  }

  return <Scanner stores={stores} />;
}
