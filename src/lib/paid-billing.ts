import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl } from "@/lib/site";
import { safeTimeZone } from "@/lib/dates";
import { FOUNDING_OFFER, formatPrice, freeSeatsLeft, type Offer } from "@/lib/offers";
import {
  AnetError,
  captureAuthorization,
  chargeProfile,
  chooseCard,
  customerTransactions,
  ensureCustomerProfile,
  hostedPaymentToken,
  hostedPaymentUrl,
  hostedProfileToken,
  hostedProfileUrl,
  profileFromTransaction,
  savedCards,
  transactionDetails,
  unsettledTransactions,
  voidTransaction,
  type TransactionDetails,
  type TransactionSummary,
} from "@/lib/authorize-net";
import { businessContact, notifyPlanStarted, sendOnce } from "@/lib/email/notices";
import { isTestAddress } from "@/lib/email/send";
import { addCardReminderEmail, adminBillingAlertEmail, paymentFailedEmail, planEndedEmail, renewalReminderEmail, renewalTermsEmail } from "@/lib/email/templates";
import type { Tables } from "@/lib/supabase/database.types";

// Paid billing with Authorize.net.
//
// Checkout: begin_paid_checkout holds a seat (seat-capped offers) and Accept Hosted authorises the
// card. resolveCheckout then confirms the transaction with getTransactionDetails, takes the right
// to resolve it (checkout_start_resolving), captures or voids, and records the outcome
// (checkout_finish). The return page, the webhook and the daily sweep all call resolveCheckout,
// and each step is safe to repeat, so a payment is captured once whichever path gets there first.
//
// Renewals: the daily job charges the saved card at the price in `offers` on the day it charges.
// Each attempt is claimed in renewal_attempts (unique per plan, period and retry day) before the
// card is charged, and its invoice number is how an unknown result is looked up later.

export type Cycle = "annual" | "monthly";
type Plan = Tables<"subscriptions">;
type Checkout = Tables<"checkouts">;
type Attempt = Tables<"renewal_attempts">;

const DAY_MS = 86_400_000;
export const SEAT_HOLD_MINUTES = 30;
export const RETRY_DAYS = [0, 1, 3, 7] as const;

// A test-only clock for renewals and reminders. Never on Vercel, and only against the sandbox.
export function testClockAllowed(): boolean {
  return !process.env.VERCEL_ENV && process.env.AUTHORIZE_NET_ENV === "sandbox";
}

export function priceFor(offer: Pick<Offer, "annual_price_cents" | "monthly_price_cents">, cycle: Cycle): number | null {
  return cycle === "monthly" ? offer.monthly_price_cents : offer.annual_price_cents;
}

export function priceText(cents: number, cycle: Cycle): string {
  return `${formatPrice(cents)} ${cycle === "monthly" ? "a month" : "a year"}`;
}

// The offer a merchant without a paid plan can buy now: the current offer, except Founding while
// free seats remain (those are claimed by publishing, not bought).
export function purchasableOffer(current: Offer | null): Offer | null {
  if (!current) return null;
  if (current.code === FOUNDING_OFFER && freeSeatsLeft(current) > 0) return null;
  if (current.seat_cap !== null && Number(current.seats_used) >= current.seat_cap) return null;
  return current;
}

const newInvoice = (prefix: "C") => `${prefix}${randomBytes(9).toString("hex").slice(0, 17)}`;
// Renewal key: one per plan, period and retry day. Deterministic, so a second run finds the first.
const renewalInvoice = (businessId: string, periodEnd: string, day: number) =>
  `R${createHash("sha256").update(`${businessId}|${new Date(periodEnd).toISOString()}|${day}`).digest("hex").slice(0, 19)}`;

const shortId = (uuid: string) => uuid.replace(/-/g, "").slice(0, 20);

// ---------------------------------------------------------------- Admin alerts

async function adminEmails(): Promise<{ id: string; email: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id").eq("role", "admin").eq("status", "active");
  const out: { id: string; email: string }[] = [];
  for (const p of data ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(p.id);
    if (u.user?.email) out.push({ id: p.id, email: u.user.email });
  }
  return out;
}

