import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transactionDetails, webhookSignatureValid } from "@/lib/authorize-net";
import { refreshCard, resolveCheckout, runRenewals } from "@/lib/paid-billing";

// Authorize.net webhooks. The signature (X-ANET-Signature, HMAC-SHA512 with the Signature Key) is
// checked on the raw body, each notification is handled once, and no plan changes on the
// webhook's word: payments are confirmed with getTransactionDetails first.

type Notification = {
  notificationId?: string;
  eventType?: string;
  payload?: { id?: string | number; entityName?: string; invoiceNumber?: string; customerProfileId?: string | number };
};

export async function POST(request: Request) {
  const raw = await request.text();
  if (!webhookSignatureValid(raw, request.headers.get("x-anet-signature"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }
  let body: Notification;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }
  const id = body.notificationId;
  const type = body.eventType ?? "";
  if (!id || !type) return NextResponse.json({ error: "Bad body" }, { status: 400 });

  const admin = createAdminClient();
  const { error: claimError } = await admin.from("anet_events").insert({ id, event_type: type });
  if (claimError?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  if (claimError) return NextResponse.json({ error: "Could not record" }, { status: 500 });

  try {
    const outcome = await handle(type, body);
    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    // Release the claim so Authorize.net's retry is handled.
    await admin.from("anet_events").delete().eq("id", id);
    console.error(`anet webhook ${type}: ${error instanceof Error ? error.message : "error"}`);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

async function handle(type: string, body: Notification): Promise<string> {
  const admin = createAdminClient();
  const p = body.payload ?? {};

  if (type.startsWith("net.authorize.payment.")) {
    const transId = p.id ? String(p.id) : null;
    if (!transId) return "no_transaction";
    // Trust the processor's record, not the notification.
    const details = await transactionDetails(transId);
    const invoice = details.invoiceNumber ?? "";
    if (invoice.startsWith("C")) {
      const { data: checkout } = await admin.from("checkouts").select("id").eq("invoice_number", invoice).maybeSingle();
      return checkout ? `checkout_${await resolveCheckout(checkout.id, transId)}` : "unknown_checkout";
    }
    if (invoice.startsWith("R")) {
      // A renewal the job may not have heard back about: the next run reconciles it by invoice.
      const { data: attempt } = await admin.from("renewal_attempts").select("business_id, status").eq("invoice_number", invoice).maybeSingle();
      if (attempt && (attempt.status === "unknown" || attempt.status === "pending")) {
        const r = await runRenewals(Date.now(), [attempt.business_id]);
        return `renewal_${Object.keys(r).join("_") || "checked"}`;
      }
      return "renewal_known";
    }
    return "not_ours";
  }

  if (type.startsWith("net.authorize.customer.paymentProfile.")) {
    const customer = p.customerProfileId ? String(p.customerProfileId) : null;
    if (!customer) return "no_customer";
    const { data: plan } = await admin.from("subscriptions").select("business_id").eq("anet_customer_profile_id", customer).maybeSingle();
    if (!plan) return "unknown_customer";
    await refreshCard(plan.business_id);
    return "card_refreshed";
  }

  return "ignored";
}
