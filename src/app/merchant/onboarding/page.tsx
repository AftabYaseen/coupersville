import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireMerchantAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listActiveCategories, listTimezones } from "@/lib/merchant";
import { businessSignupSchema } from "@/lib/validation/auth";
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
  const [categories, draft, { data: auth }] = await Promise.all([
    listActiveCategories(),
    owned
      ? supabase.from("businesses").select("*").eq("id", owned.businessId).single().then((r) => r.data)
      : Promise.resolve(null),
    supabase.auth.getUser(),
  ]);

  // What the merchant entered on the sign-up form, kept with the account until now. Only a starting
  // point: the form validates everything again on save.
  const signup = businessSignupSchema.partial().safeParse(auth.user?.user_metadata?.business_signup);
  const s = signup.success ? signup.data : {};
  const categoryId = categories.some((c) => c.id === s.primary_category_id) ? s.primary_category_id : "";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink">Welcome to Coupersville.</h1>
      <p className="mt-2 mb-8">
        Your business account has been created. Complete your business profile, add your locations and create your first offer.
      </p>
      <OnboardingForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        timezones={listTimezones()}
        defaults={{
          name: draft?.name ?? s.name ?? "",
          description: draft?.description ?? "",
          primaryCategoryId: draft?.primary_category_id ?? categoryId ?? "",
          contactEmail: draft?.contact_email ?? user.email ?? "",
          contactPhone: draft?.contact_phone ?? s.contact_phone ?? "",
          websiteUrl: draft?.website_url ?? s.website_url ?? "",
          timezone: draft && draft.timezone !== "UTC" ? draft.timezone : "",
        }}
        locationDefaults={{
          storeName: draft?.name ?? s.name ?? "",
          storeNumber: "",
          addressLine1: s.address_line1 ?? "",
          addressLine2: "",
          city: s.city ?? "",
          state: s.state ?? "",
          postalCode: s.postal_code ?? "",
          country: s.country ?? "",
          phone: s.contact_phone ?? "",
          lat: "",
          lng: "",
        }}
      />
    </div>
  );
}
