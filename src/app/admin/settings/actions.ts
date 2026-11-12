"use server";

import { refresh } from "next/cache";
import { NOT_ADMIN, requireAdminAction } from "@/lib/admin";
import { anetConfigured, anetIsProduction, checkConnection } from "@/lib/authorize-net";
import { startOfDayInZone } from "@/lib/dates";
import { OFFER_TIME_ZONE } from "@/lib/offers";
import { settingsSchema } from "@/lib/validation/admin";
import type { ActionResult } from "@/lib/validation/auth";

// Checks this deployment's Authorize.net keys without a payment. Shows the result, never the keys.
export async function checkAuthorizeNetConnection(): Promise<ActionResult> {
  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;
  if (!anetConfigured()) return { ok: false, error: "Authorize.net is not set up on this deployment." };

  const { connected, code, message } = await checkConnection();
  const text = `${code}: ${message} (${anetIsProduction() ? "production" : "sandbox"} endpoint)`;
  return connected ? { ok: true, message: text } : { ok: false, error: text };
}

export async function updateSettings(input: unknown): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some settings are missing or invalid. Check the form and try again." };

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;

  const v = parsed.data;
  const { data, error } = await ctx.supabase
    .from("platform_settings")
    .update({
      subscription_expiry: v.subscription_expiry,
      founders_rule: v.founders_rule,
      founders_full_early_access: v.founders_full === "early_access",
      payments_open: v.payments_open === "open",
      renewals_enabled: v.renewals_enabled === "on",
      // Applies to Just for You offers published from now on; earlier ones keep the allowance they used.
      private_offers_count_as_campaigns: v.private_offers === "campaign",
      publishing_opens_at: startOfDayInZone(v.publishing_opens_on, OFFER_TIME_ZONE).toISOString(),
      enterprise_contact_email: v.enterprise_contact_email,
      contact_response_time: v.contact_response_time,
    })
    .eq("singleton", true)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "We could not save the settings. Try again in a moment." };

  refresh();
  return { ok: true, message: "Settings saved." };
}
