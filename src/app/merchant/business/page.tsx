import type { Metadata } from "next";
import { Suspense } from "react";
import { listActiveCategories, listTimezones, requireManagedBusiness } from "@/lib/merchant";
import { PageLoading } from "@/components/page-loading";
import { BusinessForm, BusinessImages } from "@/components/merchant/business-form";

export const metadata: Metadata = { title: "Business profile" };

export default function BusinessPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <BusinessContent />
    </Suspense>
  );
}

async function BusinessContent() {
  const { business } = await requireManagedBusiness("/merchant/business");
  const categories = await listActiveCategories();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink">Business profile</h1>
      <p className="mt-2 mb-8">This is how your shop appears to people in Coupersville.</p>
      <div className="grid gap-8">
        <BusinessImages businessId={business.id} logoPath={business.logo_path} coverPath={business.cover_path} />
        <BusinessForm
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          timezones={listTimezones()}
          defaults={{
            name: business.name,
            description: business.description ?? "",
            primaryCategoryId: business.primary_category_id ?? "",
            contactEmail: business.contact_email ?? "",
            contactPhone: business.contact_phone ?? "",
            websiteUrl: business.website_url ?? "",
            timezone: business.timezone,
          }}
        />
      </div>
    </div>
  );
}
