"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction } from "@/lib/admin";
import { addDays, startOfDayInZone } from "@/lib/dates";
import { OFFER_TIME_ZONE } from "@/lib/offers";
import { offerSchema } from "@/lib/validation/admin";
import type { ActionResult } from "@/lib/validation/auth";

const cents = (dollars: number | null) => (dollars === null ? null : Math.round(dollars * 100));

// Edits one offer. Offers are never created or deleted here: they are seeded, and switched off with
// "Active". The database refuses a seat cap or free seats below the seats already claimed.
export async function updateOffer(codeInput: unknown, input: unknown): Promise<ActionResult> {
  const code = z.string().regex(/^[a-z][a-z0-9_]*$/).safeParse(codeInput);
  const parsed = offerSchema.safeParse(input);
  if (!code.success) return { ok: false, error: "That offer could not be found." };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const ctx = await requireAdminAction();
  if (!ctx) return NOT_ADMIN;

  const v = parsed.data;
  const renewsInto = v.renewsInto || null;
  if (renewsInto === code.data) return { ok: false, error: "An offer cannot renew into itself." };

  const { data, error } = await ctx.supabase
    .from("offers")
    .update({
      name: v.name,
      window_starts_at: v.startsOn ? startOfDayInZone(v.startsOn, OFFER_TIME_ZONE).toISOString() : null,
      // The form takes the last day; the stored end is the next midnight, exclusive.
      window_ends_at: v.endsOn ? startOfDayInZone(addDays(v.endsOn, 1), OFFER_TIME_ZONE).toISOString() : null,
      seat_cap: v.seatCap,
      free_seats: v.freeSeats,
      term_months: v.term === "12" ? 12 : null,
      annual_price_cents: cents(v.annualPrice)!,
      monthly_price_cents: cents(v.monthlyPrice),
      renews_into: renewsInto,
      active: v.active,
      max_locations: v.maxLocations,
      max_live_coupons: v.maxLiveCoupons,
      campaigns_per_month: v.campaignsPerMonth,
    })
    .eq("code", code.data)
    .select("code");
  if (error?.hint === "seats_below_used") return { ok: false, error: error.message };
  if (error?.code === "23503") return { ok: false, error: "Choose an existing offer to renew into." };
  if (error || !data?.length) return { ok: false, error: "We could not save this offer. Try again in a moment." };

  refresh();
  return { ok: true, message: `${v.name} saved.` };
}
