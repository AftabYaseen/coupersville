"use server";

import { redirect } from "next/navigation";
import { absoluteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { notifyWelcome } from "@/lib/email/notices";
import { homePathFor, safeNextPath } from "@/lib/roles";
import {
  loginSchema,
  merchantSignupSchema,
  newPasswordSchema,
  resetRequestSchema,
  signupSchema,
  type ActionResult,
} from "@/lib/validation/auth";

const INVALID_INPUT: ActionResult = { ok: false, error: "Some details are missing or invalid. Check the form and try again." };

function signUpErrorMessage(error: { status?: number; code?: string; message: string }): string {
  if (error.code === "weak_password") return "That password is too easy to guess. Try a longer one.";
  if (error.code === "user_already_exists" || error.code === "email_exists") {
    return "That email already has an account. Sign in instead, or reset your password.";
  }
  if (error.code === "email_address_invalid") return "We cannot send email to that address. Check it, or use a different one.";
  if (error.code === "signup_disabled" || error.code === "email_provider_disabled") {
    return "New accounts are switched off right now. Try again later.";
  }
  if (error.status === 429) return "Too many sign-up emails were sent just now. Wait a few minutes, then try again.";
  // Supabase cancels the sign-up when the confirmation email cannot be sent, so nothing was saved.
  if (/sending.*email/i.test(error.message)) {
    return "We could not send your confirmation email, so your account was not created. This is a problem on our side. Please try again later.";
  }
  return "Something went wrong on our side and your account was not created. Please try again later.";
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
    return { ok: false, error: "We could not sign you in with those details. Check your email address and password, then try again." };
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

  await notifyWelcome(data.user);
  redirect(safeNextPath(parsed.data.next) ?? homePathFor(profile.role));
}

export async function signUp(input: unknown): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const { fullName, email, password, accountType, next } = parsed.data;
  const home = safeNextPath(next) ?? homePathFor(accountType);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: absoluteUrl(`/auth/confirm?next=${encodeURIComponent(home)}`),
      data: { full_name: fullName, role: accountType },
    },
  });

  if (error) {
    // Supabase's own wording goes to the server log, never to the page: it can name our mail setup.
    console.error(`sign up failed: ${error.status ?? "no status"} ${error.code ?? "no code"} ${error.message}`);
    return { ok: false, error: signUpErrorMessage(error) };
  }

  if (data.session && data.user) {
    await notifyWelcome(data.user);
    redirect(home);
  }

  return { ok: true, message: `We sent a confirmation link to ${email}. Open it to finish signing up.` };
}

// The business sign-up. The details go into the account's metadata and fill in the setup form once
// the email is confirmed, so an unconfirmed address never creates a business.
export async function signUpMerchant(input: unknown): Promise<ActionResult> {
  const parsed = merchantSignupSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const v = parsed.data;

  const supabase = await createClient();
  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("id", v.primaryCategoryId)
    .eq("active", true)
    .maybeSingle();
  if (!category) return { ok: false, error: "That category is no longer available. Choose another." };

  const home = "/merchant/onboarding";
  const { data, error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      emailRedirectTo: absoluteUrl(`/auth/confirm?next=${encodeURIComponent(home)}`),
      data: {
        full_name: `${v.firstName} ${v.lastName}`,
        role: "merchant",
        business_signup: {
          name: v.businessName,
          primary_category_id: v.primaryCategoryId,
          website_url: v.websiteUrl,
          contact_phone: v.phone,
          address_line1: v.addressLine1,
          city: v.city,
          state: v.state,
          postal_code: v.postalCode,
          country: v.country,
        },
      },
    },
  });

  if (error) {
    console.error(`merchant sign up failed: ${error.status ?? "no status"} ${error.code ?? "no code"} ${error.message}`);
    return { ok: false, error: signUpErrorMessage(error) };
  }

  if (data.session && data.user) {
    await notifyWelcome(data.user);
    redirect(home);
  }

  return {
    ok: true,
    message: `Your business account has been created. We sent a confirmation link to ${v.email}. Open it, then complete your business profile, add your locations and create your first offer.`,
  };
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = resetRequestSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: absoluteUrl("/auth/confirm?next=/reset-password"),
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
