"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireManagedBusiness } from "@/lib/merchant";
import { locationRow } from "@/lib/merchant-rows";
import { locationSchema } from "@/lib/validation/merchant";
import type { ActionResult } from "@/lib/validation/auth";

const INVALID: ActionResult = { ok: false, error: "Some details are missing or invalid. Check the form and try again." };
const FAILED: ActionResult = { ok: false, error: "We could not save this store. Try again in a moment." };

export async function createLocation(input: unknown): Promise<ActionResult> {
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  const { business, supabase } = await requireManagedBusiness("/merchant/locations");
  const { error } = await supabase.from("locations").insert({ business_id: business.id, ...locationRow(parsed.data) });
  if (error) return FAILED;

  redirect("/merchant/locations");
}

export async function updateLocation(locationId: unknown, input: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(locationId);
  const parsed = locationSchema.safeParse(input);
  if (!id.success || !parsed.success) return INVALID;

  const { business, supabase } = await requireManagedBusiness("/merchant/locations");
  const { data, error } = await supabase
    .from("locations")
    .update(locationRow(parsed.data))
    .eq("id", id.data)
    .eq("business_id", business.id)
    .select("id");
  if (error || !data?.length) return FAILED;

  redirect("/merchant/locations");
}

export async function setLocationActive(locationId: unknown, active: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(locationId);
  const flag = z.boolean().safeParse(active);
  if (!id.success || !flag.success) return INVALID;

  const { business, supabase } = await requireManagedBusiness("/merchant/locations");
  const { data, error } = await supabase
    .from("locations")
    .update({ active: flag.data })
    .eq("id", id.data)
    .eq("business_id", business.id)
    .select("id");
  if (error || !data?.length) return FAILED;

  refresh();
  return { ok: true, message: flag.data ? "Store reopened." : "Store closed. Its coupons are no longer valid there." };
}
