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

export const SETTING_OPTIONS = {
  redemption_method: [
    { value: "qr_with_code", label: "QR code with a 6-digit code fallback" },
    { value: "qr_only", label: "QR code only" },
    { value: "code_only", label: "6-digit code only" },
  ],
  coupon_moderation: [
    { value: "instant", label: "Merchant coupons go live instantly; admins can unpublish" },
    { value: "review", label: "An admin reviews coupons before they go live" },
  ],
  subscription_expiry: [{ value: "hide_coupons", label: "Coupons are hidden until the merchant renews" }],
  consumer_login: [
    { value: "browse_open", label: "Anyone can browse; saving and redeeming need an account" },
    { value: "login_required", label: "Shoppers must sign in to browse" },
  ],
  plans: [{ value: "single_annual", label: "One annual plan" }],
} as const;

const values = <K extends keyof typeof SETTING_OPTIONS>(key: K) =>
  SETTING_OPTIONS[key].map((o) => o.value) as unknown as [string, ...string[]];

export const settingsSchema = z.object({
  redemption_method: z.enum(values("redemption_method")),
  coupon_moderation: z.enum(values("coupon_moderation")),
  subscription_expiry: z.enum(values("subscription_expiry")),
  consumer_login: z.enum(values("consumer_login")),
  plans: z.enum(values("plans")),
  region_restriction: z.preprocess(
    nullToEmpty,
    z
      .string()
      .trim()
      .max(200, { error: "Use 200 characters or fewer." })
      .transform((v) => (v === "" ? null : v)),
  ),
});
export type SettingsInput = z.input<typeof settingsSchema>;
