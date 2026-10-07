"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homePathFor, safeNextPath } from "@/lib/roles";
import {
  loginSchema,
  newPasswordSchema,
  resetRequestSchema,
  signupSchema,
  type ActionResult,
} from "@/lib/validation/auth";

const INVALID_INPUT: ActionResult = { ok: false, error: "Some details are missing or invalid. Check the form and try again." };

async function siteOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function signIn(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { ok: false, error: "Confirm your email first. Open the link we sent you, then sign in." };
    }
    return { ok: false, error: "That email and password do not match. Check them and try again." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    return { ok: false, error: "This account is suspended. Contact Coupersville support for help." };
  }

  redirect(safeNextPath(parsed.data.next) ?? homePathFor(profile.role));
}

export async function signUp(input: unknown): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const { fullName, email, password, accountType } = parsed.data;
  const home = homePathFor(accountType);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(home)}`,
      data: { full_name: fullName, role: accountType },
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return { ok: false, error: "That password is too easy to guess. Try a longer one." };
    }
    return { ok: false, error: "We could not create your account. Try again in a moment." };
  }

  if (data.session) redirect(home);

  return { ok: true, message: `We sent a confirmation link to ${email}. Open it to finish signing up.` };
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = resetRequestSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/reset-password`,
  });

  if (error?.status === 429) {
    return { ok: false, error: "Too many requests. Wait a minute, then try again." };
  }

  return {
    ok: true,
    message: `If ${parsed.data.email} has an account, a reset link is on its way. Check your inbox.`,
  };
}

export async function updatePassword(input: unknown): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    return { ok: false, error: "Your reset link has expired. Request a new one below." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { ok: false, error: "Choose a password you have not used before." };
    }
    return { ok: false, error: "We could not update your password. Try again in a moment." };
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  redirect(profile ? homePathFor(profile.role) : "/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
