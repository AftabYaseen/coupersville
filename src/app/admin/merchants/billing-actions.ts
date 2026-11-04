"use server";

import { z } from "zod";
import { requireAdminAction } from "@/lib/admin";
import { startCheckout } from "@/lib/paid-billing";
import { anetConfigured } from "@/lib/authorize-net";
import type { Offer } from "@/lib/offers";
import type { HostedPage } from "@/app/merchant/billing/actions";

const ADMIN_TEST_OFFER = "admin_test";

// Admins can run one real payment end to end on a test business: it buys the admin-only $1.00
// test offer, which merchants never see and which holds no seat, so no Founding seat is claimed.
export async function adminTestCheckout(businessId: unknown): Promise<HostedPage> {
  const id = z.uuid().safeParse(businessId);
  if (!id.success) return { ok: false, error: "That business could not be found." };
  const ctx = await requireAdminAction();
  if (!ctx) return { ok: false, error: "Only Coupersville admins can do that." };
  if (!anetConfigured()) return { ok: false, error: "Authorize.net is not set up." };

  const [{ data: business }, { data: offers }] = await Promise.all([
    ctx.supabase.from("businesses").select("id, name, status").eq("id", id.data).maybeSingle(),
    ctx.supabase.rpc("offer_overview"),
  ]);
  if (!business) return { ok: false, error: "That business could not be found." };
  const offer = ((offers ?? []) as Offer[]).find((o) => o.code === ADMIN_TEST_OFFER);
  if (!offer || offer.seat_cap !== null) return { ok: false, error: "The admin test offer is missing. Run the latest migration." };

  const r = await startCheckout({
    businessId: business.id,
    businessName: business.name,
    offer,
    cycle: "annual",
    createdBy: ctx.user.id,
    email: null,
    returnPath: `/admin/merchants/${business.id}`,
  });
  if (r.ok) return { ok: true, url: r.url, token: r.token };
  const reasons: Record<string, string> = {
    has_plan: "This business already has a paid plan.",
    no_offer: "The admin test offer is not available.",
  };
  return { ok: false, error: reasons[r.reason] ?? "We could not reach Authorize.net. Try again in a moment." };
}
