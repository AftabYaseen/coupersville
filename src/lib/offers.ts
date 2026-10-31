import type { Database } from "@/lib/supabase/database.types";
import { formatDay } from "@/lib/dates";

// Offers (Founding Merchant, Early Access, General, ...) are rows in public.offers, read through
// offer_overview() with the seats used. Windows are [starts, ends): the end is exclusive.

type Overview = Database["public"]["Functions"]["offer_overview"]["Returns"][number];
type Nullable = "window_starts_at" | "window_ends_at" | "seat_cap" | "term_months" | "monthly_price_cents" | "renews_into" | "max_locations" | "max_live_coupons";
// Generated function types mark every column as set; these can be null.
export type Offer = Omit<Overview, Nullable> & { [K in Nullable]: Overview[K] | null };

export const FOUNDING_OFFER = "founding_merchant";

// Offers and Founding seats are dated in Pacific time, like the launch date.
export const OFFER_TIME_ZONE = "America/Los_Angeles";

export function formatPrice(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export function inWindow(offer: Pick<Offer, "window_starts_at" | "window_ends_at">, now: number): boolean {
  const starts = offer.window_starts_at ? new Date(offer.window_starts_at).getTime() : -Infinity;
  const ends = offer.window_ends_at ? new Date(offer.window_ends_at).getTime() : Infinity;
  return starts <= now && now < ends;
}

export function isFull(offer: Pick<Offer, "seat_cap" | "seats_used">): boolean {
  return offer.seat_cap !== null && Number(offer.seats_used) >= offer.seat_cap;
}

export function freeSeatsLeft(offer: Pick<Offer, "free_seats" | "free_seats_used">): number {
  return Math.max(0, offer.free_seats - Number(offer.free_seats_used));
}

// The offer a new merchant would get right now: the active offer whose window holds now and that
// still has seats. When an offer fills before its window ends and earlyAccessWhenFull is on, the
// next active offer by start date applies straight away.
export function currentOffer(offers: Offer[], now: number, earlyAccessWhenFull: boolean): Offer | null {
  const active = offers
    .filter((o) => o.active)
    .sort((a, b) => (a.window_starts_at ?? "").localeCompare(b.window_starts_at ?? ""));
  const open = active.find((o) => inWindow(o, now) && !isFull(o));
  if (open) return open;
  if (!earlyAccessWhenFull) return null;
  const filled = active.find((o) => inWindow(o, now) && isFull(o));
  if (!filled) return null;
  return active.find((o) => o.window_starts_at && new Date(o.window_starts_at).getTime() > now && !isFull(o)) ?? null;
}

// "$99 for your first year", "$149 a year or $19 a month for your first year", "$249 a year or $29 a month".
export function priceLine(offer: Pick<Offer, "annual_price_cents" | "monthly_price_cents" | "term_months">): string {
  const firstYear = offer.term_months === 12;
  if (offer.monthly_price_cents === null) {
    return `${formatPrice(offer.annual_price_cents)} ${firstYear ? "for your first year" : "a year"}`;
  }
  const both = `${formatPrice(offer.annual_price_cents)} a year or ${formatPrice(offer.monthly_price_cents)} a month`;
  return firstYear ? `${both} for your first year` : both;
}

export function termLabel(termMonths: number | null): string {
  if (termMonths === null) return "Ongoing";
  return termMonths === 12 ? "12 months" : `${termMonths} months`;
}

export function windowLabel(offer: Pick<Offer, "window_starts_at" | "window_ends_at">): string {
  const day = (iso: string) => formatDay(iso, OFFER_TIME_ZONE);
  // The stored end is exclusive, so the last day is the day before.
  const lastDay = (iso: string) => formatDay(new Date(new Date(iso).getTime() - 1), OFFER_TIME_ZONE);
  if (offer.window_starts_at && offer.window_ends_at) return `${day(offer.window_starts_at)} to ${lastDay(offer.window_ends_at)}`;
  if (offer.window_starts_at) return `From ${day(offer.window_starts_at)}`;
  if (offer.window_ends_at) return `Until ${lastDay(offer.window_ends_at)}`;
  return "Always";
}

export type ClaimResult =
  | "claimed"
  | "not_open"
  | "not_allowed"
  | "profile_incomplete"
  | "has_plan"
  | "coupon_required"
  | "coupon_invalid"
  | "no_offer"
  | "already_claimed"
  | "seats_gone";

const CLAIM_RESULTS: ClaimResult[] = [
  "claimed",
  "not_open",
  "not_allowed",
  "profile_incomplete",
  "has_plan",
  "coupon_required",
  "coupon_invalid",
  "no_offer",
  "already_claimed",
  "seats_gone",
];

export function parseClaim(data: unknown): ClaimResult {
  const result = (data as { result?: unknown } | null)?.result;
  return CLAIM_RESULTS.includes(result as ClaimResult) ? (result as ClaimResult) : "not_allowed";
}
