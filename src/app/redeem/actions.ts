"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TOKEN_ERRORS, TOKEN_RESULTS } from "@/lib/redemption";
import type { ActionResult } from "@/lib/validation/auth";

const tokenResponse = z.object({ result: z.enum(TOKEN_RESULTS), token_id: z.uuid().optional() });

// "Redeem now" and "Get a new code" both land here. The database decides whether a code is issued.
export async function startRedemption(couponId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(couponId);
  if (!id.success) return { ok: false, error: "That coupon could not be found." };

  const user = await getSessionUser();
  if (!user) return { ok: false, error: TOKEN_ERRORS.not_authenticated };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_redemption_token", { p_coupon_id: id.data });
  const parsed = tokenResponse.safeParse(data);
  if (error || !parsed.success) return { ok: false, error: "We could not make a code right now. Try again in a moment." };

  const { result, token_id } = parsed.data;
  if (result !== "ok" || !token_id) return { ok: false, error: TOKEN_ERRORS[result === "ok" ? "not_live" : result] };

  redirect(`/redeem/${token_id}`);
}
