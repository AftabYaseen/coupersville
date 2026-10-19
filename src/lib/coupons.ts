import type { Enums } from "@/lib/supabase/database.types";
import { asFrequency, describePerCustomer, describeSchedule, type CouponRules } from "@/lib/rules";

// "removed" is a coupon an admin has put on hold. Lists show it only when there is one.
export const COUPON_VIEWS = ["live", "scheduled", "draft", "paused", "expired", "removed"] as const;
export type CouponView = (typeof COUPON_VIEWS)[number];

export const REMOVED_LABEL = "Removed by Coupersville";

export const COUPON_VIEW_LABELS: Record<CouponView, string> = {
  live: "Live",
  scheduled: "Scheduled",
  draft: "Drafts",
  paused: "Paused",
  expired: "Expired",
  removed: REMOVED_LABEL,
};

export const COUPON_VIEW_STATUS: Record<CouponView, string> = {
  live: "Live",
  scheduled: "Scheduled",
  draft: "Draft",
  paused: "Paused",
  expired: "Ended",
  removed: REMOVED_LABEL,
};

function money(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

// One plain sentence of conditions and rules for the ticket stub, coupon page and confirm screen.
// per_user_limit null means unlimited; leave it out (undefined) to say nothing about it.
export function describeLimits(c: {
  min_spend?: number | null;
  min_qty?: number | null;
  max_people?: number | null;
  per_user_limit?: number | null;
  redeem_frequency?: string | null;
  schedule_days?: number[] | null;
  schedule_start?: string | null;
  schedule_end?: string | null;
  limits_text?: string | null;
}): string {
  const parts: string[] = [];
  const schedule = describeSchedule({
    schedule_days: c.schedule_days ?? null,
    schedule_start: c.schedule_start ?? null,
    schedule_end: c.schedule_end ?? null,
  });
  if (schedule) parts.push(`Available ${/^(Every|Weekdays|Weekends)/.test(schedule) ? schedule.toLowerCase() : schedule}`);
  if (c.min_spend) parts.push(`Minimum spend ${money(Number(c.min_spend))}`);
  if (c.min_qty && c.min_qty > 1) parts.push(`Buy ${c.min_qty} or more`);
  if (c.max_people) parts.push(c.max_people === 1 ? "For 1 person" : `Up to ${c.max_people} people`);
  if (c.per_user_limit !== undefined) {
    parts.push(describePerCustomer({ per_user_limit: c.per_user_limit, redeem_frequency: asFrequency(c.redeem_frequency) }));
  }
  if (c.limits_text) parts.push(c.limits_text.replace(/\.$/, ""));
  return parts.length ? `${parts.join(". ")}.` : "";
}

// The rule fields of a coupon row, typed.
export function rulesOf(c: {
  per_user_limit: number | null;
  redeem_frequency?: string | null;
  schedule_days?: number[] | null;
  schedule_start?: string | null;
  schedule_end?: string | null;
}): CouponRules {
  return {
    per_user_limit: c.per_user_limit,
    redeem_frequency: asFrequency(c.redeem_frequency),
    schedule_days: c.schedule_days ?? null,
    schedule_start: c.schedule_start ?? null,
    schedule_end: c.schedule_end ?? null,
  };
}

// Where a coupon sits for its merchant. "Expired" is derived from the dates, never stored.
// A hold outranks everything: the coupon is not live whatever its status says.
export function couponView(
  coupon: { status: Enums<"coupon_status">; starts_at: string; expires_at: string; admin_hold?: boolean },
  now: number,
): CouponView {
  if (coupon.admin_hold) return "removed";
  if (coupon.status === "draft") return "draft";
  if (new Date(coupon.expires_at).getTime() <= now) return "expired";
  if (coupon.status === "paused") return "paused";
  if (new Date(coupon.starts_at).getTime() > now) return "scheduled";
  return "live";
}
