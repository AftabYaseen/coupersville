import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

// Deleting an account removes the sign-in, the profile, saved coupons and unused redemption codes.
// Redemptions stay, with the shopper (and the staff member who checked them) removed, so a
// business's counts stay right. A business owned by the account is suspended, its contact email,
// phone and website are cleared, its staff lose access, every staff invite (accepted or not) is
// deleted, and a paid plan is set to cancel at the end of the period it has already paid for.

export type OwnedBusiness = { id: string; name: string; paidPlan: boolean };

const STRIPE_LIVE = new Set(["active", "past_due"]);

export async function ownedBusinesses(userId: string): Promise<OwnedBusiness[]> {
  const admin = createAdminClient();
  const { data: businesses } = await admin.from("businesses").select("id, name").eq("owner_id", userId);
  if (!businesses?.length) return [];
  const { data: plans } = await admin
    .from("subscriptions")
    .select("business_id, source, status, stripe_subscription_id")
    .in("business_id", businesses.map((b) => b.id));
  return businesses.map((b) => {
    const plan = plans?.find((p) => p.business_id === b.id);
    return { ...b, paidPlan: Boolean(plan?.source === "stripe" && plan.stripe_subscription_id && STRIPE_LIVE.has(plan.status)) };
  });
}

export type DeletionResult = { ok: true } | { ok: false; reason: "admin" | "billing" | "failed" };

export async function deleteAccount(userId: string): Promise<DeletionResult> {
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!profile) return { ok: false, reason: "failed" };
  if (profile.role === "admin") return { ok: false, reason: "admin" };

  const owned = await ownedBusinesses(userId);

  // Billing first: if Stripe cannot be told, stop before anything is removed.
  if (owned.some((b) => b.paidPlan)) {
    const { data: plans } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id, status, source")
      .in("business_id", owned.map((b) => b.id));
    try {
      for (const plan of plans ?? []) {
        if (plan.source !== "stripe" || !plan.stripe_subscription_id || !STRIPE_LIVE.has(plan.status)) continue;
        const sub = await getStripe().subscriptions.retrieve(plan.stripe_subscription_id);
        if (sub.status !== "canceled" && !sub.cancel_at_period_end) {
          await getStripe().subscriptions.update(sub.id, { cancel_at_period_end: true });
        }
      }
    } catch (error) {
      console.error(`account deletion: could not cancel plan (${error instanceof Error ? error.name : "unknown"})`);
      return { ok: false, reason: "billing" };
    }
  }

  for (const business of owned) {
    const ids = { business_id: business.id };
    const suspended = await admin
      .from("businesses")
      .update({ status: "suspended", contact_email: null, contact_phone: null, website_url: null })
      .eq("id", business.id);
    const members = await admin.from("business_members").delete().match(ids).neq("user_id", userId);
    const invites = await admin.from("staff_invites").delete().match(ids);
    if (suspended.error || members.error || invites.error) return { ok: false, reason: "failed" };
  }

  // Cascades remove the profile, memberships, favorites and redemption codes; redemptions keep
  // their row with user_id and verified_by cleared; owned businesses keep their row with no owner.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error(`account deletion: auth delete failed (${error.code ?? error.name})`);
    return { ok: false, reason: "failed" };
  }
  return { ok: true };
}
