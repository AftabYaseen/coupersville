"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireManagedBusiness } from "@/lib/merchant";
import { businessRow } from "@/lib/merchant-rows";
import { isBusinessImagePath, LOGO_BUCKET } from "@/lib/storage";
import { businessSchema } from "@/lib/validation/merchant";
import type { ActionResult } from "@/lib/validation/auth";

export async function updateBusiness(input: unknown): Promise<ActionResult> {
  const parsed = businessSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Some details are missing or invalid. Check the form and try again." };
  }

  const { business, supabase } = await requireManagedBusiness("/merchant/business");
  const { error } = await supabase.from("businesses").update(businessRow(parsed.data)).eq("id", business.id);
  if (error) return { ok: false, error: "We could not save your changes. Try again in a moment." };

  refresh();
  return { ok: true, message: "Business details saved." };
}

const imageSchema = z.object({
  kind: z.enum(["logo", "cover"]),
  path: z.string().nullable(),
});

export async function updateBusinessImage(input: unknown): Promise<ActionResult> {
  const parsed = imageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That image could not be saved." };

  const { business, supabase } = await requireManagedBusiness("/merchant/business");
  const { kind, path } = parsed.data;
  if (path !== null && !isBusinessImagePath(path, business.id)) {
    return { ok: false, error: "That image could not be saved. Upload it again." };
  }

  const column = kind === "logo" ? "logo_path" : "cover_path";
  const previous = business[column];
  const { error } = await supabase
    .from("businesses")
    .update(kind === "logo" ? { logo_path: path } : { cover_path: path })
    .eq("id", business.id);
  if (error) return { ok: false, error: "We could not save that image. Try again in a moment." };

  if (previous && previous !== path) {
    await supabase.storage.from(LOGO_BUCKET).remove([previous]);
  }

  refresh();
  return { ok: true, message: kind === "logo" ? "Logo saved." : "Cover image saved." };
}
