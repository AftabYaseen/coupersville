import { z } from "zod";

const email = z.email({ error: "Enter a valid email address." });
const newPassword = z
  .string()
  .min(8, { error: "Use at least 8 characters." })
  .max(72, { error: "Use 72 characters or fewer." });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: "Enter your password." }),
  next: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  fullName: z.string().trim().min(1, { error: "Enter your name." }).max(100),
  email,
  password: newPassword,
  accountType: z.enum(["consumer", "merchant"], { error: "Choose an account type." }),
  next: z.string().optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

// The merchant sign-up from the copy deck (page 16). The business details are kept with the new
// account and fill in the setup form after the email is confirmed; nothing is created before then.
// The phone becomes the business contact phone. There is no "number of locations": the membership
// level decides how many stores a business can have.
const text = (max: number, message: string) => z.string().trim().min(1, { error: message }).max(max, { error: `Use ${max} characters or fewer.` });
const optional = (max: number) =>
  z.preprocess(
    (v) => (v === null || v === undefined ? "" : v),
    z.string().trim().max(max, { error: `Use ${max} characters or fewer.` }),
  );

export const merchantSignupSchema = z
  .object({
    firstName: text(60, "Enter your first name."),
    lastName: text(60, "Enter your last name."),
    email,
    phone: text(30, "Enter a phone number.").refine((v) => (v.match(/\d/g) ?? []).length >= 7 && /^[\d\s()+.-]+$/.test(v), {
      error: "Enter a phone number, for example 555 123 4567.",
    }),
    password: newPassword,
    confirm: z.string(),
    businessName: text(120, "Enter your business name."),
    primaryCategoryId: z.uuid({ error: "Choose a category." }),
    websiteUrl: optional(300).refine((v) => v === "" || /^https?:\/\/[^\s/.]+\.[^\s]+$/i.test(v), {
      error: "Enter the full address, starting with https://",
    }),
    addressLine1: text(200, "Enter the street address."),
    city: text(100, "Enter the city."),
    state: optional(100),
    postalCode: optional(20),
    country: text(60, "Enter the country."),
  })
  .refine((v) => v.password === v.confirm, { error: "Passwords do not match.", path: ["confirm"] });
export type MerchantSignupInput = z.input<typeof merchantSignupSchema>;

// What the sign-up keeps in the account's metadata for the setup form. Read back with safeParse:
// the account holder can change their own metadata, so it is only ever a starting point.
export const businessSignupSchema = z.object({
  name: z.string().max(120),
  primary_category_id: z.string().max(40),
  website_url: z.string().max(300),
  contact_phone: z.string().max(30),
  address_line1: z.string().max(200),
  city: z.string().max(100),
  state: z.string().max(100),
  postal_code: z.string().max(20),
  country: z.string().max(60),
});
export type BusinessSignup = z.infer<typeof businessSignupSchema>;

export const resetRequestSchema = z.object({ email });
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;

export const newPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { error: "Passwords do not match.", path: ["confirm"] });
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
