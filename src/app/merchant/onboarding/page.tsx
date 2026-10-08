import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireMerchantAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listActiveCategories, listTimezones } from "@/lib/merchant";
import { PageLoading } from "@/components/page-loading";
import { OnboardingForm } from "@/components/merchant/onboarding-form";

export const metadata: Metadata = { title: "Set up your business" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <OnboardingContent />
    </Suspense>
  );
}

async function OnboardingContent() {
  const { user, memberships } = await requireMerchantAccess("/merchant/onboarding");
  if (user.role !== "merchant" && user.role !== "admin") redirect("/merchant");

  const owned = memberships.find((m) => m.role === "owner");
  if (owned && owned.businessStatus !== "draft") redirect("/merchant");

  const supabase = await createClient();
  const [categories, draft] = await Promise.all([
    listActiveCategories(),
    owned
      ? supabase.from("businesses").select("*").eq("id", owned.businessId).single().then((r) => r.data)
      : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink">Open your shop on Main Street</h1>
      <p className="mt-2 mb-8">Tell shoppers who you are and where to find you. It takes about two minutes.</p>
      <OnboardingForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        timezones={listTimezones()}
        defaults={{
          name: draft?.name ?? "",
          description: draft?.description ?? "",
          primaryCategoryId: draft?.primary_category_id ?? "",
          contactEmail: draft?.contact_email ?? user.email ?? "",
          contactPhone: draft?.contact_phone ?? "",
          websiteUrl: draft?.website_url ?? "",
          timezone: draft && draft.timezone !== "UTC" ? draft.timezone : "",
        }}
      />
    </div>
  );
}
