"use server";

import { redirect } from "next/navigation";
import { requireManagedBusiness } from "@/lib/merchant";
import { notifyPlanStarted } from "@/lib/email/notices";
import { parseClaim } from "@/lib/offers";

// Claims a free Founding seat without a coupon. Only offered when the qualifying rule is
// "profile complete"; under the default rule the seat is claimed by publishing the first coupon.
// claim_founding_seat decides, race-safe, and the billing page explains the result.
export async function claimFreeSeat(): Promise<void> {
  const { business, supabase } = await requireManagedBusiness("/merchant/billing");
  const { data, error } = await supabase.rpc("claim_founding_seat", { p_business_id: business.id });
  const result = error ? "failed" : parseClaim(data);
  if (result === "claimed") await notifyPlanStarted(business.id, `founding:${business.id}`);
  redirect(`/merchant/billing?claim=${result}`);
}
