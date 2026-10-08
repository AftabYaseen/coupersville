import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireManagedBusiness } from "@/lib/merchant";
import { PageLoading } from "@/components/page-loading";
import { LocationForm } from "@/components/merchant/location-form";

export const metadata: Metadata = { title: "Edit store" };

export default function EditLocationPage({ params }: PageProps<"/merchant/locations/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditLocationContent params={params} />
    </Suspense>
  );
}

async function EditLocationContent({ params }: { params: PageProps<"/merchant/locations/[id]">["params"] }) {
  const { id } = await params;
  const { business, supabase } = await requireManagedBusiness(`/merchant/locations/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();

  const { data: loc } = await supabase
    .from("locations")
    .select("*, lat, lng")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!loc) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="wordmark mb-8 text-4xl text-ink">Edit {loc.store_name}</h1>
      <LocationForm
        locationId={loc.id}
        defaults={{
          storeName: loc.store_name,
          storeNumber: loc.store_number ?? "",
          addressLine1: loc.address_line1,
          addressLine2: loc.address_line2 ?? "",
          city: loc.city,
          state: loc.state ?? "",
          postalCode: loc.postal_code ?? "",
          phone: loc.phone ?? "",
          lat: loc.lat ?? "",
          lng: loc.lng ?? "",
        }}
      />
    </div>
  );
}
