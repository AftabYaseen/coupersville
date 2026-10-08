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

export const couponSchema = z
  .object({
    title: requiredText(120, "Give the coupon a short title."),
    description: optionalText(1000),
    categoryId: z.uuid({ error: "Choose a category." }),
    discountType: z.enum(["percent", "amount"], { error: "Choose percent or amount." }),
    discountValue: z.preprocess(
      blankToUndefined,
      z.number({ error: "Enter the discount." }).positive({ error: "The discount must be more than 0." }).max(100000),
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
    perUserLimit: z.preprocess(
      blankToUndefined,
      z
        .number({ error: "Enter how many times one person can use it." })
        .int({ error: "Use a whole number." })
        .min(1, { error: "Use 1 or more." })
        .max(1000),
    ),
    totalLimit: optionalNumber(z.number().int({ error: "Use a whole number." }).min(1, { error: "Use 1 or more." })),
  })
  .superRefine((v, ctx) => {
    if (v.discountType === "percent" && v.discountValue > 100) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "A percent discount can be 100 at most." });
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