export async function alertAdmins(ref: string, subject: string, lines: string[]): Promise<void> {
  // A local sandbox run (tests) shares the database with the live site: alert only test admins,
  // never the real ones.
  const admins = (await adminEmails()).filter((a) => !testClockAllowed() || isTestAddress(a.email));
  for (const a of admins) {
    await sendOnce("admin_billing_alert", `${ref}:${a.id}`, a.email, adminBillingAlertEmail({ subject, lines }));
  }
}

// ---------------------------------------------------------------- Checkout

export type StartCheckout =
  | { ok: true; token: string; url: string; checkoutId: string }
  // detail is Authorize.net's own code and message, for admin screens only.
  | { ok: false; reason: "no_offer" | "no_price" | "has_plan" | "seats_gone" | "processor"; detail?: string };

export async function startCheckout(input: {
  businessId: string;
  businessName: string;
  offer: Offer;
  cycle: Cycle;
  createdBy: string;
  email: string | null;
  // Where Accept Hosted sends the merchant back, with ?checkout=<id> added.
  returnPath: string;
}): Promise<StartCheckout> {
  const admin = createAdminClient();
  const amount = priceFor(input.offer, input.cycle);
  if (!amount) return { ok: false, reason: "no_price" };

  const invoice = newInvoice("C");
  const { data, error } = await admin.rpc("begin_paid_checkout", {
    p_business_id: input.businessId,
    p_offer_code: input.offer.code,
    p_cycle: input.cycle,
    p_amount_cents: amount,
    p_invoice: invoice,
    p_created_by: input.createdBy,
    p_hold_minutes: SEAT_HOLD_MINUTES,
  });
  const begun = data as { result: string; id?: string } | null;
  if (error || !begun) return { ok: false, reason: "processor" };
  if (begun.result !== "ok" || !begun.id) return { ok: false, reason: begun.result as "no_offer" | "has_plan" | "seats_gone" };

  const { data: plan } = await admin.from("subscriptions").select("anet_customer_profile_id").eq("business_id", input.businessId).maybeSingle();
  const sep = input.returnPath.includes("?") ? "&" : "?";
  try {
    const token = await hostedPaymentToken({
      amountCents: amount,
      invoiceNumber: invoice,
      description: `Coupersville ${input.offer.name}, ${input.cycle === "monthly" ? "monthly" : "annual"}, ${input.businessName}`,
      customerProfileId: plan?.anet_customer_profile_id ?? null,
      merchantCustomerId: shortId(input.businessId),
      email: input.email,
      returnUrl: absoluteUrl(`${input.returnPath}${sep}checkout=${begun.id}`),
      cancelUrl: absoluteUrl(`${input.returnPath}${sep}checkout=${begun.id}&cancelled=1`),
    });
    return { ok: true, token, url: hostedPaymentUrl(), checkoutId: begun.id };
  } catch (e) {
    console.error(`checkout ${begun.id}: hosted page failed (${e instanceof AnetError ? e.code : "unknown"})`);
    // Release the seat hold straight away.
    await admin.from("checkouts").update({ status: "expired", outcome: "hosted_page_failed" }).eq("id", begun.id).eq("status", "pending");
    return { ok: false, reason: "processor", detail: e instanceof AnetError ? `${e.code}: ${e.message}` : undefined };
  }
}

export type ResolveResult =
  | "captured"
  | "voided"
  | "failed"
  | "no_payment"
  | "pending_review"
  | "busy"
  | "retry_later"
  | "mismatch"
  | "not_found";

const CAPTURED = new Set(["capturedPendingSettlement", "settledSuccessfully"]);
const AUTHORISED = "authorizedPendingCapture";
const REVIEW = new Set(["FDSPendingReview", "FDSAuthorizedPendingReview", "underReview"]);
const DEAD = new Set(["declined", "expired", "failedReview", "communicationError", "generalError", "settlementError", "couldNotVoid", "returnedItem"]);

async function findTransId(invoice: string, unsettled?: TransactionSummary[]): Promise<string | null> {
  const list = unsettled ?? (await unsettledTransactions());
  return list.find((t) => t.invoiceNumber === invoice)?.transId ?? null;
}

