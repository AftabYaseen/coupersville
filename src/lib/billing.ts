import type { Tables } from "@/lib/supabase/database.types";
import { formatDay } from "@/lib/dates";

// Plan rules shared by pages and actions. They mirror public.plan_is_current in the database,
// which is what actually decides whether coupons are live. Keep the two in step.

export const PAST_DUE_GRACE_DAYS = 7;
const DAY_MS = 86_400_000;
const STRIPE_RENEWAL_LEEWAY_MS = DAY_MS;

export type PlanRow = Pick<
  Tables<"subscriptions">,
  "source" | "status" | "current_period_end" | "cancel_at_period_end" | "past_due_since"
>;

export function planIsCurrent(plan: PlanRow | null, now = Date.now()): boolean {
  if (!plan) return false;
  if (plan.status === "active") {
    if (!plan.current_period_end) return true;
    const leeway = plan.source === "stripe" ? STRIPE_RENEWAL_LEEWAY_MS : 0;
    return new Date(plan.current_period_end).getTime() > now - leeway;
  }
  if (plan.status === "past_due" && plan.source === "stripe" && plan.past_due_since) {
    return new Date(plan.past_due_since).getTime() > now - PAST_DUE_GRACE_DAYS * DAY_MS;
  }
  return false;
}

export type PlanState =
  | { kind: "none" }
  | { kind: "complimentary"; endsAt: string | null }
  | { kind: "active"; renewsAt: string | null }
  | { kind: "cancelling"; endsAt: string | null }
  | { kind: "past_due"; graceEndsAt: string }
  | { kind: "expired"; source: "stripe" | "complimentary"; endedAt: string | null; paymentFailed: boolean };

// What the merchant sees on the billing page and dashboard.
export function planState(plan: PlanRow | null, now = Date.now()): PlanState {
  if (!plan) return { kind: "none" };
  const current = planIsCurrent(plan, now);

  if (plan.source === "complimentary") {
    return current
      ? { kind: "complimentary", endsAt: plan.current_period_end }
      : { kind: "expired", source: "complimentary", endedAt: plan.current_period_end, paymentFailed: false };
  }

  if (plan.status === "past_due") {
    if (current && plan.past_due_since) {
      return { kind: "past_due", graceEndsAt: new Date(new Date(plan.past_due_since).getTime() + PAST_DUE_GRACE_DAYS * DAY_MS).toISOString() };
    }
    const graceEnd = plan.past_due_since
      ? new Date(new Date(plan.past_due_since).getTime() + PAST_DUE_GRACE_DAYS * DAY_MS).toISOString()
      : null;
    return { kind: "expired", source: "stripe", endedAt: graceEnd, paymentFailed: true };
  }

  if (current) {
    return plan.cancel_at_period_end
      ? { kind: "cancelling", endsAt: plan.current_period_end }
      : { kind: "active", renewsAt: plan.current_period_end };
  }
  return { kind: "expired", source: "stripe", endedAt: plan.current_period_end, paymentFailed: plan.status === "expired" };
}

// One line for admin lists, for example "Paid plan, renews Oct 12, 2027".
export function planSummary(state: PlanState, tz: string): string {
  const d = (iso: string | null) => (iso ? formatDay(iso, tz) : null);
  switch (state.kind) {
    case "none":
      return "Never had a plan.";
    case "complimentary":
      return state.endsAt ? `Complimentary until ${d(state.endsAt)}` : "Complimentary, no end date";
    case "active":
      return state.renewsAt ? `Paid plan, renews ${d(state.renewsAt)}` : "Paid plan, active";
    case "cancelling":
      return `Paid plan, cancelled, active until ${d(state.endsAt) ?? "the period ends"}`;
    case "past_due":
      return `Paid plan, payment failed, grace until ${d(state.graceEndsAt)}`;
    case "expired":
      if (state.paymentFailed) return `Paid plan ended after a failed payment${state.endedAt ? `, ${d(state.endedAt)}` : ""}`;
      return `${state.source === "complimentary" ? "Complimentary" : "Paid"} plan ended${state.endedAt ? ` ${d(state.endedAt)}` : ""}`;
  }
}
