"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireManagedBusiness } from "@/lib/merchant";
import type { ActionResult } from "@/lib/validation/auth";

const NOT_OWNER: ActionResult = { ok: false, error: "Only the business owner can manage staff." };

async function requireOwner() {
  const ctx = await requireManagedBusiness("/merchant/staff");
  return ctx.role === "owner" ? ctx : null;
}

export async function inviteStaff(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ email: z.email().max(254) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };
  const email = parsed.data.email.trim().toLowerCase();

  const ctx = await requireOwner();
  if (!ctx) return NOT_OWNER;
  const { business, supabase, user } = ctx;

  const { data: team } = await supabase.rpc("business_team", { p_business_id: business.id });
  if ((team ?? []).some((m) => m.email?.toLowerCase() === email)) {
    return { ok: false, error: `${email} is already on your team.` };
  }

  const { error } = await supabase.from("staff_invites").insert({ business_id: business.id, email, invited_by: user.id });
  if (error) {
    if (error.code === "23505") return { ok: false, error: `${email} already has an invite waiting. Copy its link below.` };
    return { ok: false, error: "We could not create the invite. Try again in a moment." };
  }

  refresh();
  return { ok: true, message: `Invite ready for ${email}. Copy the link below and send it to them.` };
}

export async function cancelInvite(inviteId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(inviteId);
  if (!id.success) return { ok: false, error: "That invite could not be found." };

  const ctx = await requireOwner();
  if (!ctx) return NOT_OWNER;
  const { error } = await ctx.supabase
    .from("staff_invites")
    .delete()
    .eq("id", id.data)
    .eq("business_id", ctx.business.id)
    .is("accepted_at", null);
  if (error) return { ok: false, error: "We could not cancel that invite. Try again in a moment." };

  refresh();
  return { ok: true, message: "Invite canceled. The link no longer works." };
}

export async function removeStaff(memberId: unknown): Promise<ActionResult> {
  const id = z.uuid().safeParse(memberId);
  if (!id.success) return { ok: false, error: "That person could not be found." };

  const ctx = await requireOwner();
  if (!ctx) return NOT_OWNER;
  const { data, error } = await ctx.supabase
    .from("business_members")
    .delete()
    .eq("id", id.data)
    .eq("business_id", ctx.business.id)
    .eq("role", "staff")
    .select("id");
  if (error || !data?.length) return { ok: false, error: "We could not remove that person. Try again in a moment." };

  refresh();
  return { ok: true, message: "Removed. They can no longer use your scanner." };
}
