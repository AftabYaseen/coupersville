// Billing checks with Stripe in test mode.
//
//   Against the live site (Stripe delivers the webhooks itself):
//     BASE_URL=https://coupersville-7k2q.vercel.app node --env-file=.env.local scripts/test-billing.mjs
//   Against a local build (the script signs and sends the webhooks, since Stripe cannot reach it):
//     npm run build && npx next start -p 3100
//     BASE_URL=http://localhost:3100 node --env-file=.env.local scripts/test-billing.mjs
//
// Card flows use Stripe's test payment methods through the API, because Checkout's card form needs a
// person. Creates throwaway users, businesses, Stripe customers and a test clock, then removes them.

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { callAction, makeUser } from "./lib/call-action.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const local = /localhost|127\.0\.0\.1/.test(base);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const price = process.env.STRIPE_ANNUAL_PRICE_ID;
if (!url || !publishable || !secret || !stripeKey || !webhookSecret || !price) {
  console.error("Missing env vars. Run with --env-file=.env.local");
  process.exit(1);
}
if (!stripeKey.includes("_test_")) {
  console.error("Refusing to run: STRIPE_SECRET_KEY is not a test key.");
  process.exit(1);
}

const stripe = new Stripe(stripeKey);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, opts);
const anon = createClient(url, publishable, opts);
const run = Date.now().toString(36);
const password = `Test-${run}-${Math.random().toString(36).slice(2)}`;
const created = { users: [], businesses: [], customers: [], clocks: [], events: [] };
const started = Math.floor(Date.now() / 1000) - 5;

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`);
  }
}
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(what, fn, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > until) {
      console.log(`        (gave up waiting for ${what})`);
      return null;
    }
    await sleep(2000);
  }
}

const plan = (businessId) => admin.from("subscriptions").select("*").eq("business_id", businessId).maybeSingle().then((r) => r.data);
const isLive = (couponId) => anon.from("live_coupons").select("id").eq("id", couponId).maybeSingle().then((r) => Boolean(r.data));

// Sends a correctly signed event to the webhook, the way Stripe does.
async function deliver(event, signWith = webhookSecret) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: signWith });
  const res = await fetch(`${base}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
function syntheticEvent(type, object) {
  const id = `evt_test_${run}_${Math.random().toString(36).slice(2, 10)}`;
  created.events.push(id);
  return { id, object: "event", type, api_version: null, created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 0, request: null, data: { object } };
}

// Locally, Stripe cannot reach the server, so the script delivers the subscription event itself.
// On the live site, Stripe delivers the real events; the script only waits.
async function notify(sub) {
  if (local) return deliver(syntheticEvent("customer.subscription.updated", { id: sub.id, object: "subscription" }));
  return null;
}

async function user(label, role) {
  const u = await makeUser({ url, publishable, admin, email: `cpv-test-${run}-${label}@example.com`, password, role, fullName: `Test ${label}` });
  created.users.push(u.id);
  return u;
}

async function business(owner, name, planRow) {
  const b = must(await admin.from("businesses").insert({ owner_id: owner.id, name, status: "active", timezone: "America/New_York" }).select().single(), "business");
  created.businesses.push(b.id);
  if (planRow) must(await admin.from("subscriptions").insert({ business_id: b.id, ...planRow }), "plan");
  return b;
}

async function couponFor(b, categoryId) {
  return must(
    await admin
      .from("coupons")
      .insert({
        business_id: b.id,
        category_id: categoryId,
        title: `Billing test ${run}`,
        discount_type: "percent",
        discount_value: 10,
        starts_at: new Date(Date.now() - 3_600_000).toISOString(),
        expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        status: "published",
      })
      .select()
      .single(),
    "coupon",
  );
}

