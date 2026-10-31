"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteAccount } from "@/lib/account-deletion";
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

const DELETE_FAILED: Record<"admin" | "billing" | "failed", string> = {
  admin: "Admin accounts cannot be deleted here. Ask another admin to change your role first.",
  billing: "We could not cancel your plan with our payment processor, so nothing was deleted. Try again in a few minutes.",
  failed: "We could not delete your account. Nothing you can see has changed. Try again in a moment.",
};

// Deletes the signed-in account after the person types "delete" to confirm.
export async function deleteMyAccount(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ confirm: z.string().trim().toLowerCase().pipe(z.literal("delete")) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Type delete in the box to confirm." };

  const user = await getSessionUser();
  if (!user || user.status !== "active") return { ok: false, error: "Sign in again to delete your account." };

  const result = await deleteAccount(user.id);
  if (!result.ok) return { ok: false, error: DELETE_FAILED[result.reason] };

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/account-deleted");
}
