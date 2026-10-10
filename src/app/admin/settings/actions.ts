"use server";

import { refresh } from "next/cache";
import { NOT_ADMIN, requireAdminAction } from "@/lib/admin";
import { settingsSchema } from "@/lib/validation/admin";
import type { ActionResult } from "@/lib/validation/auth";

export async function updateSettings(input: unknown): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some settings are missing or invalid. Check the form and try again." };

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;

  const { data, error } = await ctx.supabase.from("platform_settings").update(parsed.data).eq("singleton", true).select("id");
  if (error || !data?.length) return { ok: false, error: "We could not save the settings. Try again in a moment." };

  refresh();
  return { ok: true, message: "Settings saved." };
}