// A Stripe customer for the business, linked the same way the app links one.
async function customerFor(b, testClock) {
  const c = await stripe.customers.create({ name: b.name, metadata: { business_id: b.id }, ...(testClock ? { test_clock: testClock } : {}) });
  if (!testClock) created.customers.push(c.id);
  must(await admin.from("billing_customers").upsert({ business_id: b.id, stripe_customer_id: c.id }), "billing customer");
  return c;
}
async function attachCard(customerId, token) {
  const pm = await stripe.paymentMethods.attach(token, { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
  return pm;
}
async function subscribe(b, customerId) {
  try {
    return await stripe.subscriptions.create({ customer: customerId, items: [{ price }], metadata: { business_id: b.id }, payment_behavior: "allow_incomplete" });
  } catch (error) {
    return { error };
  }
}

async function main() {
  console.log(`Target: ${base} (${local ? "local: the script signs and sends webhooks" : "live: Stripe sends webhooks"})`);
  const categoryId = must(await admin.from("categories").select("id").eq("active", true).limit(1).single(), "category").id;
  const owner = await user("owner", "merchant");

  console.log("\nForged webhooks");
  const before = (await admin.from("stripe_events").select("id", { count: "exact", head: true })).count;
  const noSig = await fetch(`${base}/api/stripe/webhook`, { method: "POST", body: "{}" });
  check("no signature: 400", noSig.status === 400, noSig.status);
  const garbage = await fetch(`${base}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": "t=1,v1=deadbeef" }, body: "{}" });
  check("made-up signature: 400", garbage.status === 400, garbage.status);
  const wrongSecret = await deliver(syntheticEvent("customer.subscription.updated", { id: "sub_forged", object: "subscription" }), "whsec_not_the_real_secret");
  check("signed with the wrong secret: 400", wrongSecret.status === 400, wrongSecret);
  const after = (await admin.from("stripe_events").select("id", { count: "exact", head: true })).count;
  check("nothing was recorded", before === after);

  console.log("\nSuccessful payment (4242), replacing a complimentary plan");
  const shopA = await business(owner, `Billing A ${run}`, { source: "complimentary", status: "active" });
  const couponA = await couponFor(shopA, categoryId);
  const custA = await customerFor(shopA);
  await attachCard(custA.id, "pm_card_visa");
  const subA = await subscribe(shopA, custA.id);
  check("Stripe charged the card and started the subscription", subA.status === "active", subA.status ?? subA.error?.message);
  const n1 = await notify(subA);
  if (n1) check("webhook outcome: replaced the complimentary plan", n1.body?.outcome === "replaced_complimentary", n1);
  const planA = await waitFor("paid plan to be recorded", async () => {
    const p = await plan(shopA.id);
    return p?.source === "stripe" && p.stripe_subscription_id === subA.id && p.status === "active" ? p : null;
  });
  check("database: paid plan replaced the complimentary one", Boolean(planA), await plan(shopA.id));
  const yearOn = planA && (new Date(planA.current_period_end) - Date.now()) / 86_400_000;
  check("renews in about a year", yearOn > 360 && yearOn < 370, yearOn);
  check("coupon stays live", await isLive(couponA.id));
  if (!local) {
    const real = await stripe.events.list({ type: "customer.subscription.created", created: { gte: started }, limit: 20 });
    const ours = real.data.find((e) => e.data.object.id === subA.id);
    const recorded = ours && (await waitFor("Stripe's event id", async () => (await admin.from("stripe_events").select("id").eq("id", ours.id).maybeSingle()).data));
    check("Stripe's own event was delivered and recorded", Boolean(recorded), ours?.id);
  }

  console.log("\nDuplicate delivery");
  let original;
  if (local) {
    original = syntheticEvent("customer.subscription.updated", { id: subA.id, object: "subscription" });
    const first = await deliver(original);
    check("first delivery processed", first.status === 200 && !first.body?.duplicate, first);
  } else {
    const real = await stripe.events.list({ type: "customer.subscription.created", created: { gte: started }, limit: 20 });
    original = real.data.find((e) => e.data.object.id === subA.id);
  }
  const eventCount = (await admin.from("stripe_events").select("id", { count: "exact", head: true })).count;
  const again = await deliver(original);
  check("the same event again is ignored", again.status === 200 && again.body?.duplicate === true, again);
  check("no new event row", (await admin.from("stripe_events").select("id", { count: "exact", head: true })).count === eventCount);

  console.log("\nDeclined card (0002)");
  const shopB = await business(owner, `Billing B ${run}`, null);
  const couponB = await couponFor(shopB, categoryId);
  const custB = await customerFor(shopB);
  const declined = await attachCard(custB.id, "pm_card_chargeDeclined").then(() => null, (e) => e);
  check("Stripe declines the card, so no subscription can start", declined?.code === "card_declined", declined?.code);

  console.log("\nCard accepted but the first charge fails (0341)");
  await attachCard(custB.id, "pm_card_chargeCustomerFail");
  const subB = await subscribe(shopB, custB.id);
  check("subscription is left incomplete", subB.status === "incomplete", subB.status ?? subB.error?.code);
  if (subB.id) {
    const nB = await notify(subB);
    if (nB) check("webhook outcome: not started, ignored", nB.body?.outcome === "ignored_not_started", nB);
  }
  await sleep(local ? 0 : 8000);
  check("database: still no plan", (await plan(shopB.id)) === null, await plan(shopB.id));
  check("coupon stays hidden", !(await isLive(couponB.id)));

  console.log("\n3D Secure card (3155) without the customer present");
  const custB2 = await customerFor(shopB);
  await attachCard(custB2.id, "pm_card_authenticationRequiredOnSetup");
  const subB2 = await subscribe(shopB, custB2.id);
  check("Stripe holds it for authentication, not active", subB2.status === "incomplete" || Boolean(subB2.error), subB2.status ?? subB2.error?.code);
  if (subB2.id) {
    const nB2 = await notify(subB2);
    if (nB2) check("webhook outcome: not started, ignored", nB2.body?.outcome === "ignored_not_started", nB2);
  }
  await sleep(local ? 0 : 8000);
  check("database: still no plan until the shopper authenticates", (await plan(shopB.id)) === null);

  console.log("\nCancel at period end (what the portal's Cancel does)");
  const cancelling = await stripe.subscriptions.update(subA.id, { cancel_at_period_end: true });
  await notify(cancelling);
  const planCancelling = await waitFor("cancellation to be recorded", async () => {
    const p = await plan(shopA.id);
    return p?.cancel_at_period_end ? p : null;
  });
  check("database: active but cancelling", planCancelling?.status === "active" && planCancelling.cancel_at_period_end === true, planCancelling);
  check("coupon stays live until the period ends", await isLive(couponA.id));
  const resumed = await stripe.subscriptions.update(subA.id, { cancel_at_period_end: false });
  await notify(resumed);
  const planResumed = await waitFor("renewal to be recorded", async () => {
    const p = await plan(shopA.id);
    return p && !p.cancel_at_period_end ? p : null;
  });
  check("renewing again clears it", Boolean(planResumed));

  console.log("\nCancelled now, then a stale event arrives late");
  const staleSnapshot = { ...(await stripe.subscriptions.retrieve(subA.id)) };
  const canceled = await stripe.subscriptions.cancel(subA.id);
  await notify(canceled);
  const planCanceled = await waitFor("cancellation to be recorded", async () => {
    const p = await plan(shopA.id);
    return p?.status === "canceled" ? p : null;
  });
  check("database: canceled", Boolean(planCanceled), await plan(shopA.id));
  check("coupon is hidden", !(await isLive(couponA.id)));
  const late = await deliver(syntheticEvent("customer.subscription.updated", staleSnapshot));
  check("an older 'active' event is accepted", late.status === 200, late);
  check("but the plan stays canceled (Stripe's current state wins)", (await plan(shopA.id))?.status === "canceled", await plan(shopA.id));

  console.log("\nFailed renewal (test clock one year on, card that fails)");
  const ownerC = await user("ownerc", "merchant");
  const shopC = await business(ownerC, `Billing C ${run}`, null);
  const pageAs = async (path, who) => (await (await fetch(`${base}${path}`, { headers: { cookie: who.cookie } })).text()).replaceAll("<!-- -->", "");
  const couponC = await couponFor(shopC, categoryId);
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000), name: `coupersville ${run}` });
  created.clocks.push(clock.id);
  const custC = await customerFor(shopC, clock.id);
  await attachCard(custC.id, "pm_card_visa");
  const subC = await subscribe(shopC, custC.id);
  check("first year paid", subC.status === "active", subC.status ?? subC.error?.message);
  await notify(subC);
  check("database: active", Boolean(await waitFor("first payment", async () => (await plan(shopC.id))?.status === "active")));
  const failingCard = await attachCard(custC.id, "pm_card_chargeCustomerFail");
  await stripe.subscriptions.update(subC.id, { default_payment_method: failingCard.id });
  const periodEnd = Math.max(...subC.items.data.map((i) => i.current_period_end));
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: periodEnd + 2 * 86_400 });
  const ready = await waitFor("test clock to advance", async () => (await stripe.testHelpers.testClocks.retrieve(clock.id)).status === "ready", 120_000);
  check("test clock moved a year on", Boolean(ready));
  const subCNow = await stripe.subscriptions.retrieve(subC.id);
  check("Stripe marks the renewal past due", subCNow.status === "past_due", subCNow.status);
  await notify(subCNow);
  const planPastDue = await waitFor("past due to be recorded", async () => {
    const p = await plan(shopC.id);
    return p?.status === "past_due" && p.past_due_since ? p : null;
  }, 90_000);
  check("database: past due, with the grace period started", Boolean(planPastDue), await plan(shopC.id));
  check("coupon stays live during the 7-day grace", await isLive(couponC.id));
  const dashDue = await pageAs("/merchant", ownerC);
  check("dashboard banner: Payment failed, with Update card", dashDue.includes("Payment failed") && dashDue.includes("Update card"));
  must(await admin.from("subscriptions").update({ past_due_since: new Date(Date.now() - 8 * 86_400_000).toISOString() }).eq("business_id", shopC.id), "age grace");
  check("after 7 days the coupon is hidden", !(await isLive(couponC.id)));
  const billingEnded = await pageAs("/merchant/billing", ownerC);
  check("billing page: plan ended after the failed payment", billingEnded.includes("Plan ended") && billingEnded.includes("grace period ended"));

  if (local) {
    console.log("\nMerchant actions and pages (local build)");
    const A = (f) => `src/app/${f}`;
    // A fresh owner, so the actions act on this business and no other.
    const ownerD = await user("ownerd", "merchant");
    const shopD = await business(ownerD, `Billing D ${run}`, null);
    const go = await callAction(base, ownerD.cookie, A("merchant/billing/actions.ts"), "startCheckout", []);
    check("Start annual plan opens Stripe Checkout", /^https:\/\/checkout\.stripe\.com\//.test(go.redirect ?? ""), go);
    const firstCustomer = (await admin.from("billing_customers").select("stripe_customer_id").eq("business_id", shopD.id).single()).data?.stripe_customer_id;
    if (firstCustomer) created.customers.push(firstCustomer);
    const go2 = await callAction(base, ownerD.cookie, A("merchant/billing/actions.ts"), "startCheckout", []);
    const secondCustomer = (await admin.from("billing_customers").select("stripe_customer_id").eq("business_id", shopD.id).single()).data?.stripe_customer_id;
    check("a second checkout reuses the same Stripe customer", Boolean(go2.redirect) && firstCustomer && firstCustomer === secondCustomer);
    const session = go.redirect && (await stripe.checkout.sessions.list({ customer: firstCustomer, limit: 1 })).data[0];
    check("checkout carries the business id", session?.metadata?.business_id === shopD.id && session?.client_reference_id === shopD.id, session?.metadata);
    const portal = await callAction(base, ownerD.cookie, A("merchant/billing/actions.ts"), "openBillingPortal", []);
    check("Manage billing opens the Stripe portal", /^https:\/\/billing\.stripe\.com\//.test(portal.redirect ?? ""), portal);
    const page = async (path, who) => (await (await fetch(`${base}${path}`, { headers: { cookie: who.cookie } })).text()).replaceAll("<!-- -->", "");
    check("billing page: no plan yet, with Start annual plan", (await page("/merchant/billing", ownerD)).includes("Start annual plan"));
    check("success page waits for the webhook", (await page("/merchant/billing/success?session_id=cs_test", ownerD)).includes("Confirming your payment"));
    check("dashboard prompts to start a plan", (await page("/merchant", ownerD)).includes("No plan yet"));
  }
}

async function cleanup() {
  for (const id of created.clocks) await stripe.testHelpers.testClocks.del(id).catch(() => {});
  for (const id of created.customers) await stripe.customers.del(id).catch(() => {});
  for (const id of created.businesses) await admin.from("businesses").delete().eq("id", id);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  if (created.events.length) await admin.from("stripe_events").delete().in("id", created.events);
}

try {
  await main();
} catch (error) {
  failed += 1;
  console.error("\nStopped early:", error.message);
} finally {
  await cleanup();
  console.log(`\n${passed} passed, ${failed} failed. Test users, businesses, Stripe customers and the test clock removed.`);
  process.exit(failed ? 1 : 0);
}
