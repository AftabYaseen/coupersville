import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/admin";
import { PageLoading } from "@/components/page-loading";
import { SettingsForm } from "@/components/admin/settings-form";

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
  const { data } = await supabase.from("platform_settings").select("*").eq("singleton", true).maybeSingle();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink">Settings</h1>
      <p className="mt-2 mb-6">
        Product decisions for the whole platform. Some are stored now and applied once the client confirms them; the note
        under each one says how the app behaves today.
      </p>
      {!data ? (
        <p className="panel p-5">The settings row is missing. Run the database migrations, then reload.</p>
      ) : (
        <div className="panel p-5">
          <SettingsForm
            defaults={{
              redemption_method: data.redemption_method,
              coupon_moderation: data.coupon_moderation,
              subscription_expiry: data.subscription_expiry,
              consumer_login: data.consumer_login,
              plans: data.plans,
              region_restriction: data.region_restriction ?? "",
            }}
          />
        </div>
      )}
    </div>
  );
}
