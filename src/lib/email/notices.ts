import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeTimeZone } from "@/lib/dates";
import { PAST_DUE_GRACE_DAYS, planIsCurrent } from "@/lib/billing";
import { sendEmail } from "@/lib/email/send";
import {
  couponRemovedEmail,
  paymentFailedEmail,
  planEndedEmail,
  planEndingEmail,
  planStartedEmail,
  welcomeEmail,
  type RenderedEmail,
} from "@/lib/email/templates";

// Emails that must go out once. Each one claims a row in email_notices (kind + ref) before sending,
// so running the same trigger twice, or a webhook arriving twice, sends one email. If the send fails,
// the claim is released so the next run tries again.

export type NoticeOutcome = "sent" | "skipped" | "already_sent" | "failed" | "no_recipient";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function sendOnce(kind: string, ref: string, to: string | null, email: RenderedEmail): Promise<NoticeOutcome> {
  if (!to) return "no_recipient";
  const admin = createAdminClient();
  const { error: claimError } = await admin.from("email_notices").insert({ kind, ref });
  if (claimError) {
    if (claimError.code === "23505") return "already_sent";
    console.error(`email ${kind}: could not claim (${claimError.code})`);
    return "failed";
  }
  const result = await sendEmail({ ...email, to, tag: kind });
  if (!result.ok) {
    await admin.from("email_notices").delete().eq("kind", kind).eq("ref", ref);
    return "failed";
  }
  return result.skipped ? "skipped" : "sent";
}

async function emailOf(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await createAdminClient().auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

// The business name, its timezone and the owner's sign-in email (the address we know reaches them).
export async function businessContact(businessId: string) {
  const { data } = await createAdminClient().from("businesses").select("name, timezone, owner_id").eq("id", businessId).maybeSingle();
  if (!data) return null;
  return { name: data.name, timeZone: safeTimeZone(data.timezone), email: await emailOf(data.owner_id) };
}

// Sent the first time an account signs in, for accounts made in the last two days, so people who
// signed up before welcome emails existed do not get one now.
export async function notifyWelcome(user: { id: string; email?: string | null; created_at: string }): Promise<NoticeOutcome> {
  if (Date.now() - new Date(user.created_at).getTime() > 2 * DAY_MS) return "skipped";
  const { data: profile } = await createAdminClient().from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (!profile || profile.role === "admin") return "skipped";
  return sendOnce("welcome", user.id, user.email ?? null, welcomeEmail({ role: profile.role, name: profile.full_name }));
}

// Once per plan: a Stripe subscription id, or a complimentary grant's row id and end date.
export async function notifyPlanStarted(businessId: string, ref: string): Promise<NoticeOutcome> {
  const admin = createAdminClient();
  const [{ data: plan }, contact] = await Promise.all([
    admin.from("subscriptions").select("*").eq("business_id", businessId).maybeSingle(),
    businessContact(businessId),
  ]);
  if (!plan || !contact || plan.status !== "active") return "skipped";
  return sendOnce(
    "plan_started",
    ref,
    contact.email,
    planStartedEmail({ businessName: contact.name, source: plan.source, endsAt: plan.current_period_end, timeZone: contact.timeZone }),
  );
}

// Once per failed invoice. Only when the plan we hold is that Stripe subscription and is past due.
export async function notifyPaymentFailed(stripeSubscriptionId: string, invoiceId: string): Promise<NoticeOutcome> {
  const { data: plan } = await createAdminClient()
    .from("subscriptions")
    .select("business_id, status, past_due_since")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  if (!plan || plan.status !== "past_due") return "skipped";
  const contact = await businessContact(plan.business_id);
  if (!contact) return "skipped";
  const since = plan.past_due_since ? new Date(plan.past_due_since).getTime() : Date.now();
  return sendOnce(
    "payment_failed",
    invoiceId,
    contact.email,
    paymentFailedEmail({ businessName: contact.name, graceEndsAt: new Date(since + PAST_DUE_GRACE_DAYS * DAY_MS).toISOString(), timeZone: contact.timeZone }),
  );
}

// Once per hold: the coupon id and when it was held, so a second hold after a release emails again.
export async function notifyCouponRemoved(couponId: string): Promise<NoticeOutcome> {
  const { data: coupon } = await createAdminClient()
    .from("coupons")
    .select("business_id, title, admin_hold, hold_reason, held_at")
    .eq("id", couponId)
    .maybeSingle();
  if (!coupon?.admin_hold) return "skipped";
  const contact = await businessContact(coupon.business_id);
  if (!contact) return "skipped";
  return sendOnce(
    "coupon_removed",
    `${couponId}:${coupon.held_at ?? ""}`,
    contact.email,
    couponRemovedEmail({ businessName: contact.name, couponTitle: coupon.title, reason: coupon.hold_reason }),
  );
}

export type PlanNoticeReport = { ending: Record<NoticeOutcome, number>; ended: Record<NoticeOutcome, number> };

const emptyCounts = (): Record<NoticeOutcome, number> => ({ sent: 0, skipped: 0, already_sent: 0, failed: 0, no_recipient: 0 });

// The daily job. "Ending" covers plans that will not renew (complimentary, or Stripe set to cancel)
// and end within 7 days. "Ended" covers plans that stopped being current in the last 7 days. Both are
// keyed on the plan's end date, so running the job twice in a day, or every day of the week, sends
// each email once per plan period.
export async function runPlanNotices(now = Date.now()): Promise<PlanNoticeReport> {
  const admin = createAdminClient();
  const report: PlanNoticeReport = { ending: emptyCounts(), ended: emptyCounts() };
  const soon = new Date(now + 7 * DAY_MS).toISOString();
  const weekAgo = new Date(now - 7 * DAY_MS).toISOString();

  const { data: plans, error } = await admin
    .from("subscriptions")
    .select("id, business_id, source, status, current_period_end, cancel_at_period_end, past_due_since")
    .not("current_period_end", "is", null)
    .gte("current_period_end", weekAgo)
    .lte("current_period_end", soon);
  if (error) throw new Error(`could not read plans: ${error.code}`);

  for (const plan of plans ?? []) {
    const endsAt = plan.current_period_end!;
    const current = planIsCurrent(plan, now);
    const endsInFuture = new Date(endsAt).getTime() > now;
    const willNotRenew = plan.source === "complimentary" || plan.cancel_at_period_end;

    if (current && endsInFuture && plan.status === "active" && willNotRenew) {
      const contact = await businessContact(plan.business_id);
      const outcome = contact
        ? await sendOnce("plan_ending", `${plan.id}:${endsAt}`, contact.email, planEndingEmail({ businessName: contact.name, source: plan.source, endsAt, timeZone: contact.timeZone }))
        : "no_recipient";
      report.ending[outcome] += 1;
    } else if (!current && (plan.status === "active" || plan.status === "canceled" || plan.status === "expired")) {
      // Past due plans are covered by the payment failed email.
      const contact = await businessContact(plan.business_id);
      const outcome = contact ? await sendOnce("plan_ended", `${plan.id}:${endsAt}`, contact.email, planEndedEmail({ businessName: contact.name })) : "no_recipient";
      report.ended[outcome] += 1;
    }
  }
  return report;
}