// Confirms one checkout's payment and captures or voids it. Safe to call any number of times, from
// any path, at the same time.
export async function resolveCheckout(checkoutId: string, transIdHint?: string | null, unsettled?: TransactionSummary[]): Promise<ResolveResult> {
  const admin = createAdminClient();
  const { data: checkout } = await admin.from("checkouts").select("*").eq("id", checkoutId).maybeSingle();
  if (!checkout) return "not_found";
  if (checkout.status === "captured" || checkout.status === "voided" || checkout.status === "failed") return checkout.status;

  const transId = transIdHint ?? checkout.anet_trans_id ?? (await findTransId(checkout.invoice_number, unsettled));
  if (!transId) return "no_payment";

  let details = await transactionDetails(transId);
  if (details.invoiceNumber !== checkout.invoice_number) {
    await alertAdmins(`checkout-mismatch:${checkout.id}`, "a payment does not match its checkout", [
      `Checkout ${checkout.id} (invoice ${checkout.invoice_number}) was matched to transaction ${transId}, whose invoice is ${details.invoiceNumber ?? "missing"}.`,
      "Nothing was captured. Check the transaction in Authorize.net.",
    ]);
    return "mismatch";
  }

  if (CAPTURED.has(details.status)) return finishCaptured(checkout, details);
  if (details.status === "voided") return finishOther(checkout, "voided", "voided_at_processor", details);
  if (DEAD.has(details.status)) return finishOther(checkout, "failed", details.status, details);
  if (REVIEW.has(details.status)) return "pending_review";
  if (details.status !== AUTHORISED) return "retry_later";

  if (details.authAmountCents !== checkout.amount_cents) {
    const lease = await lease_(checkout.id, transId);
    if (lease !== "capture" && lease !== "void") return leaseResult(lease);
    await voidTransaction(transId);
    return finishOther(checkout, "voided", "amount_mismatch", details);
  }

  const lease = await lease_(checkout.id, transId);
  if (lease === "void") {
    const v = await voidTransaction(transId);
    details = await transactionDetails(transId);
    if (v.outcome === "approved" || details.status === "voided") return finishOther(checkout, "voided", "seats_gone", details);
    return "retry_later";
  }
  if (lease !== "capture") return leaseResult(lease);

  const c = await captureAuthorization(transId, checkout.amount_cents);
  // Whatever the capture call said, the transaction's own status decides.
  details = await transactionDetails(transId);
  if (CAPTURED.has(details.status)) return finishCaptured(checkout, details);
  if (c.outcome === "declined" || DEAD.has(details.status)) return finishOther(checkout, "failed", "capture_declined", details);
  return "retry_later";
}

async function lease_(checkoutId: string, transId: string): Promise<string> {
  const { data, error } = await createAdminClient().rpc("checkout_start_resolving", { p_checkout_id: checkoutId, p_trans_id: transId });
  if (error) return "error";
  return (data as { result: string }).result;
}

function leaseResult(lease: string): ResolveResult {
  if (lease === "captured" || lease === "voided" || lease === "failed") return lease;
  if (lease === "busy") return "busy";
  if (lease === "trans_mismatch") return "mismatch";
  return "retry_later";
}

async function finishCaptured(checkout: Checkout, details: TransactionDetails): Promise<ResolveResult> {
  const admin = createAdminClient();
  let customer = details.customerProfileId;
  let payment = details.paymentProfileId;
  if (!customer) {
    const { data: plan } = await admin.from("subscriptions").select("anet_customer_profile_id").eq("business_id", checkout.business_id).maybeSingle();
    customer = plan?.anet_customer_profile_id ?? null;
  }
  if (!customer) {
    const made = await profileFromTransaction(details.transId).catch(() => null);
    customer = made?.customerProfileId ?? null;
    payment = made?.paymentProfileId ?? payment;
  }
  if (customer && !payment) {
    const card = chooseCard(await savedCards(customer).catch(() => []));
    payment = card?.paymentProfileId ?? null;
  }
  // The record must carry the transaction id even if the lease was never taken (captured elsewhere).
  if (!checkout.anet_trans_id) await admin.from("checkouts").update({ anet_trans_id: details.transId }).eq("id", checkout.id).is("anet_trans_id", null);
  const { data, error } = await admin.rpc("checkout_finish", {
    p_checkout_id: checkout.id,
    p_outcome: "captured",
    p_customer_profile: customer ?? undefined,
    p_payment_profile: payment ?? undefined,
    p_last4: details.last4 ?? undefined,
  });
  if (error) return "retry_later";
  const result = data as { result: string; status?: string };
  if (result.result === "recorded") {
    // The confirmation repeats the automatic renewal terms agreed before payment.
    const { data: consent } = await admin.from("renewal_consents").select("wording").eq("checkout_id", checkout.id).maybeSingle();
    await notifyPlanStarted(checkout.business_id, `anet:${checkout.id}`, consent?.wording ?? null);
  }
  if (!customer) {
    await alertAdmins(`no-profile:${checkout.id}`, "a paid plan has no saved card", [
      `Checkout ${checkout.id} was captured (transaction ${details.transId}), but no customer profile could be saved, so it cannot renew on its own.`,
    ]);
  }
  return "captured";
}

