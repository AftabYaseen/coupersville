"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rulesOf } from "@/lib/coupons";
import { TOKEN_RESULTS, tokenError } from "@/lib/redemption";
import type { ActionResult } from "@/lib/validation/auth";

const tokenResponse = z.object({ result: z.enum(TOKEN_RESULTS), token_id: z.uuid().optional() });

// "Redeem now" and "Get a new code" both land here. The database decides whether a code is issued;
// this only puts its answer into words.
export async function startRedemption(couponId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(couponId);
  if (!id.success) return { ok: false, error: "That coupon could not be found." };

  const user = await getSessionUser();
  if (!user) return { ok: false, error: tokenError("not_authenticated", null, "UTC") };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_redemption_token", { p_coupon_id: id.data });
  const parsed = tokenResponse.safeParse(data);
  if (error || !parsed.success) return { ok: false, error: "We could not make a code right now. Try again in a moment." };

  const { result, token_id } = parsed.data;
  if (result === "ok" && token_id) redirect(`/redeem/${token_id}`);
  if (result === "ok") return { ok: false, error: tokenError("not_live", null, "UTC") };

  if (result === "outside_schedule" || result === "frequency_limit") {
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
