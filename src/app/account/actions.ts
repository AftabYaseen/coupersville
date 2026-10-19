"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";

const nameSchema = z.object({
  fullName: z
    .string()
    .trim()
    .max(100, { error: "Use 100 characters or fewer." })
    .transform((v) => (v === "" ? null : v)),
});

// The name is optional. Blank clears it.
export async function updateName(input: unknown): Promise<ActionResult> {
  const parsed = nameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Use 100 characters or fewer." };

  const user = await getSessionUser();
  if (!user || user.status !== "active") return { ok: false, error: "Sign in again to change your name." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", user.id);
  if (error) return { ok: false, error: "We could not save your name. Try again in a moment." };

  refresh();
  return { ok: true, message: parsed.data.fullName ? "Name saved." : "Name removed." };
}
