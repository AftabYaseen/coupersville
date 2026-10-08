import type { Metadata } from "next";
import { Suspense } from "react";
import { requireManagedBusiness } from "@/lib/merchant";
import { PageLoading } from "@/components/page-loading";
import { LocationForm } from "@/components/merchant/location-form";

export const metadata: Metadata = { title: "Add store" };

export default function NewLocationPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewLocationContent />
    </Suspense>
  );
}

async function NewLocationContent() {
  await requireManagedBusiness("/merchant/locations/new");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="wordmark mb-8 text-4xl text-ink">Add a store</h1>
      <LocationForm
        defaults={{
          storeName: "",
          storeNumber: "",
          addressLine1: "",
          addressLine2: "",
          city: "",
          state: "",
          postalCode: "",
          phone: "",
          lat: "",
          lng: "",
        }}
      />
    </div>
  );
}
