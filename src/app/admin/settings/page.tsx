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
      <p className="mt-2 mb-6">Product decisions for the whole platform.</p>
      {!data ? (
        <p className="panel p-5">The settings row is missing. Run the database migrations, then reload.</p>
      ) : (
        <div className="panel p-5">
          <SettingsForm
            defaults={{ subscription_expiry: data.subscription_expiry, plans: data.plans }}
          />
        </div>
      )}
    </div>
  );
}
