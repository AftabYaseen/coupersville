import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDay } from "@/lib/dates";
import { PRIVATE_OFFER_LABEL } from "@/lib/just-for-you";
import type { Database } from "@/lib/supabase/database.types";
import type { ActionResult } from "@/lib/validation/auth";

// Campaigns and locations. The database decides (count_coupon_campaign, enforce_location_limit);
// this file reads the numbers through business_usage and words them. A null limit is unlimited.

// The campaign allowance is campaigns per location times open stores, unless an admin set a total
// for the business. Just for You offers have their own allowance unless the platform setting counts
// them as campaigns.
export type BusinessUsage = {
  locationsUsed: number;
  locationsLimit: number | null;
  campaignsUsed: number;
  campaignsLimit: number | null;
  campaignsPerLocation: number | null;
  campaignsOverride: boolean;
  privateUsed: number;
  privateLimit: number | null;
  privateCountsAsCampaigns: boolean;
  resetsOn: string;
};

export async function loadUsage(supabase: SupabaseClient<Database>, businessId: string): Promise<BusinessUsage | null> {
  const { data, error } = await supabase.rpc("business_usage", { p_business_id: businessId });
  return error ? null : parseUsage(data);
}

export function parseUsage(data: unknown): BusinessUsage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  // A missing or null limit is unlimited.
  const limit = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    locationsUsed: Number(d.locations_used),
    locationsLimit: limit(d.locations_limit),
    campaignsUsed: Number(d.campaigns_used),
    campaignsLimit: limit(d.campaigns_limit),
    campaignsPerLocation: limit(d.campaigns_per_location),
    campaignsOverride: d.campaigns_override === true,
    privateUsed: Number(d.private_used ?? 0),
    privateLimit: limit(d.private_limit),
    privateCountsAsCampaigns: d.private_counts_as_campaigns === true,
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

// How the allowance is worked out: "10 per location each month, with 1 open store."
export function campaignsAllowanceText(u: BusinessUsage): string {
  if (u.campaignsLimit === null) return "";
  if (u.campaignsOverride) return "Coupersville set this allowance for your business.";
  if (u.campaignsPerLocation === null) return "";
  return `Your plan includes ${u.campaignsPerLocation} per location each month, with ${u.locationsUsed} open ${plural(u.locationsUsed, "store")}.`;
}

export function campaignsResetText(u: BusinessUsage): string {
  const allowance = campaignsAllowanceText(u);
  return `${allowance ? `${allowance} ` : ""}Each new coupon you publish is one campaign. Editing, pausing and resuming do not count. Resets on ${resetDay(u.resetsOn)}.`;
}

// "1 of 5 Just for You offers used this month". Null when they count as campaigns.
export function privateOffersText(u: BusinessUsage): string | null {
  if (u.privateCountsAsCampaigns) return null;
  if (u.privateLimit === null) return `${u.privateUsed} Just for You ${plural(u.privateUsed, "offer")} used this month`;
  return `${u.privateUsed} of ${u.privateLimit} Just for You ${plural(u.privateLimit, "offer")} used this month`;
}

export function privateLimitError(resetsOn: string | undefined): ActionResult {
  const when = resetsOn && /^\d{4}-\d{2}-\d{2}$/.test(resetsOn) ? ` They reset on ${resetDay(resetsOn)}.` : "";
  return {
    ok: false,
    error: `You have used all your Just for You offers for this month, so this ${PRIVATE_OFFER_LABEL} cannot be published yet.${when} You can save it as a draft for now.`,
  };
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
