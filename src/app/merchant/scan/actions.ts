"use server";

import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { redemptionInputSchema, verifyResponseSchema, type VerifyResponse } from "@/lib/redemption";

// Both actions only pass input through to Postgres. Whether a redemption is valid is decided there.

const FAILED: VerifyResponse = { result: "not_found" };

async function call(fn: "preview_redemption" | "verify_redemption", input: unknown, locationId: unknown) {
  const parsed = redemptionInputSchema.safeParse({ input, locationId });
  if (!parsed.success) return { ok: true as const, response: FAILED };

  const user = await getSessionUser();
  if (!user || user.status !== "active") return { ok: true as const, response: { result: "not_authenticated" } as VerifyResponse };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, {
    p_token_or_code: parsed.data.input,
    p_location_id: parsed.data.locationId,
  });
  const response = verifyResponseSchema.safeParse(data);
  if (error || !response.success) {
    return { ok: false as const, error: "We could not reach Coupersville. Check the connection and try again." };
  }
  return { ok: true as const, response: response.data };
}

export async function previewRedemption(input: unknown, locationId: unknown) {
  return call("preview_redemption", input, locationId);
}

export async function confirmRedemption(input: unknown, locationId: unknown) {
  return call("verify_redemption", input, locationId);
}
