"use server";

import { refresh } from "next/cache";
import { NOT_ADMIN, requireAdminAction } from "@/lib/admin";
import { startOfDayInZone } from "@/lib/dates";
import { OFFER_TIME_ZONE } from "@/lib/offers";
import { settingsSchema } from "@/lib/validation/admin";
import type { ActionResult } from "@/lib/validation/auth";

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
      publishing_opens_at: startOfDayInZone(v.publishing_opens_on, OFFER_TIME_ZONE).toISOString(),
    })
    .eq("singleton", true)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "We could not save the settings. Try again in a moment." };

  refresh();
  return { ok: true, message: "Settings saved." };
}
