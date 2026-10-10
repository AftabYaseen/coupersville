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

export const resetRequestSchema = z.object({ email });
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;

export const newPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { error: "Passwords do not match.", path: ["confirm"] });
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
