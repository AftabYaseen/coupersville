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

function campaigns(o: Offer) {
  return o.campaigns_per_month ? `Includes up to ${o.campaigns_per_month} campaigns per month.` : "";
}

// "Paying annually saves $45.00 (31.3%)."
function savings(o: Offer) {
  if (!o.monthly_price_cents) return "";
  const year = o.monthly_price_cents * 12;
  const saved = year - o.annual_price_cents;
  if (saved <= 0) return "";
  return `Paying annually saves ${money(saved)} (${((saved / year) * 100).toFixed(1)}%).`;
}

function details(o: Offer, renewsInto: Offer | undefined, plus: Offer | undefined): string {
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
      const most = plus?.campaigns_per_month ?? 4;
      return [
        from ? `Available beginning ${from}.` : "",
        `For businesses with more than ${locations} locations and needing more than ${most} campaigns per month; pricing is set through a customized consultation.`,
      ]
        .filter(Boolean)
        .join(" ");
    }
    default:
      if (window) parts.push(window);
      else if (starts) parts.push(`Available beginning ${starts}.`);
  }
  parts.push(campaigns(o), savings(o));
  return parts.filter(Boolean).join(" ");
}

export async function membershipLevels(): Promise<{
  levels: MembershipLevel[];
  campaignsEach: number | null;
  plusLocations: number | null;
  names: OfferNames;
}> {
  const { data } = await createAdminClient().from("offers").select("*").order("sort_order");
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
    details: details(o, o.renews_into ? byCode.get(o.renews_into) : undefined, plus),
  }));
  const counts = new Set(shown.filter((o) => o.code !== ENTERPRISE_OFFER).map((o) => o.campaigns_per_month));
  return {
    levels,
    campaignsEach: counts.size === 1 ? ([...counts][0] ?? null) : null,
    plusLocations: plus?.max_locations ?? null,
    names,
  };
}
