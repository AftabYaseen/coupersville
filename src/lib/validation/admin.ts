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
    shopLabel: z.string().trim().min(1, { error: "Enter how it appears on Main Street." }).max(60, { error: "Use 60 characters or fewer." }),
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
// moderation, shopper sign-in, region) stay in the database and come back here when they are built.
export const SETTING_OPTIONS = {
  subscription_expiry: [{ value: "hide_coupons", label: "Coupons are hidden until the merchant renews" }],
  plans: [{ value: "single_annual", label: "One annual plan" }],
} as const;

const values = <K extends keyof typeof SETTING_OPTIONS>(key: K) =>
  SETTING_OPTIONS[key].map((o) => o.value) as unknown as [string, ...string[]];

export const settingsSchema = z.object({
  subscription_expiry: z.enum(values("subscription_expiry")),
  plans: z.enum(values("plans")),
});
export type SettingsInput = z.input<typeof settingsSchema>;
