import { z } from "zod";
import { DAY_PATTERN } from "@/lib/dates";

export const STOCK_TINTS = ["mint", "pink", "sky", "butter"] as const;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const nullToEmpty = (value: unknown) => (value === null || value === undefined ? "" : value);

export const categorySchema = z
  .object({
    name: z.string().trim().min(1, { error: "Enter a name." }).max(60, { error: "Use 60 characters or fewer." }),
    slug: z.preprocess(
      nullToEmpty,
      z
        .string()
        .trim()
        .toLowerCase()
        .max(60, { error: "Use 60 characters or fewer." })
        .refine((v) => v === "" || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v), {
          error: "Use lowercase letters, numbers and single hyphens.",
        }),
    ),
    description: z.preprocess(
      nullToEmpty,
      z.string().trim().max(200, { error: "Use 200 characters or fewer." }).transform((v) => v || null),
    ),
    tint: z.enum(STOCK_TINTS, { error: "Choose a tint." }),
  })
  .transform((v) => ({ ...v, slug: v.slug || slugify(v.name) }))
  .refine((v) => v.slug.length > 0, { error: "Enter a web address name.", path: ["slug"] });
export type CategoryInput = z.input<typeof categorySchema>;
export type CategoryOutput = z.output<typeof categorySchema>;

// A calendar day for when a complimentary plan ends. Blank means it does not end.
export const planEndSchema = z.preprocess(
  nullToEmpty,
  z
    .string()
    .trim()
    .refine((v) => v === "" || DAY_PATTERN.test(v), { error: "Choose a valid date." })
    .transform((v) => (v === "" ? null : v)),
);

// Only the settings the app acts on today. The other platform_settings columns (redemption method,
// moderation, shopper sign-in, region, and the retired plans column) stay in the database and come
// back here when they are built. Plans themselves are rows on the Offers page.
export const SETTING_OPTIONS = {
  subscription_expiry: [{ value: "hide_coupons", label: "Coupons are hidden until the merchant renews" }],
  founders_rule: [
    { value: "profile_and_first_coupon", label: "Profile complete and first coupon published" },
    { value: "profile_complete", label: "Profile complete" },
  ],
  founders_full: [
    { value: "early_access", label: "Early Access applies straight away" },
    { value: "wait", label: "No offer until the Early Access window opens" },
  ],
  payments_open: [
    { value: "closed", label: "Closed: merchants see no payment buttons; admins can test checkout" },
    { value: "open", label: "Open: merchants can buy plans" },
  ],
  renewals_enabled: [
    { value: "off", label: "Off: no renewals, retries or renewal reminders" },
    { value: "on", label: "On: saved cards are charged when plans renew" },
  ],
} as const;

const values = <K extends keyof typeof SETTING_OPTIONS>(key: K) =>
  SETTING_OPTIONS[key].map((o) => o.value) as unknown as [string, ...string[]];

export const settingsSchema = z.object({
  subscription_expiry: z.enum(values("subscription_expiry")),
  founders_rule: z.enum(values("founders_rule")),
  founders_full: z.enum(values("founders_full")),
  payments_open: z.enum(values("payments_open")),
  renewals_enabled: z.enum(values("renewals_enabled")),
  // The day publishing opens, from midnight Pacific time.
  publishing_opens_on: z.string().trim().regex(DAY_PATTERN, { error: "Choose a valid date." }),
  enterprise_contact_email: z.email({ error: "Enter a valid email address." }).max(254),
});
export type SettingsInput = z.input<typeof settingsSchema>;

// Offer edits. Prices are entered in dollars and stored in cents; blank limits mean unlimited.
const optionalWhole = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number({ error: "Enter a whole number." }).int({ error: "Enter a whole number." }).min(1, { error: "Use 1 or more." }).max(max).nullable(),
  );
const dollars = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z
    .number({ error: "Enter a price." })
    .min(0, { error: "Use 0 or more." })
    .max(100000)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, { error: "Use dollars and cents." })
    .nullable(),
);
const optionalDay = z.preprocess(
  nullToEmpty,
  z
    .string()
    .trim()
    .refine((v) => v === "" || DAY_PATTERN.test(v), { error: "Choose a valid date." })
    .transform((v) => (v === "" ? null : v)),
);

export const offerSchema = z
  .object({
    name: z.string().trim().min(1, { error: "Enter a name." }).max(80, { error: "Use 80 characters or fewer." }),
    startsOn: optionalDay,
    // The last day of the window, included.
    endsOn: optionalDay,
    seatCap: optionalWhole(100000),
    freeSeats: z.preprocess((v) => (v === "" || v === null || v === undefined ? 0 : Number(v)), z.number().int({ error: "Enter a whole number." }).min(0).max(100000)),
    term: z.enum(["12", "ongoing"]),
    annualPrice: dollars.refine((v) => v !== null, { error: "Enter the annual price." }),
    monthlyPrice: dollars,
    renewsInto: z.preprocess(nullToEmpty, z.string().trim().max(60)),
    active: z.boolean(),
    maxLocations: optionalWhole(10000),
    maxLiveCoupons: optionalWhole(10000),
    campaignsPerMonth: optionalWhole(10000),
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, { error: "The last day must be on or after the first day.", path: ["endsOn"] })
  .refine((v) => v.seatCap === null || v.freeSeats <= v.seatCap, { error: "Free seats cannot be more than the seat cap.", path: ["freeSeats"] });
export type OfferInput = z.input<typeof offerSchema>;

// Limits for one business. Blank means "use the plan's limit".
export const businessLimitsSchema = z.object({
  maxLocations: optionalWhole(10000),
  campaignsPerMonth: optionalWhole(10000),
});

// Enterprise is always granted with its own numbers.
export const enterpriseGrantSchema = z.object({
  maxLocations: optionalWhole(10000).refine((v) => v !== null, { error: "Enter the number of locations." }),
  campaignsPerMonth: optionalWhole(10000).refine((v) => v !== null, { error: "Enter the campaigns per month." }),
  endsOn: planEndSchema,
});
