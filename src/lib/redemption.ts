import { z } from "zod";
import type { Enums } from "@/lib/supabase/database.types";

// Result codes come from the Postgres functions. The app only turns them into words.

export const TOKEN_RESULTS = ["ok", "not_authenticated", "account_suspended", "not_live", "user_limit_reached", "total_limit_reached"] as const;
export type TokenResult = (typeof TOKEN_RESULTS)[number];

export const TOKEN_ERRORS: Record<Exclude<TokenResult, "ok">, string> = {
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
  "user_limit_reached",
  "total_limit_reached",
] as const;
export type VerifyResult = (typeof VERIFY_RESULTS)[number];
export type VerifyFailure = Exclude<VerifyResult, "ok">;

// What staff read on the full-screen result after a failed check.
export const VERIFY_FAILURES: Record<VerifyFailure, { title: string; body: string }> = {
  expired: {
    title: "This code has expired",
    body: "Codes last 5 minutes. Ask the customer to tap Get a new code, then scan again.",
  },
  already_used: {
    title: "Already redeemed",
    body: "This code has been used. Each code works once.",
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
    body: "This coupon only works at some of your stores, and this is not one of them.",
  },
  coupon_not_live: {
    title: "Coupon no longer live",
    body: "This coupon is paused, has ended, or your plan is not active. It cannot be redeemed right now.",
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
  discount_type: z.enum(["percent", "amount"]),
  discount_value: money,
  included_products: z.string().nullable(),
  limits_text: z.string().nullable(),
  min_spend: money.nullable(),
  min_qty: z.number().nullable(),
  max_people: z.number().nullable(),
  per_user_limit: z.number(),
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
