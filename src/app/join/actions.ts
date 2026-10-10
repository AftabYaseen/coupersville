"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";

const ERRORS: Record<string, string> = {
  not_authenticated: "Sign in first, then open the invite link again.",
  account_suspended: "This account is suspended. Contact Coupersville support for help.",
  not_found: "This invite link is not valid. Ask the owner to send a new one.",
  expired: "This invite has expired. Ask the owner to send a new one.",
  already_accepted: "Someone has already used this invite. Ask the owner to send you your own.",
  email_not_confirmed: "Confirm your email address first, using the link we sent you, then try again.",
  email_mismatch: "This invite is for a different email address. Sign out, then sign in with the email it was sent to.",
};

export async function acceptInvite(token: unknown): Promise<ActionResult> {
  const parsed = z.string().regex(/^[0-9a-f]{48}$/i).safeParse(token);
  if (!parsed.success) return { ok: false, error: ERRORS.not_found };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_staff_invite", { p_token: parsed.data });
  const result = z.object({ result: z.string() }).safeParse(data);
  if (error || !result.success) return { ok: false, error: "We could not accept the invite. Try again in a moment." };
  if (result.data.result !== "ok") {
    return { ok: false, error: ERRORS[result.data.result] ?? ERRORS.not_found };
  }
  redirect("/merchant/scan");
}
