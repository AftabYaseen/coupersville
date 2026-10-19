import { z } from "zod";
import { DAY_PATTERN, isValidTimeZone } from "@/lib/dates";

function blankToUndefined(value: unknown) {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isNaN(value)) return undefined;
  if (typeof value === "string") return Number(value.trim());
  return value;
}

// The browser submits already-parsed values (blank text is null by then) and the server parses
// them again, so every optional field must accept its own output.
const nullToEmpty = (value: unknown) => (value === null || value === undefined ? "" : value);

const optionalText = (max: number) =>
  z.preprocess(
    nullToEmpty,
    z
      .string()
      .trim()
      .max(max, { error: `Use ${max} characters or fewer.` })
      .transform((v) => (v === "" ? null : v)),
  );

const requiredText = (max: number, message: string) =>
  z.string().trim().min(1, { error: message }).max(max, { error: `Use ${max} characters or fewer.` });

const optionalNumber = (schema: z.ZodNumber) => z.preprocess(blankToUndefined, schema.optional());

const optionalEmail = z.preprocess(
  nullToEmpty,
  z
    .string()
    .trim()
    .refine((v) => v === "" || z.email().safeParse(v).success, { error: "Enter a valid email address." })
    .transform((v) => (v === "" ? null : v)),
);

const optionalWebsite = z.preprocess(
  nullToEmpty,
  z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\/[^\s/.]+\.[^\s]+$/i.test(v), {
      error: "Enter the full address, starting with https://",
    })
    .transform((v) => (v === "" ? null : v)),
);

export const businessSchema = z.object({
  name: requiredText(120, "Enter your business name."),
  description: optionalText(1000),
  primaryCategoryId: z.uuid({ error: "Choose a category." }),
  contactEmail: optionalEmail,
  contactPhone: optionalText(30),
  websiteUrl: optionalWebsite,
  timezone: z.string().refine(isValidTimeZone, { error: "Choose your timezone." }),
});
export type BusinessInput = z.input<typeof businessSchema>;

export const locationSchema = z
  .object({
    storeName: requiredText(120, "Enter a store name."),
    storeNumber: optionalText(30),
    addressLine1: requiredText(200, "Enter the street address."),
    addressLine2: optionalText(200),
    city: requiredText(100, "Enter the city."),
    state: optionalText(100),
    postalCode: optionalText(20),
    phone: optionalText(30),
    lat: optionalNumber(z.number().min(-90).max(90)),
    lng: optionalNumber(z.number().min(-180).max(180)),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), {
    error: "The map pin is incomplete. Set it again or remove it.",
    path: ["lat"],
  });
export type LocationInput = z.input<typeof locationSchema>;

export const onboardingSchema = z.object({ business: businessSchema, location: locationSchema });
export type OnboardingInput = z.input<typeof onboardingSchema>;

export const DISCOUNT_TYPES = ["percent", "amount", "fixed_price", "free"] as const;
export const PER_USER_MODES = ["once", "limited", "unlimited"] as const;
export const FREQUENCIES = ["none", "day", "week"] as const;
const TIME_OR_BLANK = /^$|^([01]\d|2[0-3]):[0-5]\d(:00)?$/;

