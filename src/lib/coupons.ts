import type { Enums } from "@/lib/supabase/database.types";

export const COUPON_VIEWS = ["live", "scheduled", "draft", "paused", "expired"] as const;
export type CouponView = (typeof COUPON_VIEWS)[number];

export const COUPON_VIEW_LABELS: Record<CouponView, string> = {
  live: "Live",
  scheduled: "Scheduled",
  draft: "Drafts",
  paused: "Paused",
  expired: "Expired",
};

export const COUPON_VIEW_STATUS: Record<CouponView, string> = {
  live: "Live",
  scheduled: "Scheduled",
  draft: "Draft",
  paused: "Paused",
  expired: "Ended",
};

function money(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

// One plain sentence of conditions for the ticket stub and the staff confirm screen.
export function describeLimits(c: {
  min_spend?: number | null;
  min_qty?: number | null;
  max_people?: number | null;
  per_user_limit?: number | null;
  limits_text?: string | null;
}): string {
  const parts: string[] = [];
  if (c.min_spend) parts.push(`Minimum spend ${money(Number(c.min_spend))}`);
  if (c.min_qty && c.min_qty > 1) parts.push(`Buy ${c.min_qty} or more`);
  if (c.max_people) parts.push(c.max_people === 1 ? "For 1 person" : `Up to ${c.max_people} people`);
  if (c.per_user_limit === 1) parts.push("One per customer");
  else if (c.per_user_limit && c.per_user_limit > 1) parts.push(`Up to ${c.per_user_limit} uses per customer`);
  if (c.limits_text) parts.push(c.limits_text.replace(/\.$/, ""));
  return parts.length ? `${parts.join(". ")}.` : "";
}

// Where a coupon sits for its merchant. "Expired" is derived from the dates, never stored.
export function couponView(
  coupon: { status: Enums<"coupon_status">; starts_at: string; expires_at: string },
  now: number,
): CouponView {
  if (coupon.status === "draft") return "draft";
  if (new Date(coupon.expires_at).getTime() <= now) return "expired";
  if (coupon.status === "paused") return "paused";
  if (new Date(coupon.starts_at).getTime() > now) return "scheduled";
  return "live";
}
