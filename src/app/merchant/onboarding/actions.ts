"use server";

import { redirect } from "next/navigation";
import { requireMerchantAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessRow, locationRow } from "@/lib/merchant-rows";
import { onboardingSchema } from "@/lib/validation/merchant";
import type { ActionResult } from "@/lib/validation/auth";

const FAILED: ActionResult = { ok: false, error: "We could not save your business. Try again in a moment." };

export async function completeOnboarding(input: unknown): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Some details are missing or invalid. Check the form and try again." };
  }

  const { user, memberships } = await requireMerchantAccess("/merchant/onboarding");
  if (user.role !== "merchant" && user.role !== "admin") {
    return { ok: false, error: "Only business accounts can set up a business." };
  }

  const supabase = await createClient();
  const owned = memberships.find((m) => m.role === "owner");
  if (owned && owned.businessStatus !== "draft") redirect("/merchant");

  const business = businessRow(parsed.data.business);
  let businessId: string;

  if (owned) {
    businessId = owned.businessId;
    const { error } = await supabase.from("businesses").update(business).eq("id", businessId);
    if (error) return FAILED;
  } else {
    // The id is generated here because the owner membership row only exists after the insert.
    businessId = crypto.randomUUID();
    const { error } = await supabase.from("businesses").insert({ id: businessId, owner_id: user.id, ...business });
    if (error) return FAILED;
  }

  const { count } = await supabase
    .from("locations")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);

  if (!count) {
    const { error } = await supabase
      .from("locations")
      .insert({ business_id: businessId, ...locationRow(parsed.data.location) });
    if (error) {
      return { ok: false, error: "Your business was saved, but the store address was not. Check it and try again." };
    }
  }

  // Business status is server-controlled; a completed profile with a store becomes active.
  const { error: activateError } = await createAdminClient()
    .from("businesses")
    .update({ status: "active" })
    .eq("id", businessId)
    .eq("status", "draft");
  if (activateError) return FAILED;

  redirect("/merchant");
}
