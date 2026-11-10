import { z } from "zod";
import type { Enums } from "@/lib/supabase/database.types";
import {
  asFrequency,
  formatWhen,
  frequencyLimitText,
  frequencyResetsAt,
  outsideScheduleText,
  type CouponRules,
} from "@/lib/rules";

// Result codes come from the Postgres functions. The app only turns them into words.

export const TOKEN_RESULTS = [
  "ok",
  "not_authenticated",
  "account_suspended",
  "not_live",
  "outside_schedule",
  "user_limit_reached",
  "frequency_limit",
  "total_limit_reached",
] as const;
export type TokenResult = (typeof TOKEN_RESULTS)[number];

// outside_schedule and frequency_limit are put into words with the coupon rules (see tokenError).
export const TOKEN_ERRORS: Record<Exclude<TokenResult, "ok" | "outside_schedule" | "frequency_limit">, string> = {
  not_authenticated: "Sign in to redeem this coupon.",
  account_suspended: "This account is suspended. Contact Coupersville support for help.",
  not_live: "This coupon is no longer available, so it cannot be redeemed.",
  user_limit_reached: "You have already used this coupon as many times as it allows.",
  total_limit_reached: "This coupon has been fully claimed. Look for another one from this shop.",
};

export const VERIFY_RESULTS = [
  "ok",
  "not_authenticated",
  "location_not_found",
  "not_member",
  "not_found",
  "wrong_business",
  "already_used",
  "expired",
  "coupon_not_live",
  "location_not_eligible",
  "outside_schedule",
  "user_limit_reached",
  "frequency_limit",
  "total_limit_reached",
] as const;
export type VerifyResult = (typeof VERIFY_RESULTS)[number];
export type VerifyFailure = Exclude<VerifyResult, "ok">;

// What staff read on the full-screen result after a failed check. The schedule and frequency
// entries are fallbacks; verifyFailureText fills in the coupon rules when it has them.
export const VERIFY_FAILURES: Record<VerifyFailure, { title: string; body: string }> = {
  outside_schedule: {
    title: "Not available right now",
    body: "This coupon can only be redeemed on certain days or times.",
  },
  frequency_limit: {
    title: "Already used",
    body: "This customer has already used this coupon in the current day or week.",
  },
  expired: {
    title: "This code has expired",
    body: "Codes last 5 minutes. Ask the customer to tap Get a new code, then scan again.",
  },
  already_used: {
    title: "Already redeemed",
    body: "This coupon has already been redeemed and cannot be used again.",
  },
  user_limit_reached: {
    title: "Limit reached for this customer",
    body: "This customer has already used this coupon as many times as it allows.",
  },
  total_limit_reached: {
    title: "Coupon fully claimed",
    body: "Every redemption for this coupon has been used. It cannot be redeemed again.",
  },
  wrong_business: {
    title: "Wrong business",
    body: "This coupon is from a different business, so it cannot be redeemed here.",
  },
  location_not_eligible: {
    title: "Not valid at this store",
    body: "This offer is not valid at this location. The coupon page lists its participating locations.",
  },
  coupon_not_live: {
    title: "Coupon no longer live",
    body: "This coupon is paused, has ended, was removed by Coupersville, or your membership is not active. It cannot be redeemed right now.",
  },
  not_found: {
    title: "Code not found",
    body: "Check the 6 digits with the customer and try again, or scan the QR code.",
  },
  location_not_found: {
    title: "Store not available",
    body: "This store is closed or was removed. Pick your store again.",
  },
  not_member: {
    title: "Not on this team",
    body: "Your account is not on the team for this store. Ask the owner to invite you.",
  },
  not_authenticated: {
    title: "Signed out",
    body: "Your session ended. Sign in again to keep scanning.",
  },
};

const money = z.union([z.number(), z.string()]).transform(Number);

export const offerSchema = z.object({
  coupon_id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  discount_type: z.enum(["percent", "amount", "fixed_price", "free"]),
  discount_value: money.nullable(),
  included_products: z.string().nullable(),
  limits_text: z.string().nullable(),
  min_spend: money.nullable(),
  min_qty: z.number().nullable(),
  max_people: z.number().nullable(),
  per_user_limit: z.number().nullable(),
  redeem_frequency: z.string().nullable().optional(),
  schedule_days: z.array(z.number()).nullable().optional(),
  schedule_start: z.string().nullable().optional(),
  schedule_end: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  stock_tint: z.enum(["mint", "pink", "sky", "butter"]),
});
export type Offer = z.infer<typeof offerSchema>;

export const verifyResponseSchema = z.object({
  result: z.enum(VERIFY_RESULTS),
  method: z.enum(["qr", "code"]).optional(),
  store_name: z.string().optional(),
  offer: offerSchema.optional(),
  used_at: z.string().nullable().optional(),
  expires_at: z.string().optional(),
  redeemed_at: z.string().optional(),
});
export type VerifyResponse = z.infer<typeof verifyResponseSchema>;

// Staff type or scan this; the database decides whether it is valid.
export const redemptionInputSchema = z.object({
  input: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (/^[\d\s-]+$/.test(v) ? v.replace(/[\s-]/g, "") : v))
    .pipe(z.string().min(1)),
  locationId: z.uuid(),
});

export function formatShortCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export type RedemptionMethod = Enums<"redemption_method">;

function offerRules(offer: Offer): CouponRules {
  return {
    per_user_limit: offer.per_user_limit,
    redeem_frequency: asFrequency(offer.redeem_frequency),
    schedule_days: offer.schedule_days ?? null,
    schedule_start: offer.schedule_start ?? null,
    schedule_end: offer.schedule_end ?? null,
  };
}

// The words staff see for a failed check, with the coupon's own schedule or frequency when known.
export function verifyFailureText(result: VerifyFailure, offer: Offer | undefined, now = Date.now()) {
  if (offer && result === "outside_schedule") return outsideScheduleText(offerRules(offer), offer.timezone ?? "UTC", now);
  const frequency = offer ? asFrequency(offer.redeem_frequency) : null;
  if (offer && result === "frequency_limit" && frequency) {
    const text = frequencyLimitText(frequency, offer.timezone ?? "UTC", now);
    return { title: text.title, body: text.body.replace("It can be used again", "This customer can use it again") };
  }
  return VERIFY_FAILURES[result];
}

// The words a shopper sees when they cannot get a code.
export function tokenError(result: Exclude<TokenResult, "ok">, rules: CouponRules | null, tz: string, now = Date.now()): string {
  if (result === "outside_schedule") {
    const when = rules ? outsideScheduleText(rules, tz, now).body : "";
    return `This coupon is not available right now. ${when}`.trim();
  }
  if (result === "frequency_limit") {
    const frequency = rules?.redeem_frequency;
    if (!frequency) return "You have already used this coupon for now. Try again later.";
    const resets = frequencyResetsAt(frequency, tz, now);
    return `You have already used this coupon ${frequency === "day" ? "today" : "this week"}. You can use it again ${formatWhen(resets, tz, now)}.`;
  }
  return TOKEN_ERRORS[result];
}