export const couponSchema = z
  .object({
    title: requiredText(120, "Give the coupon a short title."),
    description: optionalText(1000),
    categoryId: z.uuid({ error: "Choose a category." }),
    discountType: z.enum(DISCOUNT_TYPES, { error: "Choose the kind of offer." }),
    // Empty for a free offer; the price for a fixed price; otherwise the discount.
    discountValue: optionalNumber(
      z.number({ error: "Enter a number." }).positive({ error: "Use a number above 0." }).max(100000),
    ),
    includedProducts: optionalText(500),
    limitsText: optionalText(500),
    minSpend: optionalNumber(z.number().min(0, { error: "Use 0 or more." }).max(1000000)),
    minQty: optionalNumber(z.number().int({ error: "Use a whole number." }).min(1, { error: "Use 1 or more." })),
    maxPeople: optionalNumber(z.number().int({ error: "Use a whole number." }).min(1, { error: "Use 1 or more." })),
    startsOn: z.string().regex(DAY_PATTERN, { error: "Choose a start date." }),
    expiresOn: z.string().regex(DAY_PATTERN, { error: "Choose an end date." }),
    imagePath: z.string().nullable(),
    allLocations: z.boolean(),
    locationIds: z.array(z.uuid()),
    // Per customer: once, up to a number, or unlimited during the promotion.
    perUserMode: z.enum(PER_USER_MODES, { error: "Choose how often one customer can use it." }),
    perUserLimit: optionalNumber(
      z.number().int({ error: "Use a whole number." }).min(2, { error: "Use 2 or more." }).max(1000, { error: "Use 1000 or fewer." }),
    ),
    redeemFrequency: z.enum(FREQUENCIES, { error: "Choose how often." }),
    // Schedule: some days of the week, an optional time window, or both.
    scheduleOn: z.boolean(),
    scheduleDays: z.array(z.number().int().min(1).max(7)),
    scheduleStart: z.preprocess(nullToEmpty, z.string().regex(TIME_OR_BLANK, { error: "Choose a time." })),
    scheduleEnd: z.preprocess(nullToEmpty, z.string().regex(TIME_OR_BLANK, { error: "Choose a time." })),
    totalLimit: optionalNumber(z.number().int({ error: "Use a whole number." }).min(1, { error: "Use 1 or more." })),
  })
  .superRefine((v, ctx) => {
    if (v.discountType !== "free" && v.discountValue === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: v.discountType === "fixed_price" ? "Enter the price." : "Enter the discount.",
      });
    }
    if (v.discountType === "percent" && v.discountValue !== undefined && v.discountValue > 100) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "A percent discount can be 100 at most." });
    }
    if (v.perUserMode === "limited" && v.perUserLimit === undefined) {
      ctx.addIssue({ code: "custom", path: ["perUserLimit"], message: "Enter how many times one customer can use it." });
    }
    if (v.scheduleOn) {
      if (v.scheduleDays.length === 0) {
        ctx.addIssue({ code: "custom", path: ["scheduleDays"], message: "Choose at least one day." });
      }
      if (Boolean(v.scheduleStart) !== Boolean(v.scheduleEnd)) {
        ctx.addIssue({ code: "custom", path: ["scheduleEnd"], message: "Set both a start and an end time, or neither." });
      } else if (v.scheduleStart && v.scheduleEnd && v.scheduleStart >= v.scheduleEnd) {
        ctx.addIssue({ code: "custom", path: ["scheduleEnd"], message: "The end time must be after the start time." });
      }
    }
    if (v.expiresOn < v.startsOn) {
      ctx.addIssue({ code: "custom", path: ["expiresOn"], message: "The end date must be on or after the start date." });
    }
    if (!v.allLocations && v.locationIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["locationIds"], message: "Choose at least one store, or use all stores." });
    }
  });
export type CouponInput = z.input<typeof couponSchema>;
export type CouponValues = z.output<typeof couponSchema>;

export const couponIntentSchema = z.enum(["draft", "publish", "save"]);
export type CouponIntent = z.infer<typeof couponIntentSchema>;

// Coupon form values as the columns they are stored in.
export function couponRuleColumns(v: CouponValues) {
  const days = [...new Set(v.scheduleDays)].sort((a, b) => a - b);
  const hasWindow = v.scheduleOn && Boolean(v.scheduleStart) && Boolean(v.scheduleEnd);
  return {
    discount_value: v.discountType === "free" ? null : (v.discountValue ?? null),
    per_user_limit: v.perUserMode === "once" ? 1 : v.perUserMode === "limited" ? (v.perUserLimit ?? null) : null,
    redeem_frequency: v.redeemFrequency === "none" ? null : v.redeemFrequency,
    // Every day of the week is the same as no day rule.
    schedule_days: v.scheduleOn && days.length > 0 && days.length < 7 ? days : null,
    schedule_start: hasWindow ? v.scheduleStart.slice(0, 5) : null,
    schedule_end: hasWindow ? v.scheduleEnd.slice(0, 5) : null,
  };
}

// A stored coupon as form values.
export function couponRuleDefaults(c: {
  per_user_limit: number | null;
  redeem_frequency: string | null;
  schedule_days: number[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
}) {
  return {
    perUserMode: (c.per_user_limit === 1 ? "once" : c.per_user_limit === null ? "unlimited" : "limited") as (typeof PER_USER_MODES)[number],
    perUserLimit: c.per_user_limit && c.per_user_limit > 1 ? c.per_user_limit : ("" as const),
    redeemFrequency: (c.redeem_frequency === "day" || c.redeem_frequency === "week" ? c.redeem_frequency : "none") as (typeof FREQUENCIES)[number],
    scheduleOn: Boolean(c.schedule_days?.length || c.schedule_start),
    scheduleDays: c.schedule_days?.length ? c.schedule_days : [1, 2, 3, 4, 5, 6, 7],
    scheduleStart: c.schedule_start?.slice(0, 5) ?? "",
    scheduleEnd: c.schedule_end?.slice(0, 5) ?? "",
  };
}
