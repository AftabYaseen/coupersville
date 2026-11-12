"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rulesOf } from "@/lib/coupons";
import { PRIVATE_KEY_PATTERN } from "@/lib/just-for-you";
import { TOKEN_RESULTS, tokenError } from "@/lib/redemption";
import type { ActionResult } from "@/lib/validation/auth";

const tokenResponse = z.object({ result: z.enum(TOKEN_RESULTS), token_id: z.uuid().optional() });
const ruleColumns = z.object({
  per_user_limit: z.number().nullable(),
  redeem_frequency: z.string().nullable(),
  schedule_days: z.array(z.number()).nullable(),
  schedule_start: z.string().nullable(),
  schedule_end: z.string().nullable(),
  timezone: z.string(),
});

// "Redeem now" and "Get a new code" both land here. The database decides whether a code is issued;
// this only puts its answer into words. A Just for You offer also needs the key from its private link.
export async function startRedemption(couponId: unknown, privateKeyInput?: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(couponId);
  const key = privateKeyInput === undefined || privateKeyInput === null ? null : z.string().regex(PRIVATE_KEY_PATTERN).safeParse(privateKeyInput);
  if (!id.success || (key && !key.success)) return { ok: false, error: "That coupon could not be found." };
  const privateKey = key?.success ? key.data : null;

  const user = await getSessionUser();
  if (!user) return { ok: false, error: tokenError("not_authenticated", null, "UTC") };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_redemption_token", {
    p_coupon_id: id.data,
    ...(privateKey ? { p_private_key: privateKey } : {}),
  });
  const parsed = tokenResponse.safeParse(data);
  if (error || !parsed.success) return { ok: false, error: "We could not make a code right now. Try again in a moment." };

  const { result, token_id } = parsed.data;
  if (result === "ok" && token_id) redirect(`/redeem/${token_id}`);
  if (result === "ok") return { ok: false, error: tokenError("not_live", null, "UTC") };
  if (privateKey && (result === "total_limit_reached" || result === "user_limit_reached")) {
    return { ok: false, error: "This offer has been used." };
  }

  if (result === "outside_schedule" || result === "frequency_limit") {
    if (privateKey) {
      const { data: offer } = await supabase.rpc("private_offer", { p_key: privateKey });
      const rules = ruleColumns.safeParse(offer);
      return { ok: false, error: tokenError(result, rules.success ? rulesOf(rules.data) : null, rules.success ? rules.data.timezone : "UTC") };
    }
    const { data: coupon } = await supabase
      .from("live_coupons")
      .select("per_user_limit, redeem_frequency, schedule_days, schedule_start, schedule_end, businesses(timezone)")
      .eq("id", id.data)
      .maybeSingle();
    const tz = coupon?.businesses?.timezone ?? "UTC";
    return { ok: false, error: tokenError(result, coupon ? rulesOf(coupon) : null, tz) };
  }
  return { ok: false, error: tokenError(result, null, "UTC") };
}