async function finishOther(checkout: Checkout, outcome: "voided" | "failed", note: string, details: TransactionDetails): Promise<ResolveResult> {
  const admin = createAdminClient();
  await admin.rpc("checkout_finish", { p_checkout_id: checkout.id, p_outcome: outcome, p_note: note });
  await admin.from("payments").upsert(
    {
      business_id: checkout.business_id,
      anet_trans_id: details.transId,
      kind: "first",
      status: outcome === "voided" ? "voided" : "declined",
      amount_cents: checkout.amount_cents,
      card_last4: details.last4,
      offer_code: checkout.offer_code,
      billing_cycle: checkout.billing_cycle,
      checkout_id: checkout.id,
    },
    { onConflict: "anet_trans_id", ignoreDuplicates: true },
  );
  return outcome;
}

// Finds authorised payments the return page and webhook missed, and resolves them. Releases holds
// on checkouts nobody paid. Alerts admins about anything still unresolved after 24 hours.
export async function sweepCheckouts(now = Date.now(), onlyBusinessIds?: string[]): Promise<Record<string, number>> {
  const admin = createAdminClient();
  const report: Record<string, number> = {};
  const bump = (k: string) => (report[k] = (report[k] ?? 0) + 1);
  let q = admin
    .from("checkouts")
    .select("*")
    .in("status", ["pending", "resolving", "expired"])
    .gte("created_at", new Date(now - 30 * DAY_MS).toISOString());
  if (onlyBusinessIds) q = q.in("business_id", onlyBusinessIds);
  const { data: open } = await q;
  if (!open?.length) return report;

  let unsettled: TransactionSummary[] | undefined;
  try {
    unsettled = await unsettledTransactions();
  } catch {
    unsettled = undefined;
  }
  for (const c of open) {
    const transId = c.anet_trans_id ?? unsettled?.find((t) => t.invoiceNumber === c.invoice_number)?.transId ?? null;
    if (transId) {
      try {
        bump(await resolveCheckout(c.id, transId, unsettled));
      } catch (e) {
        bump("error");
        console.error(`sweep checkout ${c.id}: ${e instanceof AnetError ? e.code : "error"}`);
      }
    } else if (c.status === "pending" && new Date(c.created_at).getTime() < now - 2 * 3_600_000 && unsettled) {
      // Nobody paid within two hours (a hosted page token lasts 15 minutes): release the hold.
      await admin.from("checkouts").update({ status: "expired", outcome: "not_paid" }).eq("id", c.id).eq("status", "pending");
      bump("expired");
    }
    const stillOpen = transId && (await admin.from("checkouts").select("status").eq("id", c.id).single()).data?.status;
    if (stillOpen && !["captured", "voided", "failed"].includes(stillOpen) && new Date(c.created_at).getTime() < now - DAY_MS) {
      await alertAdmins(`checkout:${c.id}`, "a checkout is unresolved after 24 hours", [
        `Checkout ${c.id} (invoice ${c.invoice_number}, ${formatPrice(c.amount_cents)}) has an authorised payment (transaction ${transId}) that is still not captured or voided.`,
        "The daily job keeps trying. If it stays like this, check the transaction in Authorize.net.",
      ]);
      bump("alerted");
    }
  }
  return report;
}

// ---------------------------------------------------------------- Cards

