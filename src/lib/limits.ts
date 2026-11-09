import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDay } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";
import type { ActionResult } from "@/lib/validation/auth";

// Campaigns and locations. The database decides (count_coupon_campaign, enforce_location_limit);
// this file reads the numbers through business_usage and words them. A null limit is unlimited.

export type BusinessUsage = {
  locationsUsed: number;
  locationsLimit: number | null;
  campaignsUsed: number;
  campaignsLimit: number | null;
  resetsOn: string;
};

export async function loadUsage(supabase: SupabaseClient<Database>, businessId: string): Promise<BusinessUsage | null> {
  const { data, error } = await supabase.rpc("business_usage", { p_business_id: businessId });
  return error ? null : parseUsage(data);
}

export function parseUsage(data: unknown): BusinessUsage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, number | string | null>;
  return {
    locationsUsed: Number(d.locations_used),
    locationsLimit: d.locations_limit === null ? null : Number(d.locations_limit),
    campaignsUsed: Number(d.campaigns_used),
    campaignsLimit: d.campaigns_limit === null ? null : Number(d.campaigns_limit),
    resetsOn: String(d.resets_on),
  };
}

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);
// A calendar day from the database, with no timezone to convert.
const resetDay = (day: string) => formatDay(`${day}T12:00:00Z`, "UTC");

// "2 of 4 campaigns used this month"
export function campaignsText(u: BusinessUsage): string {
  if (u.campaignsLimit === null) return `${u.campaignsUsed} ${plural(u.campaignsUsed, "campaign")} used this month`;
  return `${u.campaignsUsed} of ${u.campaignsLimit} ${plural(u.campaignsLimit, "campaign")} used this month`;
}

export function campaignsResetText(u: BusinessUsage): string {
  return `Each new coupon you publish is one campaign. Editing, pausing and resuming do not count. Resets on ${resetDay(u.resetsOn)}.`;
}

// "1 of 1 location"
export function locationsText(u: BusinessUsage): string {
  if (u.locationsLimit === null) return `${u.locationsUsed} ${plural(u.locationsUsed, "location")}`;
  return `${u.locationsUsed} of ${u.locationsLimit} ${plural(u.locationsLimit, "location")}`;
}

export function atLocationLimit(u: BusinessUsage | null): boolean {
  return u !== null && u.locationsLimit !== null && u.locationsUsed >= u.locationsLimit;
}

export function locationLimitText(limit: number): string {
  return `Your plan includes up to ${limit} ${plural(limit, "location")}. To add or reopen a store, close another one first. The Billing page shows how to get more.`;
}

export function campaignLimitError(resetsOn: string | undefined): ActionResult {
  const when = resetsOn && /^\d{4}-\d{2}-\d{2}$/.test(resetsOn) ? ` They reset on ${resetDay(resetsOn)}.` : "";
  return { ok: false, error: `You have used all your campaigns for this month, so this coupon cannot be published yet.${when} You can save it as a draft for now.` };
}

export function locationLimitError(limit: string | undefined): ActionResult {
  const n = Number(limit);
  return { ok: false, error: Number.isInteger(n) && n > 0 ? locationLimitText(n) : "Your plan has no room for another store. Close one first." };
}
