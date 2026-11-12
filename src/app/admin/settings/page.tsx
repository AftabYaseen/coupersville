import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/admin";
import { dayInZone } from "@/lib/dates";
import { OFFER_TIME_ZONE } from "@/lib/offers";
import { offerNames } from "@/lib/offer-names";
import { PageLoading } from "@/components/page-loading";
import { SettingsForm } from "@/components/admin/settings-form";
import { AnetConnectionCheck } from "@/components/admin/anet-connection-check";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  const { supabase } = await requireAdminPage("/admin/settings");
  const [{ data }, names] = await Promise.all([
    supabase.from("platform_settings").select("*").eq("singleton", true).maybeSingle(),
    offerNames(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink">Settings</h1>
      <p className="mt-2 mb-6">Product decisions for the whole platform.</p>
      {!data ? (
        <p className="panel p-5">The settings row is missing. Run the database migrations, then reload.</p>
      ) : (
        <div className="panel p-5">
          <SettingsForm
            names={{ founding: names.founding, early: names.earlyAccess }}
            defaults={{
              subscription_expiry: data.subscription_expiry,
              founders_rule: data.founders_rule,
              founders_full: data.founders_full_early_access ? "early_access" : "wait",
              payments_open: data.payments_open ? "open" : "closed",
              renewals_enabled: data.renewals_enabled ? "on" : "off",
              private_offers: data.private_offers_count_as_campaigns ? "campaign" : "separate",
              publishing_opens_on: dayInZone(data.publishing_opens_at, OFFER_TIME_ZONE),
              enterprise_contact_email: data.enterprise_contact_email,
              contact_response_time: data.contact_response_time,
            }}
          />
        </div>
      )}
      <section className="panel mt-6 grid gap-3 p-5" aria-labelledby="anet-check-heading">
        <h2 id="anet-check-heading" className="text-xl font-semibold">
          Authorize.net connection
        </h2>
        <p>Checks the saved keys with Authorize.net. No payment is made and the keys are never shown.</p>
        <AnetConnectionCheck />
      </section>
    </div>
  );
}