// Re-reads the saved cards and points the plan at the one renewals should use.
export async function refreshCard(businessId: string): Promise<{ last4: string | null } | null> {
  const admin = createAdminClient();
  const { data: plan } = await admin.from("subscriptions").select("anet_customer_profile_id, source").eq("business_id", businessId).maybeSingle();
  if (!plan?.anet_customer_profile_id) return null;
  const card = chooseCard(await savedCards(plan.anet_customer_profile_id));
  await admin
    .from("subscriptions")
    .update({ anet_payment_profile_id: card?.paymentProfileId ?? null, card_last4: card?.last4 ?? null, card_updated_at: new Date().toISOString() })
    .eq("business_id", businessId);
  // A free seat that has just added a card: confirm the automatic renewal terms it agreed to, once.
  if (card && plan.source === "complimentary") {
    const { data: consent } = await admin
      .from("renewal_consents")
      .select("id, wording")
      .eq("business_id", businessId)
      .eq("context", "add_card")
      .order("agreed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const contact = consent ? await businessContact(businessId) : null;
    if (consent && contact) {
      await sendOnce("renewal_terms", consent.id, contact.email, renewalTermsEmail({ businessName: contact.name, terms: consent.wording, last4: card.last4 }));
    }
  }
  return { last4: card?.last4 ?? null };
}

// The hosted profile page, for "Update card" and for free seats adding a card.
export async function startCardPage(input: { businessId: string; businessName: string; email: string | null; returnPath: string; cycle?: Cycle }) {
  const admin = createAdminClient();
  const { data: plan } = await admin.from("subscriptions").select("anet_customer_profile_id").eq("business_id", input.businessId).maybeSingle();
  if (!plan) return null;
  let profile = plan.anet_customer_profile_id;
  if (!profile) {
    profile = await ensureCustomerProfile(shortId(input.businessId), input.email, `Coupersville: ${input.businessName}`);
    await admin.from("subscriptions").update({ anet_customer_profile_id: profile }).eq("business_id", input.businessId);
  }
  if (input.cycle) await admin.from("subscriptions").update({ billing_cycle: input.cycle }).eq("business_id", input.businessId);
  const token = await hostedProfileToken(profile, absoluteUrl(input.returnPath));
  return { token, url: hostedProfileUrl() };
}

// ---------------------------------------------------------------- Renewals

async function offersByCode(): Promise<Map<string, Tables<"offers">>> {
  const { data } = await createAdminClient().from("offers").select("*");
  return new Map((data ?? []).map((o) => [o.code, o]));
}

// What the plan renews into, and at what price, on the day it renews. Reads `offers` at that moment.
export function renewalTerms(plan: Pick<Plan, "offer_code" | "term_ends_at" | "current_period_end" | "billing_cycle">, offers: Map<string, Tables<"offers">>) {
  const current = plan.offer_code ? offers.get(plan.offer_code) : undefined;
  const periodEnd = plan.current_period_end ? new Date(plan.current_period_end).getTime() : 0;
  const termOver = !current || (plan.term_ends_at !== null && periodEnd >= new Date(plan.term_ends_at).getTime() - DAY_MS);
  const target = termOver ? offers.get(current?.renews_into ?? "general") ?? current : current;
  if (!target) return null;
  let cycle: Cycle = plan.billing_cycle === "monthly" ? "monthly" : "annual";
  let amount = priceFor(target, cycle);
  if (!amount) {
    cycle = "annual";
    amount = target.annual_price_cents;
  }
  return { offer: target, cycle, amountCents: amount };
}

// Plans the renewal job looks at: paid plans that renew, and free seats with a card.
function renews(plan: Plan): boolean {
  if (plan.cancel_at_period_end || !plan.anet_customer_profile_id || !plan.anet_payment_profile_id || !plan.current_period_end) return false;
  if (plan.source === "complimentary") return plan.offer_code === FOUNDING_OFFER && plan.term_ends_at !== null && plan.status === "active";
  return plan.source === "authorize_net" && (plan.status === "active" || plan.status === "past_due");
}

export type RenewalReport = Record<string, number>;

// Renewals, retries and renewal reminders run only while the "Renewals" setting is on. The one
// exception is a local sandbox test run for named test businesses (the test clock), never on Vercel.
export async function renewalsEnabled(onlyBusinessIds?: string[]): Promise<boolean> {
  if (testClockAllowed() && onlyBusinessIds?.length) return true;
  const { data } = await createAdminClient().from("platform_settings").select("renewals_enabled").eq("singleton", true).maybeSingle();
  return data?.renewals_enabled === true;
}

export async function runRenewals(now = Date.now(), onlyBusinessIds?: string[]): Promise<RenewalReport> {
  if (!(await renewalsEnabled(onlyBusinessIds))) return { renewals_off: 1 };
  const admin = createAdminClient();
  const report: RenewalReport = {};
  const bump = (k: string) => (report[k] = (report[k] ?? 0) + 1);
  let q = admin
    .from("subscriptions")
    .select("*")
    .in("status", ["active", "past_due"])
    .not("anet_payment_profile_id", "is", null)
    .lte("current_period_end", new Date(now + DAY_MS).toISOString());
  if (onlyBusinessIds) q = q.in("business_id", onlyBusinessIds);
  const { data: plans, error } = await q;
  if (error) throw new Error(`renewals: could not read plans (${error.code})`);
  const offers = await offersByCode();

  for (const plan of plans ?? []) {
    if (!renews(plan)) continue;
    try {
      bump(await renewOne(plan, offers, now));
    } catch (e) {
      bump("error");
      console.error(`renewal ${plan.business_id}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return report;
}

async function renewOne(plan: Plan, offers: Map<string, Tables<"offers">>, now: number): Promise<string> {
  const admin = createAdminClient();
  const periodEnd = plan.current_period_end!;
  const end = new Date(periodEnd).getTime();
  // Free seats continuing on General are charged up to a day early, so coupons never drop out.
  const startAt = plan.source === "complimentary" ? end - DAY_MS : end;
  if (now < startAt) return "not_due";

  const { data: attempts } = await admin.from("renewal_attempts").select("*").eq("business_id", plan.business_id).eq("period_end", periodEnd);
  for (const a of attempts ?? []) {
    if (a.status === "pending" || a.status === "unknown") {
      const settled = await reconcileAttempt(a, plan, now);
      if (settled === "paid") return "reconciled_paid";
      if (settled === "held") return "waiting_review";
      if (settled === "unknown") return "waiting_unknown";
    }
  }
  const { data: fresh } = await admin.from("renewal_attempts").select("*").eq("business_id", plan.business_id).eq("period_end", periodEnd);
  if (fresh?.some((a) => a.status === "paid")) return "already_paid";

  const daysLate = Math.max(0, Math.floor((now - end) / DAY_MS));
  const due = [...RETRY_DAYS].filter((d) => d <= daysLate).at(-1)!;
  if (fresh?.some((a) => a.attempt_day === due)) return "already_attempted";

  const terms = renewalTerms(plan, offers);
  if (!terms) return "no_offer";
  const invoice = renewalInvoice(plan.business_id, periodEnd, due);
  const { data: attempt, error } = await admin
    .from("renewal_attempts")
    .insert({
      business_id: plan.business_id,
      period_end: periodEnd,
      attempt_day: due,
      invoice_number: invoice,
      amount_cents: terms.amountCents,
      offer_code: terms.offer.code,
      billing_cycle: terms.cycle,
    })
    .select()
    .single();
  // Another run claimed this attempt first: it charges, this one does not.
  if (error?.code === "23505") return "claimed_elsewhere";
  if (error || !attempt) throw new Error(`could not claim attempt (${error?.code})`);

  let result;
  try {
    result = await chargeProfile({
      customerProfileId: plan.anet_customer_profile_id!,
      paymentProfileId: plan.anet_payment_profile_id!,
      amountCents: terms.amountCents,
      invoiceNumber: invoice,
      description: `Coupersville ${terms.offer.name}, ${terms.cycle} renewal`,
    });
  } catch (e) {
    const unknown = e instanceof AnetError ? e.unknown : true;
    if (unknown) {
      await admin.from("renewal_attempts").update({ status: "unknown", response_text: e instanceof Error ? e.message.slice(0, 200) : null }).eq("id", attempt.id);
      await alertAdmins(`renewal:${attempt.id}`, "a renewal ended with an unknown result", [
        `Renewal ${invoice} for business ${plan.business_id} (${formatPrice(terms.amountCents)}) got no clear answer from Authorize.net.`,
        "The daily job will look it up by invoice number before charging again. Check the transaction in Authorize.net if it stays unknown.",
      ]);
      return "unknown";
    }
    return recordFailure(plan, attempt, null, e instanceof Error ? e.message : "error", now);
  }

  if (result.outcome === "approved") {
    await admin.rpc("apply_renewal", { p_attempt_id: attempt.id, p_trans_id: result.transId, p_last4: result.last4 ?? undefined });
    return "renewed";
  }
  if (result.outcome === "held") {
    // Held by a fraud filter. The card was not declined, so no failure email: the plan gets the
    // past-due grace while someone approves or declines it in Authorize.net, and later runs settle it.
    await admin.from("renewal_attempts").update({ status: "pending", anet_trans_id: result.transId, response_text: result.reason.slice(0, 200) }).eq("id", attempt.id);
    await admin
      .from("subscriptions")
      .update({ source: "authorize_net", status: "past_due", past_due_since: plan.past_due_since ?? new Date(now).toISOString() })
      .eq("business_id", plan.business_id);
    await alertAdmins(`renewal-held:${attempt.id}`, "a renewal is held for review", [
      `Renewal ${invoice} for business ${plan.business_id} (${formatPrice(terms.amountCents)}) was held by a fraud filter (transaction ${result.transId}).`,
      "Approve or decline it in Authorize.net under Unsettled Transactions. The daily job records the result.",
    ]);
    return "held";
  }
  return recordFailure(plan, attempt, result.transId, result.reason, now);
}

// Settles an attempt whose result we never saw, or that was held for review: by its transaction id
// when we have one, otherwise by its invoice number.
async function reconcileAttempt(attempt: Attempt, plan: Plan, now: number): Promise<"paid" | "declined" | "held" | "not_charged" | "unknown"> {
  const admin = createAdminClient();
  let found: { transId: string; status: string } | undefined;
  try {
    found = attempt.anet_trans_id
      ? await transactionDetails(attempt.anet_trans_id)
      : (await customerTransactions(plan.anet_customer_profile_id!)).find((t) => t.invoiceNumber === attempt.invoice_number);
  } catch {
    return "unknown";
  }
  if (found && CAPTURED.has(found.status)) {
    const details = await transactionDetails(found.transId);
    await admin.rpc("apply_renewal", { p_attempt_id: attempt.id, p_trans_id: found.transId, p_last4: details.last4 ?? undefined });
    return "paid";
  }
  if (found && REVIEW.has(found.status)) {
    if (attempt.status !== "pending") await admin.from("renewal_attempts").update({ status: "pending", anet_trans_id: found.transId }).eq("id", attempt.id);
    return "held";
  }
  if (found) {
    await recordFailure(plan, attempt, found.transId, found.status, now);
    return "declined";
  }
  // Not there after 30 minutes: it never reached the card.
  if (Date.now() - new Date(attempt.created_at).getTime() > 30 * 60_000) {
    await admin.from("renewal_attempts").update({ status: "not_charged", resolved_at: new Date().toISOString() }).eq("id", attempt.id);
    return "not_charged";
  }
  return "unknown";
}

async function recordFailure(plan: Plan, attempt: Attempt, transId: string | null, reason: string, now: number): Promise<string> {
  const admin = createAdminClient();
  await admin
    .from("renewal_attempts")
    .update({ status: "declined", anet_trans_id: transId, response_text: reason.slice(0, 200), resolved_at: new Date().toISOString() })
    .eq("id", attempt.id);
  if (transId) {
    await admin.from("payments").upsert(
      {
        business_id: plan.business_id,
        anet_trans_id: transId,
        kind: "renewal",
        status: "declined",
        amount_cents: attempt.amount_cents,
        card_last4: plan.card_last4,
        offer_code: attempt.offer_code,
        billing_cycle: attempt.billing_cycle,
        period_start: plan.current_period_end,
        renewal_attempt_id: attempt.id,
      },
      { onConflict: "anet_trans_id", ignoreDuplicates: true },
    );
  }

  const last = attempt.attempt_day === RETRY_DAYS.at(-1);
  const pastDueSince = plan.past_due_since ?? new Date(now).toISOString();
  await admin
    .from("subscriptions")
    .update({ source: "authorize_net", status: last ? "expired" : "past_due", past_due_since: pastDueSince })
    .eq("business_id", plan.business_id);

  const contact = await businessContact(plan.business_id);
  if (contact) {
    const periodEnd = plan.current_period_end!;
    await sendOnce(
      "payment_failed",
      `${plan.business_id}:${new Date(periodEnd).toISOString()}`,
      contact.email,
      paymentFailedEmail({ businessName: contact.name, graceEndsAt: new Date(new Date(pastDueSince).getTime() + 7 * DAY_MS).toISOString(), timeZone: contact.timeZone }),
    );
    // Same key as the daily "plan ended" check, so only one of them sends it.
    if (last) await sendOnce("plan_ended", `${plan.id}:${periodEnd}`, contact.email, planEndedEmail({ businessName: contact.name }));
  }
  return last ? "ended" : "declined";
}

// ---------------------------------------------------------------- Reminders

export async function runRenewalReminders(now = Date.now(), onlyBusinessIds?: string[]): Promise<Record<string, number>> {
  // A reminder promises a renewal, so none go out while renewals are off.
  if (!(await renewalsEnabled(onlyBusinessIds))) return { renewals_off: 1 };
  const admin = createAdminClient();
  const report: Record<string, number> = {};
  const bump = (k: string) => (report[k] = (report[k] ?? 0) + 1);
  let q = admin
    .from("subscriptions")
    .select("*")
    .eq("status", "active")
    .eq("cancel_at_period_end", false)
    .gt("current_period_end", new Date(now).toISOString())
    .lte("current_period_end", new Date(now + 60 * DAY_MS).toISOString());
  if (onlyBusinessIds) q = q.in("business_id", onlyBusinessIds);
  const { data: plans } = await q;
  const offers = await offersByCode();

  for (const plan of plans ?? []) {
    const end = plan.current_period_end!;
    const days = (new Date(end).getTime() - now) / DAY_MS;
    const window = days > 30 ? 60 : days > 7 ? 30 : null;
    if (!window) continue;
    const freeSeat = plan.source === "complimentary" && plan.offer_code === FOUNDING_OFFER && plan.term_ends_at !== null;
    const paid = plan.source === "authorize_net";
    if (!freeSeat && !paid) continue;
    const contact = await businessContact(plan.business_id);
    if (!contact) continue;
    const tz = safeTimeZone(contact.timeZone);
    const ref = `${plan.business_id}:${new Date(end).toISOString()}`;

    if (paid) {
      const terms = renewalTerms(plan, offers);
      if (!terms || !plan.anet_payment_profile_id) continue;
      bump(
        await sendOnce(
          `renewal_reminder_${window}`,
          ref,
          contact.email,
          renewalReminderEmail({ businessName: contact.name, renewsOn: end, priceText: priceText(terms.amountCents, terms.cycle), offerName: terms.offer.name, timeZone: tz }),
        ),
      );
    } else {
      const general = offers.get("general");
      const prices = general
        ? general.monthly_price_cents
          ? `${formatPrice(general.annual_price_cents)} a year or ${formatPrice(general.monthly_price_cents)} a month`
          : `${formatPrice(general.annual_price_cents)} a year`
        : "See Billing";
      bump(
        await sendOnce(
          `add_card_reminder_${window}`,
          ref,
          contact.email,
          addCardReminderEmail({ businessName: contact.name, endsOn: end, generalPrices: prices, hasCard: Boolean(plan.anet_payment_profile_id), timeZone: tz }),
        ),
      );
    }
  }
  return report;
}

// Whether a plan row will renew on its own (for pages and the "plan ending" email).
export function willRenew(plan: Pick<Plan, "source" | "cancel_at_period_end" | "anet_payment_profile_id" | "offer_code" | "term_ends_at"> | null): boolean {
  if (!plan || plan.cancel_at_period_end || !plan.anet_payment_profile_id) return false;
  if (plan.source === "authorize_net") return true;
  return plan.source === "complimentary" && plan.offer_code === FOUNDING_OFFER && plan.term_ends_at !== null;
}

