import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENTERPRISE_OFFER, FOUNDING_OFFER, OFFER_TIME_ZONE } from "@/lib/offers";
import { namesFrom, type OfferNames } from "@/lib/offer-names";
import type { Tables } from "@/lib/supabase/database.types";

// The public Business membership page. Every price, date, seat and limit comes from the offers
// table, so the page always matches what merchants are charged. Only the wording lives here.

type Offer = Tables<"offers">;

export type MembershipLevel = {
  code: string;
  name: string;
  annual: string | null;
  monthly: string | null;
  details: string;
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const longDay = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: OFFER_TIME_ZONE, month: "long", day: "numeric", year: "numeric" }).format(new Date(iso));
// Window ends are stored exclusive; the last day is the day before.
const lastDay = (iso: string) => longDay(new Date(new Date(iso).getTime() - 1).toISOString());

function campaigns(o: Offer, privateSeparate: boolean) {
  const parts: string[] = [];
  if (o.campaigns_per_location) parts.push(`up to ${o.campaigns_per_location} campaigns per location per month`);
  if (privateSeparate && o.private_offers_per_month) {
    parts.push(`${o.private_offers_per_month} Just for You private ${o.private_offers_per_month === 1 ? "offer" : "offers"} per month`);
  }
  return parts.length ? `Includes ${parts.join(" and ")}.` : "";
}

// "Just for You private offers for one customer: 5 a month with Pioneer Circle and Early Bird, 8 with
// Main Street and 12 with Boulevard." Null when they count as campaigns or none is set.
function privateSummary(offers: Offer[]): string | null {
  const groups = new Map<number, string[]>();
  for (const o of offers) {
    if (!o.private_offers_per_month) continue;
    groups.set(o.private_offers_per_month, [...(groups.get(o.private_offers_per_month) ?? []), o.name]);
  }
  const parts = [...groups.entries()].map(([n, names], i) => `${n}${i === 0 ? " a month" : ""} with ${listNames(names)}`);
  if (parts.length === 0) return null;
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Just for You private offers for one customer: ${joined}.`;
}

const listNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// "Pioneer Circle, Early Bird and Main Street include up to 10 campaigns per location per month, and
// Boulevard includes up to 20": levels grouped by their allowance, in table order. Null with none set.
function campaignsSummary(offers: Offer[]): string | null {
  const groups = new Map<number, string[]>();
  for (const o of offers) {
    if (!o.campaigns_per_location) continue;
    groups.set(o.campaigns_per_location, [...(groups.get(o.campaigns_per_location) ?? []), o.name]);
  }
  const parts = [...groups.entries()].map(([n, names], i) =>
    i === 0
      ? `${listNames(names)} ${names.length === 1 ? "includes" : "include"} up to ${n} campaigns per location per month`
      : `${listNames(names)} ${names.length === 1 ? "includes" : "include"} up to ${n}`,
  );
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

// "Paying annually saves $45.00 (31.3%)."
function savings(o: Offer) {
  if (!o.monthly_price_cents) return "";
  const year = o.monthly_price_cents * 12;
  const saved = year - o.annual_price_cents;
  if (saved <= 0) return "";
  return `Paying annually saves ${money(saved)} (${((saved / year) * 100).toFixed(1)}%).`;
}

function details(o: Offer, renewsInto: Offer | undefined, plus: Offer | undefined, privateSeparate: boolean): string {
  const window =
    o.window_starts_at && o.window_ends_at ? `${longDay(o.window_starts_at)} to ${lastDay(o.window_ends_at)}.` : "";
  const starts = o.window_starts_at ? longDay(o.window_starts_at) : null;
  const parts: string[] = [];
  switch (o.code) {
    case FOUNDING_OFFER:
      parts.push(window);
      if (o.free_seats > 0) parts.push(`First ${o.free_seats} qualifying merchants receive one complimentary year.`);
      if (o.seat_cap && o.seat_cap > o.free_seats) parts.push(`The next ${o.seat_cap - o.free_seats} pay the ${o.name} rate.`);
      parts.push("Promotional pricing applies to the initial 12-month term.");
      break;
    case "early_access":
      parts.push(window);
      parts.push(
        `Promotional pricing applies to the initial 12-month term; renewal converts to the then-current ${renewsInto?.name ?? "standard"} rate unless otherwise specified.`,
      );
      break;
    case "general":
      if (starts) parts.push(`Standard pricing beginning ${starts}.`);
      parts.push("For a single-location local business; one-year subscription or month-to-month membership.");
      break;
    case "merchant_plus":
      if (starts) parts.push(`Available beginning ${starts}.`);
      parts.push(`Designed for larger or multi-location businesses; includes up to ${o.max_locations ?? 3} locations.`);
      break;
    case ENTERPRISE_OFFER: {
      const from = plus?.window_starts_at ? longDay(plus.window_starts_at) : null;
      const locations = plus?.max_locations ?? 3;
      const most = plus?.campaigns_per_location;
      return [
        from ? `Available beginning ${from}.` : "",
        `For businesses with more than ${locations} locations${most ? ` or needing more than ${most} campaigns per location per month` : ""}; pricing is set through a customized consultation.`,
      ]
        .filter(Boolean)
        .join(" ");
    }
    default:
      if (window) parts.push(window);
      else if (starts) parts.push(`Available beginning ${starts}.`);
  }
  parts.push(campaigns(o, privateSeparate), savings(o));
  return parts.filter(Boolean).join(" ");
}

export async function membershipLevels(): Promise<{
  levels: MembershipLevel[];
  // A sentence naming each level's campaigns per location per month, from the table.
  campaignsSummary: string | null;
  // Each level's Just for You allowance, or null while they count as campaigns (Admin > Settings).
  privateSummary: string | null;
  plusLocations: number | null;
  names: OfferNames;
}> {
  const db = createAdminClient();
  const [{ data }, { data: settings }] = await Promise.all([
    db.from("offers").select("*").order("sort_order"),
    db.from("platform_settings").select("private_offers_count_as_campaigns").eq("singleton", true).maybeSingle(),
  ]);
  const privateSeparate = !settings?.private_offers_count_as_campaigns;
  const offers = data ?? [];
  const names = namesFrom(offers);
  const now = Date.now();
  const byCode = new Map(offers.map((o) => [o.code, o]));
  const plus = byCode.get("merchant_plus");
  // Paid levels whose sign-up window has not closed, then Enterprise. Admin-only offers (the $1 test) never show.
  const shown = offers.filter(
    (o) => o.code === ENTERPRISE_OFFER || (!o.admin_only && (!o.window_ends_at || new Date(o.window_ends_at).getTime() > now)),
  );
  const levels = shown.map((o) => ({
    code: o.code,
    name: o.name,
    annual: o.code === ENTERPRISE_OFFER ? null : money(o.annual_price_cents),
    monthly: o.code === ENTERPRISE_OFFER || !o.monthly_price_cents ? null : money(o.monthly_price_cents),
    details: details(o, o.renews_into ? byCode.get(o.renews_into) : undefined, plus, privateSeparate),
  }));
  const paidLevels = shown.filter((o) => o.code !== ENTERPRISE_OFFER);
  return {
    levels,
    campaignsSummary: campaignsSummary(paidLevels),
    privateSummary: privateSeparate ? privateSummary(paidLevels) : null,
    plusLocations: plus?.max_locations ?? null,
    names,
  };
}
