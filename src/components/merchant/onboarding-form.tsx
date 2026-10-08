"use client";

import { useEffect, useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { completeOnboarding } from "@/app/merchant/onboarding/actions";
import { isValidTimeZone } from "@/lib/dates";
import { onboardingSchema, type OnboardingInput } from "@/lib/validation/merchant";
import { FormMessage } from "@/components/field";
import { BusinessFields, type CategoryOption } from "@/components/merchant/business-fields";
import { LocationFields } from "@/components/merchant/location-fields";

export function OnboardingForm({
  categories,
  timezones,
  defaults,
}: {
  categories: CategoryOption[];
  timezones: string[];
  defaults: OnboardingInput["business"];
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      business: defaults,
      location: {
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
      },
    },
  });

  useEffect(() => {
    if (form.getValues("business.timezone")) return;
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidTimeZone(browserZone) && timezones.includes(browserZone)) {
      form.setValue("business.timezone", browserZone);
    }
  }, [form, timezones]);

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await completeOnboarding(values);
      if (!result.ok) setServerError(result.error);
    });
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="grid gap-8">
        {serverError && <FormMessage tone="error">{serverError}</FormMessage>}

        <section className="panel p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Your business</h2>
          <p className="mt-1 mb-5 text-sm">Shoppers see this on every coupon you publish.</p>
          <BusinessFields prefix="business." categories={categories} timezones={timezones} />
        </section>

        <section className="panel p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Your first store</h2>
          <p className="mt-1 mb-5 text-sm">You can add more stores later.</p>
          <LocationFields prefix="location." />
        </section>

        <button type="submit" className="btn w-full sm:w-auto sm:justify-self-start" disabled={pending}>
          {pending ? "Opening your shop" : "Open my shop"}
        </button>
      </form>
    </FormProvider>
  );
}
