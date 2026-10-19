"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { registerCodeRequest, roleForEmail } from "@/lib/auth-codes";
import { absoluteUrl } from "@/lib/site";

// Sign-in with a 6-digit email code, for shoppers. Merchants and admins keep email and password.

export type CodeResult = { ok: true } | { ok: false; error: string; usePassword?: boolean };

const emailSchema = z.email().max(254).transform((v) => v.trim().toLowerCase());
// The code length is a Supabase Auth setting (Email OTP Length, 6 by our choice). Accept 6 to 10
// digits so sign-in keeps working if that setting changes; Supabase checks the code itself.
const codeSchema = z
  .string()
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{6,10}$/));

const USE_PASSWORD: CodeResult = {
  ok: false,
  usePassword: true,
  error: "This email is a business or admin account. Sign in with your password instead.",
};
const TOO_MANY_SENDS: CodeResult = {
  ok: false,
  error: "Too many codes asked for this email or connection. Wait 10 minutes, then try again.",
};
const TOO_MANY_TRIES: CodeResult = {
  ok: false,
  error: "Too many tries. Wait 10 minutes, then ask for a new code.",
};

export async function requestSignInCode(input: unknown): Promise<CodeResult> {
  const email = emailSchema.safeParse((input as { email?: unknown })?.email);
  if (!email.success) return { ok: false, error: "Enter a valid email address." };

  const role = await roleForEmail(email.data);
  if (role === "merchant" || role === "admin") return USE_PASSWORD;

  if ((await registerCodeRequest("send", email.data)) !== "ok") return TOO_MANY_SENDS;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      // New accounts made this way are shoppers. The name stays optional and can be added in Account.
      shouldCreateUser: true,
      data: { role: "consumer" },
      emailRedirectTo: absoluteUrl("/auth/confirm?next=/"),
    },
  });
  if (error) {
    if (error.status === 429) return { ok: false, error: "Too many emails sent just now. Wait a minute, then try again." };
    console.error(`sign-in code send failed: ${error.code ?? error.status ?? "unknown"}`);
    return { ok: false, error: "We could not send a code right now. Try again in a few minutes." };
  }
  return { ok: true };
}

export async function verifySignInCode(input: unknown): Promise<CodeResult> {
  const raw = input as { email?: unknown; code?: unknown } | null;
  const email = emailSchema.safeParse(raw?.email);
  const code = codeSchema.safeParse(raw?.code);
  if (!email.success) return { ok: false, error: "Enter a valid email address." };
  if (!code.success) return { ok: false, error: "Enter the code from the email. It is only numbers." };

  if ((await registerCodeRequest("verify", email.data)) !== "ok") return TOO_MANY_TRIES;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: email.data, token: code.data, type: "email" });
  if (error || !data.user) {
    return { ok: false, error: "That code is wrong or has expired. Check the email, or send a new code." };
  }

  // A code only ever signs in an active shopper.
  const { data: profile } = await supabase.from("profiles").select("role, status").eq("id", data.user.id).maybeSingle();
  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    return { ok: false, error: "This account is suspended. Contact Coupersville support for help." };
  }
  if (profile.role !== "consumer") {
    await supabase.auth.signOut();
    return USE_PASSWORD;
  }
  return { ok: true };
}
