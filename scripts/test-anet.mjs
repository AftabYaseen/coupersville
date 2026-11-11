// Billing Part B checks with Authorize.net, SANDBOX ONLY, against a local build.
//
//   npm run staging:build && npm run staging:start
//   BASE_URL=http://localhost:3100 node --env-file=.env.staging.local scripts/test-anet.mjs
//
// Accept Hosted and the hosted card page need a person in a browser, so this script plays the card
// step through the sandbox API with Authorize.net's test cards (the app itself never sees a card),
// then checks the app through its real return pages, webhook, daily job and server actions.
// The daily job runs with the test-only clock (?now=) and only for this script's businesses.
// It moves the Pioneer Circle offer's window, seats and the Main Street price for a few seconds, puts them
// back, deletes its users and businesses (and so their seat claims), voids leftover authorisations
// and deletes the sandbox customer profiles it made.

// Exits unless this run targets staging, or production with ALLOW_PRODUCTION_TESTS=1 (see the guard).
import { PRODUCTION_MODE } from "./lib/staging-guard.mjs";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { callAction, makeUser } from "./lib/call-action.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const cron = process.env.CRON_SECRET;
const login = process.env.AUTHORIZE_NET_API_LOGIN_ID;
const txKey = process.env.AUTHORIZE_NET_TRANSACTION_KEY;
const sigKey = process.env.AUTHORIZE_NET_SIGNATURE_KEY;
if (!url || !publishable || !secret || !cron || !login || !txKey || !sigKey) {
  console.error("Missing env vars. Run with --env-file=.env.local");
  process.exit(1);
}
if (process.env.AUTHORIZE_NET_ENV !== "sandbox") {
  console.error("Refusing to run: AUTHORIZE_NET_ENV is not sandbox.");
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(base)) {
  console.error("Refusing to run: the test clock only works against a local build.");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, opts);
const run = Date.now().toString(36);
const password = `Test-${run}-${Math.random().toString(36).slice(2)}`;
const created = { users: [], businesses: [], profiles: [], events: [], auths: [] };
let originalSettings = null;
const originalOffers = {};
let usedBefore = null;

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`);
  }
}
function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}
const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const A = (f) => `src/app/${f}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- Sandbox API (test side only)

async function anet(name, body) {
  const res = await fetch("https://apitest.authorize.net/xml/v1/request.api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ [name]: { merchantAuthentication: { name: login, transactionKey: txKey }, ...body } }),
  });
  return JSON.parse((await res.text()).replace(/^﻿/, ""));
}
const shortId = (uuid) => uuid.replace(/-/g, "").slice(0, 20);
const card = (number) => ({ creditCard: { cardNumber: number, expirationDate: "2031-12", cardCode: "900" } });

// What the merchant does on Accept Hosted: authorise the checkout amount, saving the card.
async function payOnHostedPage(checkout, { number = "4111111111111111", zip = "98101" } = {}) {
  const r = await anet("createTransactionRequest", {
    transactionRequest: {
      transactionType: "authOnlyTransaction",
      amount: (checkout.amount_cents / 100).toFixed(2),
      payment: card(number),
      profile: { createProfile: true },
      order: { invoiceNumber: checkout.invoice_number, description: "test checkout" },
      customer: { id: shortId(checkout.business_id).slice(0, 18) + run.slice(-2) },
      billTo: { firstName: "Test", lastName: "Merchant", zip },
    },
  });
  const t = r.transactionResponse ?? {};
  if (t.transId && t.transId !== "0") created.auths.push(t.transId);
  if (r.profileResponse?.customerProfileId) created.profiles.push(r.profileResponse.customerProfileId);
  return { transId: t.transId, responseCode: t.responseCode, raw: r };
}
const txStatus = async (transId) => (await anet("getTransactionDetailsRequest", { transId })).transaction?.transactionStatus;

// Authorize.net's transaction lists lag 10 to 20 seconds behind a new transaction. The sweep and the
// unknown-result lookup run hours later in real life, so wait until the list shows it.
async function waitListed(transId, customerProfileId) {
  for (let i = 0; i < 20; i += 1) {
    const r = customerProfileId
      ? await anet("getTransactionListForCustomerRequest", { customerProfileId, paging: { limit: 100, offset: 1 } })
      : await anet("getUnsettledTransactionListRequest", { sorting: { orderBy: "submitTimeUTC", orderDescending: true }, paging: { limit: 1000, offset: 1 } });
    if ((r.transactions ?? []).some((t) => t.transId === transId)) return true;
    await sleep(5000);
  }
  return false;
}

// A saved card on a new customer profile. zip 46282 makes every charge decline.
async function savedProfile(label, { zip = "98101", number = "4111111111111111" } = {}) {
  const r = await anet("createCustomerProfileRequest", {
    profile: {
      merchantCustomerId: `t${run}${label}`.slice(0, 20),
      description: `coupersville test ${run}`,
      email: `cpv-test-${run}-${label}@example.com`,
      paymentProfiles: { billTo: { firstName: "Test", lastName: "Card", zip }, payment: card(number) },
    },
    validationMode: "none",
  });
  if (!r.customerProfileId) throw new Error(`profile: ${JSON.stringify(r.messages)}`);
  created.profiles.push(r.customerProfileId);
  return { customer: r.customerProfileId, payment: r.customerPaymentProfileIdList[0] };
}

// ---------------------------------------------------------------- App side

async function user(label, role) {
  const u = await makeUser({ url, publishable, admin, email: `cpv-test-${run}-${label}@example.com`, password, role, fullName: `Test ${label}` });
  created.users.push(u.id);
  return u;
}
async function merchant(label, plan = null) {
  const owner = await user(label, "merchant");
  const b = must(await admin.from("businesses").insert({ owner_id: owner.id, name: `Anet ${label} ${run}`, status: "active", timezone: "America/Los_Angeles" }).select().single(), "business");
  created.businesses.push(b.id);
  if (plan) must(await admin.from("subscriptions").insert({ business_id: b.id, ...plan }), "plan");
  const coupon = must(
    await admin
      .from("coupons")
      .insert({ business_id: b.id, category_id: categoryId, title: `Anet coupon ${label} ${run}`, discount_type: "percent", discount_value: 10, starts_at: iso(Date.now() - DAY), expires_at: iso(Date.now() + 60 * DAY), status: "published" })
      .select()
      .single(),
    "coupon",
  );
  return { owner, business: b, coupon };
}
const planOf = (id) => admin.from("subscriptions").select("*").eq("business_id", id).maybeSingle().then((r) => r.data);
const checkoutsOf = (id) => admin.from("checkouts").select("*").eq("business_id", id).order("created_at").then((r) => r.data ?? []);
const paymentsOf = (id) => admin.from("payments").select("*").eq("business_id", id).order("created_at").then((r) => r.data ?? []);
const attemptsOf = (id) => admin.from("renewal_attempts").select("*").eq("business_id", id).order("created_at").then((r) => r.data ?? []);
const liveCoupon = async (couponId) => Boolean((await createClient(url, publishable, opts).from("live_coupons").select("id").eq("id", couponId).maybeSingle()).data);
const page = async (path, who) => (await (await fetch(`${base}${path}`, { headers: { cookie: who.cookie } })).text()).replaceAll("<!-- -->", "");
const say = async (who, file, name, ...args) => {
  const r = await callAction(base, who.cookie, A(file), name, args);
  return r.value ?? r;
};
// The automatic renewal terms shown for a cycle, exactly as the page renders them.
const termsOn = (html, cycle) => {
  const m = html.match(new RegExp(`<p[^>]*data-renewal-terms="${cycle}"[^>]*>([\\s\\S]*?)</p>`));
  return m ? m[1].replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&") : null;
};
// What a merchant does: read the terms on Billing, tick the box, Continue to payment.
async function buy(who, cycle = "annual") {
  const terms = termsOn(await page("/merchant/billing", who), cycle);
  return say(who, "merchant/billing/actions.ts", "startPlanCheckout", cycle, terms);
}
// What the merchant's browser does on the return page: it says "confirming" and refreshes itself
// every 5 seconds until Authorize.net lists the payment (usually 10 to 20 seconds).
async function returnPage(checkoutId, who, done) {
  let html = "";
  let first = null;
  for (let i = 0; i < 18; i += 1) {
    html = await page(`/merchant/billing?checkout=${checkoutId}`, who);
    first ??= html;
    if (done.test(html) || !/We are confirming your payment/.test(html)) break;
    await sleep(5000);
  }
  return { html, first };
}
async function daily(nowMs, ids) {
  const res = await fetch(`${base}/api/cron/daily?now=${encodeURIComponent(iso(nowMs))}&only=${ids.join(",")}`, { headers: { authorization: `Bearer ${cron}` } });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function webhook(eventType, payload, { id = `test-${run}-${Math.random().toString(36).slice(2)}`, key = sigKey } = {}) {
  const raw = JSON.stringify({ notificationId: id, eventType, eventDate: new Date().toISOString(), webhookId: "test", payload });
  const sig = createHmac("sha512", key).update(raw).digest("hex").toUpperCase();
  created.events.push(id);
  const res = await fetch(`${base}/api/authorize-net/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-anet-signature": `sha512=${sig}` }, body: raw });
  return { status: res.status, body: await res.json().catch(() => null), id };
}
const renewalInvoice = (businessId, periodEnd, day) =>
  `R${createHash("sha256").update(`${businessId}|${new Date(periodEnd).toISOString()}|${day}`).digest("hex").slice(0, 19)}`;

let categoryId;

async function main() {
  originalSettings = must(await admin.from("platform_settings").select("*").eq("singleton", true).single(), "settings");
  for (const code of ["founding_merchant", "general"]) originalOffers[code] = must(await admin.from("offers").select("*").eq("code", code).single(), code);
  categoryId = must(await admin.from("categories").select("id").eq("active", true).order("sort_order").limit(1).single(), "cat").id;
  usedBefore = must(await admin.rpc("offer_seats_in_use", { p_offer_code: "founding_merchant" }), "seats");

  // Founding window open, free seats all taken (so Founding is bought), room for a few paid seats.
  const free = (await admin.from("offer_seat_claims").select("id", { count: "exact", head: true }).eq("offer_code", "founding_merchant").eq("free", true)).count;
  must(await admin.from("offers").update({ window_starts_at: iso(Date.now() - DAY), free_seats: free, seat_cap: usedBefore + 10 }).eq("code", "founding_merchant"), "open founding");
  must(await admin.from("platform_settings").update({ publishing_opens_at: iso(Date.now() - DAY), payments_open: false }).eq("singleton", true), "settings");

  const boss = await user("admin", "admin");

  console.log("\nPayments closed");
  const a = await merchant("a");
  const closedPage = await page("/merchant/billing", a.owner);
  check("merchants see no payment button while payments are closed", !/Continue to payment/.test(closedPage) && /Payments open soon/.test(closedPage));
  const closedTry = await say(a.owner, "merchant/billing/actions.ts", "startPlanCheckout", "annual", "I agree");
  check("and the checkout action refuses", closedTry?.ok === false && /not open/.test(closedTry.error), closedTry);
  const adminTry = await say(boss, "admin/merchants/billing-actions.ts", "adminTestCheckout", a.business.id, "annual");
  check("an admin can open a test checkout", adminTry?.ok === true && adminTry.url === "https://test.authorize.net/payment/payment" && adminTry.token?.length > 20, adminTry);
  const adminCheckout = (await checkoutsOf(a.business.id))[0];
  check("it holds a seat for 30 minutes", adminCheckout?.holds_seat && new Date(adminCheckout.hold_expires_at) - Date.now() > 25 * 60_000, adminCheckout);
  must(await admin.from("checkouts").update({ status: "expired" }).eq("id", adminCheckout.id), "drop admin checkout");
  must(await admin.from("platform_settings").update({ payments_open: true }).eq("singleton", true), "open payments");

  console.log("\nSuccessful payment, confirmed on return");
  const openPage = await page("/merchant/billing", a.owner);
  check("with payments open, billing offers Continue to payment for Founding at $99 a year", /Continue to payment/.test(openPage) && /\$99 a year/.test(openPage));

  console.log("\nAutomatic renewal agreement (New York GBL 527-a)");
  const termsA = termsOn(openPage, "annual");
  const renewOn = new Date(Date.now());
  renewOn.setUTCFullYear(renewOn.getUTCFullYear() + 1);
  const renewDay = renewOn.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric" });
  check(
    "next to the button: price, billing, renewal date, renewal price (Main Street) and how to cancel",
    Boolean(termsA) && /\$99 today/.test(termsA) && /billed once/.test(termsA) && termsA.includes(renewDay) && /as Main Street at \$249 a year/.test(termsA) && /Cancel renewal/.test(termsA) && /cancel anytime online/i.test(termsA),
    { termsA, renewDay },
  );
  const box = openPage.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0] ?? "";
  check("with an unticked box to agree to automatic renewal", /I agree to these automatic renewal terms/.test(openPage) && box !== "" && !/checked/.test(box), box);
  const noAgree = await say(a.owner, "merchant/billing/actions.ts", "startPlanCheckout", "annual", null);
  check("without ticking it, checkout is refused", noAgree?.ok === false && /Tick the box/.test(noAgree.error), noAgree);
  const otherTerms = await say(a.owner, "merchant/billing/actions.ts", "startPlanCheckout", "annual", termsA.replace("$249", "$199"));
  check("terms other than the ones shown are refused", otherTerms?.ok === false && /have changed/.test(otherTerms.error), otherTerms);
  check("and neither opens a checkout or records an agreement", (await checkoutsOf(a.business.id)).filter((c) => c.status === "pending").length === 0 && must(await admin.from("renewal_consents").select("id").eq("business_id", a.business.id), "c").length === 0);

  const start = await say(a.owner, "merchant/billing/actions.ts", "startPlanCheckout", "annual", termsA);
  check("checkout opens Accept Hosted in the sandbox", start?.ok === true && start.url === "https://test.authorize.net/payment/payment", start);
  const ca = (await checkoutsOf(a.business.id)).find((c) => c.status === "pending");
  const consentA = must(await admin.from("renewal_consents").select("*").eq("business_id", a.business.id), "consent");
  check(
    "the agreement is recorded: exact wording, time, who, and the checkout",
    consentA.length === 1 && consentA[0].wording === termsA && consentA[0].context === "checkout" && consentA[0].checkout_id === ca?.id && consentA[0].user_id === a.owner.id && Math.abs(new Date(consentA[0].agreed_at) - Date.now()) < 120_000,
    consentA,
  );
  check("checkout row: $99, annual, Founding, seat held", ca?.amount_cents === 9900 && ca.billing_cycle === "annual" && ca.offer_code === "founding_merchant" && ca.holds_seat, ca);
  const paidA = await payOnHostedPage(ca);
  check("the card is authorised (not charged yet)", paidA.responseCode === "1" && (await txStatus(paidA.transId)) === "authorizedPendingCapture", paidA.raw?.messages);
  const backA = await returnPage(ca.id, a.owner, /Payment received/);
  check("straight back from paying, the page says it is confirming, never that nothing was paid", !/No payment was made/.test(backA.first) && (/We are confirming your payment/.test(backA.first) || /Payment received/.test(backA.first)));
  check("the return page confirms it: Payment received", /Payment received/.test(backA.html));
  check("captured at Authorize.net", (await txStatus(paidA.transId)) === "capturedPendingSettlement");
  const planA = await planOf(a.business.id);
  const yearOn = planA && (new Date(planA.current_period_end) - Date.now()) / DAY;
  check(
    "plan: Authorize.net, active, Founding, annual, about a year, 12-month term, card saved",
    planA?.source === "authorize_net" && planA.status === "active" && planA.offer_code === "founding_merchant" && planA.billing_cycle === "annual" && yearOn > 360 && yearOn < 370 && planA.term_ends_at && planA.anet_customer_profile_id && planA.anet_payment_profile_id && planA.card_last4 === "1111",
    planA,
  );
  const seatA = must(await admin.from("offer_seat_claims").select("*").eq("business_id", a.business.id).maybeSingle(), "seat");
  check("a paid Pioneer Circle seat is claimed", seatA && seatA.free === false, seatA);
  const payA = await paymentsOf(a.business.id);
  check("one payment row: $99, paid, last 4 only", payA.length === 1 && payA[0].status === "paid" && payA[0].amount_cents === 9900 && payA[0].card_last4 === "1111", payA);
  check("the coupon is live", await liveCoupon(a.coupon.id));
  const startedA = must(await admin.from("email_notices").select("kind").eq("kind", "plan_started").eq("ref", `anet:${ca.id}`), "started");
  check("the confirmation email (with the renewal terms and how to cancel) is sent once", startedA.length === 1, startedA);

  console.log("\nEvery path again, and duplicates");
  const again = await page(`/merchant/billing?checkout=${ca.id}`, a.owner);
  check("returning again changes nothing", /Payment received/.test(again) && (await paymentsOf(a.business.id)).length === 1);
  const wh = await webhook("net.authorize.payment.authorization.created", { responseCode: 1, entityName: "transaction", id: paidA.transId, invoiceNumber: ca.invoice_number });
  check("the webhook for it finds it already captured", wh.status === 200 && wh.body?.outcome === "checkout_captured", wh);
  const dup = await webhook("net.authorize.payment.authorization.created", { id: paidA.transId }, { id: wh.id });
  check("the same notification again is ignored", dup.status === 200 && dup.body?.duplicate === true, dup);
  const forged = await webhook("net.authorize.payment.authorization.created", { id: paidA.transId }, { key: "0".repeat(128) });
  check("a forged signature is refused", forged.status === 400, forged);
  const unsigned = await fetch(`${base}/api/authorize-net/webhook`, { method: "POST", body: "{}" });
  check("no signature is refused", unsigned.status === 400);
  check("still exactly one payment", (await paymentsOf(a.business.id)).length === 1);

  console.log("\nThree paths at once: return page, webhook and daily sweep");
  const b = await merchant("b");
  await buy(b.owner);
  const cb = (await checkoutsOf(b.business.id))[0];
  const paidB = await payOnHostedPage(cb);
  const [, whB, sweepB] = await Promise.all([
    page(`/merchant/billing?checkout=${cb.id}`, b.owner),
    webhook("net.authorize.payment.authorization.created", { id: paidB.transId }),
    daily(Date.now(), [b.business.id]),
  ]);
  await sleep(1500);
  const cbAfter = (await checkoutsOf(b.business.id))[0];
  check("captured exactly once", cbAfter.status === "captured" && (await paymentsOf(b.business.id)).length === 1 && (await txStatus(paidB.transId)) === "capturedPendingSettlement", { cbAfter, whB: whB.body, sweep: sweepB.body });

  console.log("\nSweep finds a payment nobody confirmed");
  const s = await merchant("s");
  await buy(s.owner);
  const cs = (await checkoutsOf(s.business.id))[0];
  const paidS = await payOnHostedPage(cs);
  await waitListed(paidS.transId);
  const sw = await daily(Date.now(), [s.business.id]);
  check("the daily sweep confirms and captures it", sw.status === 200 && (await checkoutsOf(s.business.id))[0].status === "captured", sw.body);

  console.log("\nDeclined card");
  const d = await merchant("d");
  await buy(d.owner);
  const cd = (await checkoutsOf(d.business.id))[0];
  const paidD = await payOnHostedPage(cd, { zip: "46282" });
  check("the sandbox declines it", paidD.responseCode === "2", paidD.raw?.transactionResponse);
  const backD = (await returnPage(cd.id, d.owner, /did not go through/)).html;
  check("the return page says it did not go through", /did not go through/.test(backD));
  check("no plan, no seat, coupon hidden", (await planOf(d.business.id)) === null && !(await liveCoupon(d.coupon.id)));
  check("checkout failed, and the hold is released", (await checkoutsOf(d.business.id))[0].status === "failed");
  const histD = await page("/merchant/billing/history", d.owner);
  check("billing history shows the declined payment with last 4", /Declined/.test(histD) && /Ending in 1111/.test(histD) && !/4111111111111111/.test(histD));

  console.log("\nPaid seat race at the last seat");
  const used = must(await admin.rpc("offer_seats_in_use", { p_offer_code: "founding_merchant" }), "used");
  must(await admin.from("offers").update({ seat_cap: used + 1 }).eq("code", "founding_merchant"), "last seat");
  const e = await merchant("e");
  const f = await merchant("f");
  // Both read the terms first, then press Continue to payment at the same moment.
  const [te, tf] = [termsOn(await page("/merchant/billing", e.owner), "annual"), termsOn(await page("/merchant/billing", f.owner), "annual")];
  const [re, rf] = await Promise.all([
    say(e.owner, "merchant/billing/actions.ts", "startPlanCheckout", "annual", te),
    say(f.owner, "merchant/billing/actions.ts", "startPlanCheckout", "annual", tf),
  ]);
  check("two merchants start checkout for the last seat at once: exactly one gets it", [re?.ok, rf?.ok].filter(Boolean).length === 1, [re, rf]);
  const [winner, loser] = re?.ok ? [e, f] : [f, e];
  const loserMsg = re?.ok ? rf : re;
  check("the other is told the seats are taken", /seats on this offer have just been taken/.test(loserMsg?.error ?? ""), loserMsg);
  // The winner's hold lapses while they pay, and someone else takes the seat: the late payment is voided.
  const cw = (await checkoutsOf(winner.business.id))[0];
  must(await admin.from("checkouts").update({ hold_expires_at: iso(Date.now() - 60_000) }).eq("id", cw.id), "lapse hold");
  const late = await buy(loser.owner);
  check("after the hold lapses, the seat can be held by the other merchant", late?.ok === true, late);
  const cl = (await checkoutsOf(loser.business.id)).find((c) => c.status === "pending");
  const [payW, payL] = [await payOnHostedPage(cw), await payOnHostedPage(cl)];
  const backL = await page(`/merchant/billing?checkout=${cl.id}`, loser.owner);
  const backW = await page(`/merchant/billing?checkout=${cw.id}`, winner.owner);
  check("the holder is captured", /Payment received/.test(backL) && (await txStatus(payL.transId)) === "capturedPendingSettlement");
  check("the late payer is voided, never charged, and told", /card was not charged/.test(backW) && (await txStatus(payW.transId)) === "voided");
  check("seats never go over the cap", must(await admin.rpc("offer_seats_in_use", { p_offer_code: "founding_merchant" }), "u") <= used + 1);
  must(await admin.from("offers").update({ seat_cap: used + 10 }).eq("code", "founding_merchant"), "seats back");

  console.log("\nUpdate card");
  const upd = await say(a.owner, "merchant/billing/actions.ts", "startCardUpdate", null);
  check("Update card opens the hosted card page", upd?.ok === true && upd.url === "https://test.authorize.net/customer/manage" && upd.token?.length > 20, upd);
  const newCard = await anet("createCustomerPaymentProfileRequest", {
    customerProfileId: planA.anet_customer_profile_id,
    paymentProfile: { billTo: { firstName: "Test", lastName: "New", zip: "98101" }, payment: card("5424000000000015"), defaultPaymentProfile: true },
    validationMode: "none",
  });
  check("(the merchant adds a new default card on that page)", Boolean(newCard.customerPaymentProfileId), newCard.messages);
  const backCard = await page("/merchant/billing?card=updated", a.owner);
  check("back on billing: card saved, ending in 0015", /ending in 0015/.test(backCard) && (await planOf(a.business.id)).card_last4 === "0015");
  const whCard = await webhook("net.authorize.customer.paymentProfile.updated", { entityName: "customerPaymentProfile", id: newCard.customerPaymentProfileId, customerProfileId: planA.anet_customer_profile_id });
  check("the card webhook refreshes it too", whCard.body?.outcome === "card_refreshed", whCard);

  console.log("\nCancel and resume");
  const cancel = await say(a.owner, "merchant/billing/actions.ts", "setRenewal", false);
  check("Cancel renewal: access stays until the period ends", cancel?.ok === true && (await planOf(a.business.id)).cancel_at_period_end === true && (await liveCoupon(a.coupon.id)), cancel);
  const endA = new Date((await planOf(a.business.id)).current_period_end).getTime();
  const noRenew = await daily(endA + 3_600_000, [a.business.id]);
  check("a cancelled plan is not charged at its end", (await attemptsOf(a.business.id)).length === 0, noRenew.body);
  const resume = await say(a.owner, "merchant/billing/actions.ts", "setRenewal", true);
  check("Resume renewals", resume?.ok === true && (await planOf(a.business.id)).cancel_at_period_end === false);

  console.log("\nRenewal into Main Street at today's Main Street price, job run twice at once");
  // Put A's period end just behind us and end its Founding term, then change Main Street's price.
  const pA = iso(Date.now() - 3_600_000);
  must(await admin.from("subscriptions").update({ current_period_end: pA, term_ends_at: pA }).eq("business_id", a.business.id), "due");
  must(await admin.from("offers").update({ annual_price_cents: 25100 }).eq("code", "general"), "price change");
  const [r1, r2] = await Promise.all([daily(Date.now(), [a.business.id]), daily(Date.now(), [a.business.id])]);
  const attA = await attemptsOf(a.business.id);
  check("two runs at once make one attempt", attA.length === 1 && attA[0].status === "paid", { attA, r1: r1.body, r2: r2.body });
  check("charged the new Main Street price, $251", attA[0]?.amount_cents === 25100 && attA[0].offer_code === "general");
  const renewed = await planOf(a.business.id);
  const nextYear = (new Date(renewed.current_period_end) - new Date(pA)) / DAY;
  check("plan moves on a year from the old end date, now Main Street, ongoing", renewed.offer_code === "general" && nextYear > 364 && nextYear < 367 && renewed.term_ends_at === null && renewed.status === "active", renewed);
  const r3 = await daily(Date.now(), [a.business.id]);
  check("a third run charges nothing", (await attemptsOf(a.business.id)).length === 1 && (await paymentsOf(a.business.id)).filter((p) => p.kind === "renewal").length === 1, r3.body);
  must(await admin.from("offers").update({ annual_price_cents: originalOffers.general.annual_price_cents }).eq("code", "general"), "price back");

  console.log("\nFailed renewal: retries on days 1, 3 and 7, grace, then the plan ends");
  const bad = await savedProfile("bad", { zip: "46282" });
  const pF = Date.now() - 3_600_000;
  const g = await merchant("g", {
    source: "authorize_net", status: "active", current_period_end: iso(pF), offer_code: "general", billing_cycle: "monthly",
    anet_customer_profile_id: bad.customer, anet_payment_profile_id: bad.payment, card_last4: "1111",
  });
  const d0 = await daily(pF + 3_600_000, [g.business.id]);
  let pg = await planOf(g.business.id);
  check("day 0: declined, past due, coupons stay live", pg.status === "past_due" && pg.past_due_since && (await liveCoupon(g.coupon.id)), { pg, d0: d0.body });
  check("charged at Main Street monthly ($29)", (await attemptsOf(g.business.id))[0]?.amount_cents === 2900);
  const failedMail = must(await admin.from("email_notices").select("ref").eq("kind", "payment_failed").eq("ref", `${g.business.id}:${new Date(pF).toISOString()}`), "mail");
  check("the payment-failed email is claimed once for this period", failedMail.length === 1);
  await daily(pF + 2 * 3_600_000, [g.business.id]);
  check("running again the same day does not retry", (await attemptsOf(g.business.id)).length === 1);
  await daily(pF + DAY + 3_600_000, [g.business.id]);
  await daily(pF + 2 * DAY + 3_600_000, [g.business.id]);
  check("day 1 retried, day 2 skipped", (await attemptsOf(g.business.id)).map((x) => x.attempt_day).join() === "0,1");
  await daily(pF + 3 * DAY + 3_600_000, [g.business.id]);
  pg = await planOf(g.business.id);
  check("day 3 retried, still past due and live", (await attemptsOf(g.business.id)).length === 3 && pg.status === "past_due" && (await liveCoupon(g.coupon.id)));
  await daily(pF + 7 * DAY + 3_600_000, [g.business.id]);
  pg = await planOf(g.business.id);
  const attG = await attemptsOf(g.business.id);
  check("day 7 retried, then the plan ends and coupons are hidden", attG.map((x) => x.attempt_day).join() === "0,1,3,7" && attG.every((x) => x.status === "declined") && pg.status === "expired" && !(await liveCoupon(g.coupon.id)), { pg, attG });
  check("payment-failed email still claimed only once", must(await admin.from("email_notices").select("ref").eq("kind", "payment_failed").like("ref", `${g.business.id}:%`), "m").length === 1);
  check("four declined payments in history", (await paymentsOf(g.business.id)).filter((p) => p.status === "declined").length === 4);
  await daily(pF + 9 * DAY, [g.business.id]);
  check("an ended plan is never charged again", (await attemptsOf(g.business.id)).length === 4);

  console.log("\nUnknown result: looked up by invoice, never charged twice");
  const good = await savedProfile("good");
  const pH = Date.now() - 3_600_000;
  const h = await merchant("h", {
    source: "authorize_net", status: "active", current_period_end: iso(pH), offer_code: "general", billing_cycle: "annual",
    anet_customer_profile_id: good.customer, anet_payment_profile_id: good.payment, card_last4: "1111",
  });
  const invH = renewalInvoice(h.business.id, iso(pH), 0);
  // The charge went through, but the job never heard back.
  const charged = await anet("createTransactionRequest", {
    transactionRequest: {
      transactionType: "authCaptureTransaction",
      amount: (originalOffers.general.annual_price_cents / 100).toFixed(2),
      profile: { customerProfileId: good.customer, paymentProfile: { paymentProfileId: good.payment } },
      order: { invoiceNumber: invH, description: "lost response" },
    },
  });
  must(await admin.from("renewal_attempts").insert({ business_id: h.business.id, period_end: iso(pH), attempt_day: 0, invoice_number: invH, status: "unknown", amount_cents: originalOffers.general.annual_price_cents, offer_code: "general", billing_cycle: "annual" }), "unknown attempt");
  await waitListed(charged.transactionResponse?.transId, good.customer);
  const recon = await daily(pH + 3_600_000, [h.business.id]);
  const attH = await attemptsOf(h.business.id);
  const custTx = await anet("getTransactionListForCustomerRequest", { customerProfileId: good.customer, paging: { limit: 100, offset: 1 } });
  check("the job finds the charge by invoice and records it, without charging again", attH.length === 1 && attH[0].status === "paid" && attH[0].anet_trans_id === charged.transactionResponse?.transId && (custTx.transactions ?? []).length === 1, { attH, recon: recon.body });
  check("the plan moved on", new Date((await planOf(h.business.id)).current_period_end).getTime() > pH + 300 * DAY);

  console.log("\nRenewal held for review, then approved or declined in Authorize.net");
  // A fraud filter can hold a renewal (response code 4). The job records it as pending with its
  // transaction id and the plan in grace, sends no failure email, and settles it on a later run.
  const heldCharge = async (invoice, amountCents) =>
    (await anet("createTransactionRequest", {
      transactionRequest: {
        transactionType: "authCaptureTransaction",
        amount: (amountCents / 100).toFixed(2),
        profile: { customerProfileId: good.customer, paymentProfile: { paymentProfileId: good.payment } },
        order: { invoiceNumber: invoice, description: "held renewal" },
      },
    })).transactionResponse?.transId;
  const heldCase = async (label, approve) => {
    const pX = Date.now() - 3_600_000;
    const x = await merchant(label, {
      source: "authorize_net", status: "past_due", past_due_since: iso(pX), current_period_end: iso(pX), offer_code: "general", billing_cycle: "annual",
      anet_customer_profile_id: good.customer, anet_payment_profile_id: good.payment, card_last4: "1111",
    });
    const inv = renewalInvoice(x.business.id, iso(pX), 0);
    const amount = originalOffers.general.annual_price_cents;
    const tx = await heldCharge(inv, amount);
    if (!approve) await anet("createTransactionRequest", { transactionRequest: { transactionType: "voidTransaction", refTransId: tx } });
    must(await admin.from("renewal_attempts").insert({ business_id: x.business.id, period_end: iso(pX), attempt_day: 0, invoice_number: inv, status: "pending", anet_trans_id: tx, amount_cents: amount, offer_code: "general", billing_cycle: "annual" }), "held attempt");
    const pageX = await page("/merchant/billing", x.owner);
    const run1 = await daily(pX + 3_600_000, [x.business.id]);
    return { x, tx, pageX, run1, att: await attemptsOf(x.business.id), plan: await planOf(x.business.id) };
  };
  const ok1 = await heldCase("ha", true);
  check("while held, billing says it is being reviewed, not that it failed", /being reviewed/.test(ok1.pageX) && !/last payment failed/.test(ok1.pageX));
  check("approved: the job records it as paid and the plan moves on", ok1.att.length === 1 && ok1.att[0].status === "paid" && ok1.plan.status === "active" && new Date(ok1.plan.current_period_end).getTime() > Date.now() + 300 * DAY, { att: ok1.att, run: ok1.run1.body });
  const no1 = await heldCase("hd", false);
  const mailNo = must(await admin.from("email_notices").select("kind").eq("kind", "payment_failed").like("ref", `${no1.x.business.id}:%`), "m");
  check("declined: recorded as declined, still past due with grace, and the failure email goes out once", no1.att[0]?.status === "declined" && no1.plan.status === "past_due" && mailNo.length === 1 && (await liveCoupon(no1.x.coupon.id)), { att: no1.att, plan: no1.plan, run: no1.run1.body });

  console.log("\nReminders 60 and 30 days ahead");
  const pR = Date.now() + 45 * DAY;
  const rm = await merchant("r", {
    source: "authorize_net", status: "active", current_period_end: iso(pR), offer_code: "general", billing_cycle: "annual",
    anet_customer_profile_id: good.customer, anet_payment_profile_id: good.payment, card_last4: "1111",
  });
  await daily(Date.now(), [rm.business.id]);
  await daily(Date.now(), [rm.business.id]);
  await daily(pR - 20 * DAY, [rm.business.id]);
  const refR = `${rm.business.id}:${new Date(pR).toISOString()}`;
  const remR = must(await admin.from("email_notices").select("kind").eq("ref", refR), "rem");
  check("renewal reminders at 60 and 30 days, once each", remR.map((x) => x.kind).sort().join() === "renewal_reminder_30,renewal_reminder_60", remR);

  console.log("\nFree seat: add a card, choose monthly, continue on Main Street");
  const pJ = Date.now() + 40 * DAY;
  const j = await merchant("j", { source: "complimentary", status: "active", current_period_end: iso(pJ), term_ends_at: iso(pJ), offer_code: "founding_merchant" });
  await daily(Date.now(), [j.business.id]);
  const remJ = must(await admin.from("email_notices").select("kind").eq("ref", `${j.business.id}:${new Date(pJ).toISOString()}`), "remJ");
  check("the free seat gets the add-a-card reminder at 60 days", remJ.some((x) => x.kind === "add_card_reminder_60"), remJ);
  const freePage = await page("/merchant/billing", j.owner);
  check("billing offers Add card with annual or monthly Main Street", /Add card/.test(freePage) && /\$249 a year/.test(freePage) && /\$29 a month/.test(freePage));
  const termsJ = termsOn(freePage, "monthly");
  const endJ = new Date(pJ).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric" });
  check(
    "Add card shows the terms it continues on: end date, Main Street at $29 a month, how to cancel",
    Boolean(termsJ) && termsJ.includes(`ends on ${endJ}`) && /continues automatically as Main Street at \$29 a month/.test(termsJ) && /Cancel renewal/.test(termsJ),
    termsJ,
  );
  const noAgreeJ = await say(j.owner, "merchant/billing/actions.ts", "startCardUpdate", "monthly", null);
  check("without ticking the box, Add card is refused", noAgreeJ?.ok === false && /Tick the box/.test(noAgreeJ.error), noAgreeJ);
  const addCard = await say(j.owner, "merchant/billing/actions.ts", "startCardUpdate", "monthly", termsJ);
  const consentJ = must(await admin.from("renewal_consents").select("*").eq("business_id", j.business.id), "consentJ");
  check("the agreement is recorded with its wording and time", consentJ.length === 1 && consentJ[0].wording === termsJ && consentJ[0].context === "add_card" && consentJ[0].billing_cycle === "monthly" && consentJ[0].offer_code === "general", consentJ);
  check("Add card opens the hosted card page and remembers monthly", addCard?.ok === true && (await planOf(j.business.id)).billing_cycle === "monthly", addCard);
  const jProfile = (await planOf(j.business.id)).anet_customer_profile_id;
  created.profiles.push(jProfile);
  await anet("createCustomerPaymentProfileRequest", {
    customerProfileId: jProfile,
    paymentProfile: { billTo: { firstName: "Free", lastName: "Seat", zip: "98101" }, payment: card("4007000000027"), defaultPaymentProfile: true },
    validationMode: "none",
  });
  const backJ = await page("/merchant/billing?card=updated", j.owner);
  check("card saved, ending in 0027, and the page says it continues on Main Street", /ending in 0027/.test(backJ) && /Continues on/.test(backJ));
  await page("/merchant/billing?card=updated", j.owner);
  const termsMail = must(await admin.from("email_notices").select("ref").eq("kind", "renewal_terms").eq("ref", consentJ[0]?.id ?? "none"), "termsMail");
  check("a confirmation email repeating the terms is sent once", termsMail.length === 1, termsMail);
  must(await admin.from("subscriptions").update({ current_period_end: iso(Date.now() + 6 * 3_600_000), term_ends_at: iso(Date.now() + 6 * 3_600_000) }).eq("business_id", j.business.id), "end soon");
  await daily(Date.now(), [j.business.id]);
  const pj = await planOf(j.business.id);
  const attJ = await attemptsOf(j.business.id);
  check("it continues on Main Street monthly at $29, paid with the saved card", attJ[0]?.status === "paid" && attJ[0].amount_cents === 2900 && pj.source === "authorize_net" && pj.offer_code === "general" && pj.billing_cycle === "monthly", { pj, attJ });
  const freeNoCard = await merchant("k", { source: "complimentary", status: "active", current_period_end: iso(Date.now() - 3_600_000), term_ends_at: iso(Date.now() - 3_600_000), offer_code: "founding_merchant" });
  await daily(Date.now(), [freeNoCard.business.id]);
  check("a free seat without a card is never charged and simply ends", (await attemptsOf(freeNoCard.business.id)).length === 0 && !(await liveCoupon(freeNoCard.coupon.id)));

  console.log("\nTest clock is locked down");
  const noOnly = await fetch(`${base}/api/cron/daily?now=${encodeURIComponent(iso(Date.now()))}`, { headers: { authorization: `Bearer ${cron}` } });
  check("the test clock refuses to run without ?only=", noOnly.status === 400);
}

// ---------------------------------------------------------------- Production mode
//
// Decided 2026-11-04 for billing Part B: run against the production database with the sandbox,
// changing no platform setting, publishing date, offer or category, and claiming no Pioneer Circle seat.
// Payments stay closed, and Founding is not buyable while its free seats remain, so each checkout
// here is created directly for the Main Street offer, which has no seat cap and holds no seat. Everything
// after that (Accept Hosted payment, return page, webhook, sweep, capture, void, renewals) runs
// through the real app. The seat race and the paid Pioneer Circle seat are tested in a rolled-back SQL
// transaction instead. A Main Street price change at renewal is not tested here (it needs an offer edit).

async function directCheckout(m, cycle = "annual", consentWording = null) {
  const general = offersNow.general;
  const amount = cycle === "monthly" ? general.monthly_price_cents : general.annual_price_cents;
  const checkout = must(
    await admin
      .from("checkouts")
      .insert({
        business_id: m.business.id,
        offer_code: "general",
        billing_cycle: cycle,
        amount_cents: amount,
        invoice_number: `C${randomBytes(9).toString("hex").slice(0, 17)}`,
        holds_seat: false,
        hold_expires_at: iso(Date.now() + 30 * 60_000),
        created_by: m.owner.id,
      })
      .select()
      .single(),
    "checkout",
  );
  if (consentWording) {
    must(
      await admin.from("renewal_consents").insert({ business_id: m.business.id, user_id: m.owner.id, context: "checkout", checkout_id: checkout.id, offer_code: "general", billing_cycle: cycle, wording: consentWording }),
      "consent",
    );
  }
  return checkout;
}

const offersNow = {};

async function mainProduction() {
  for (const code of ["founding_merchant", "general"]) offersNow[code] = must(await admin.from("offers").select("*").eq("code", code).single(), code);
  categoryId = must(await admin.from("categories").select("id").eq("active", true).order("sort_order").limit(1).single(), "cat").id;
  usedBefore = must(await admin.rpc("offer_seats_in_use", { p_offer_code: "founding_merchant" }), "seats");
  const settings = must(await admin.from("platform_settings").select("payments_open, publishing_opens_at").eq("singleton", true).single(), "settings");
  if (settings.payments_open) throw new Error("payments are open in production; this run assumes they are closed");
  if (new Date(settings.publishing_opens_at).getTime() > Date.now()) throw new Error("publishing is not open yet in production");
  const generalAnnual = offersNow.general.annual_price_cents;
  const generalMonthly = offersNow.general.monthly_price_cents;
  console.log(`\nRun ${run}: test businesses are named "Anet <label> ${run}"; payments closed; Main Street $${generalAnnual / 100} a year or $${generalMonthly / 100} a month.`);

  const boss = await user("admin", "admin");

  console.log("\nPayments closed (the live setting, not changed)");
  const a = await merchant("a");
  const closedPage = await page("/merchant/billing", a.owner);
  check("merchants see no payment button while payments are closed", !/Continue to payment|Add card|Opening secure payment/.test(closedPage) && !/data-renewal-terms/.test(closedPage));
  const noAgree = await say(a.owner, "merchant/billing/actions.ts", "startPlanCheckout", "annual", null);
  check("checkout without agreeing to the renewal terms is refused", noAgree?.ok === false && /Tick the box/.test(noAgree.error), noAgree);
  const closedTry = await say(a.owner, "merchant/billing/actions.ts", "startPlanCheckout", "annual", "I agree");
  check("and with payments closed the checkout action refuses", closedTry?.ok === false && /not open/.test(closedTry.error), closedTry);
  const adminTry = await say(boss, "admin/merchants/billing-actions.ts", "adminTestCheckout", a.business.id, "annual");
  check("admin test checkout: nothing to buy while free Pioneer Circle seats remain", adminTry?.ok === false && /free seats remain/.test(adminTry.error), adminTry);
  check("none of that opened a checkout or recorded an agreement", (await checkoutsOf(a.business.id)).length === 0 && must(await admin.from("renewal_consents").select("id").eq("business_id", a.business.id), "c").length === 0);

  console.log("\nSuccessful payment, confirmed on return");
  const termsText = `You pay $${generalAnnual / 100} today for one year of Main Street, billed yearly. Your plan renews automatically every year until you cancel. (test ${run})`;
  const ca = await directCheckout(a, "annual", termsText);
  const paidA = await payOnHostedPage(ca);
  check("the card is authorised (not charged yet)", paidA.responseCode === "1" && (await txStatus(paidA.transId)) === "authorizedPendingCapture", paidA.raw?.transactionResponse ?? paidA.raw?.messages);
  const backA = await returnPage(ca.id, a.owner, /Payment received/);
  check("straight back from paying, the page says it is confirming, never that nothing was paid", !/No payment was made/.test(backA.first) && (/We are confirming your payment/.test(backA.first) || /Payment received/.test(backA.first)));
  check("the return page confirms it: Payment received", /Payment received/.test(backA.html));
  check("captured at Authorize.net", (await txStatus(paidA.transId)) === "capturedPendingSettlement");
  const planA = await planOf(a.business.id);
  const yearOn = planA && (new Date(planA.current_period_end) - Date.now()) / DAY;
  check(
    "plan: Authorize.net, active, Main Street, annual, about a year, ongoing, card saved",
    planA?.source === "authorize_net" && planA.status === "active" && planA.offer_code === "general" && planA.billing_cycle === "annual" && yearOn > 360 && yearOn < 370 && planA.term_ends_at === null && planA.anet_customer_profile_id && planA.anet_payment_profile_id && planA.card_last4 === "1111",
    planA,
  );
  check("no Pioneer Circle seat is claimed", must(await admin.from("offer_seat_claims").select("id").eq("business_id", a.business.id), "seat").length === 0);
  const payA = await paymentsOf(a.business.id);
  check(`one payment row: $${generalAnnual / 100}, paid, last 4 only`, payA.length === 1 && payA[0].status === "paid" && payA[0].amount_cents === generalAnnual && payA[0].card_last4 === "1111", payA);
  check("the coupon is live", await liveCoupon(a.coupon.id));
  const startedA = must(await admin.from("email_notices").select("kind").eq("kind", "plan_started").eq("ref", `anet:${ca.id}`), "started");
  check("the confirmation email (with the agreed renewal terms) is sent once", startedA.length === 1, startedA);

  console.log("\nEvery path again, and duplicates");
  const again = await page(`/merchant/billing?checkout=${ca.id}`, a.owner);
  check("returning again changes nothing", /Payment received/.test(again) && (await paymentsOf(a.business.id)).length === 1);
  const wh = await webhook("net.authorize.payment.authorization.created", { responseCode: 1, entityName: "transaction", id: paidA.transId, invoiceNumber: ca.invoice_number });
  check("the webhook for it finds it already captured", wh.status === 200 && wh.body?.outcome === "checkout_captured", wh);
  const dup = await webhook("net.authorize.payment.authorization.created", { id: paidA.transId }, { id: wh.id });
  check("the same notification again is ignored", dup.status === 200 && dup.body?.duplicate === true, dup);
  const forged = await webhook("net.authorize.payment.authorization.created", { id: paidA.transId }, { key: "0".repeat(128) });
  check("a forged signature is refused", forged.status === 400, forged);
  const unsigned = await fetch(`${base}/api/authorize-net/webhook`, { method: "POST", body: "{}" });
  check("no signature is refused", unsigned.status === 400);
  check("still exactly one payment", (await paymentsOf(a.business.id)).length === 1);

  console.log("\nThree paths at once: return page, webhook and daily sweep");
  const b = await merchant("b");
  const cb = await directCheckout(b);
  const paidB = await payOnHostedPage(cb);
  const [, whB, sweepB] = await Promise.all([
    page(`/merchant/billing?checkout=${cb.id}`, b.owner),
    webhook("net.authorize.payment.authorization.created", { id: paidB.transId }),
    daily(Date.now(), [b.business.id]),
  ]);
  await sleep(1500);
  const cbAfter = (await checkoutsOf(b.business.id))[0];
  check("captured exactly once", cbAfter.status === "captured" && (await paymentsOf(b.business.id)).length === 1 && (await txStatus(paidB.transId)) === "capturedPendingSettlement", { cbAfter, whB: whB.body, sweep: sweepB.body });

  console.log("\nSweep finds a payment nobody confirmed");
  const s = await merchant("s");
  const cs = await directCheckout(s);
  const paidS = await payOnHostedPage(cs);
  await waitListed(paidS.transId);
  const sw = await daily(Date.now(), [s.business.id]);
  check("the daily sweep confirms and captures it", sw.status === 200 && (await checkoutsOf(s.business.id))[0].status === "captured", sw.body);

  console.log("\nDeclined card");
  const d = await merchant("d");
  const cd = await directCheckout(d);
  const paidD = await payOnHostedPage(cd, { zip: "46282" });
  check("the sandbox declines it", paidD.responseCode === "2", paidD.raw?.transactionResponse);
  const backD = (await returnPage(cd.id, d.owner, /did not go through/)).html;
  check("the return page says it did not go through", /did not go through/.test(backD));
  check("no plan, coupon hidden", (await planOf(d.business.id)) === null && !(await liveCoupon(d.coupon.id)));
  check("the checkout is marked failed", (await checkoutsOf(d.business.id))[0].status === "failed");
  const histD = await page("/merchant/billing/history", d.owner);
  check("billing history shows the declined payment with last 4", /Declined/.test(histD) && /Ending in 1111/.test(histD) && !/4111111111111111/.test(histD));

  console.log("\nPaid seat race at the last seat");
  console.log("  skip  covered by the rolled-back SQL test (it needs the Pioneer Circle seats filled)");

  console.log("\nUpdate card");
  const upd = await say(a.owner, "merchant/billing/actions.ts", "startCardUpdate", null);
  check("Update card opens the hosted card page", upd?.ok === true && upd.url === "https://test.authorize.net/customer/manage" && upd.token?.length > 20, upd);
  const newCard = await anet("createCustomerPaymentProfileRequest", {
    customerProfileId: planA.anet_customer_profile_id,
    paymentProfile: { billTo: { firstName: "Test", lastName: "New", zip: "98101" }, payment: card("5424000000000015"), defaultPaymentProfile: true },
    validationMode: "none",
  });
  check("(the merchant adds a new default card on that page)", Boolean(newCard.customerPaymentProfileId), newCard.messages);
  const backCard = await page("/merchant/billing?card=updated", a.owner);
  check("back on billing: card saved, ending in 0015", /ending in 0015/.test(backCard) && (await planOf(a.business.id)).card_last4 === "0015");
  const whCard = await webhook("net.authorize.customer.paymentProfile.updated", { entityName: "customerPaymentProfile", id: newCard.customerPaymentProfileId, customerProfileId: planA.anet_customer_profile_id });
  check("the card webhook refreshes it too", whCard.body?.outcome === "card_refreshed", whCard);

  console.log("\nCancel and resume");
  const cancel = await say(a.owner, "merchant/billing/actions.ts", "setRenewal", false);
  check("Cancel renewal: access stays until the period ends", cancel?.ok === true && (await planOf(a.business.id)).cancel_at_period_end === true && (await liveCoupon(a.coupon.id)), cancel);
  const endA = new Date((await planOf(a.business.id)).current_period_end).getTime();
  const noRenew = await daily(endA + 3_600_000, [a.business.id]);
  check("a cancelled plan is not charged at its end", (await attemptsOf(a.business.id)).length === 0, noRenew.body);
  const resume = await say(a.owner, "merchant/billing/actions.ts", "setRenewal", true);
  check("Resume renewals", resume?.ok === true && (await planOf(a.business.id)).cancel_at_period_end === false);

  console.log("\nRenewal into Main Street when a 12-month term ends, job run twice at once");
  // A's plan becomes an Early Bird year that has just ended, so it renews into Main Street.
  const pA = iso(Date.now() - 3_600_000);
  must(await admin.from("subscriptions").update({ offer_code: "early_access", current_period_end: pA, term_ends_at: pA }).eq("business_id", a.business.id), "due");
  const [r1, r2] = await Promise.all([daily(Date.now(), [a.business.id]), daily(Date.now(), [a.business.id])]);
  const attA = await attemptsOf(a.business.id);
  check("two runs at once make one attempt", attA.length === 1 && attA[0].status === "paid", { attA, r1: r1.body, r2: r2.body });
  check(`charged today's Main Street price from the offers table, $${generalAnnual / 100}`, attA[0]?.amount_cents === generalAnnual && attA[0].offer_code === "general");
  const renewed = await planOf(a.business.id);
  const nextYear = (new Date(renewed.current_period_end) - new Date(pA)) / DAY;
  check("plan moves on a year from the old end date, now Main Street, ongoing", renewed.offer_code === "general" && nextYear > 364 && nextYear < 367 && renewed.term_ends_at === null && renewed.status === "active", renewed);
  const r3 = await daily(Date.now(), [a.business.id]);
  check("a third run charges nothing", (await attemptsOf(a.business.id)).length === 1 && (await paymentsOf(a.business.id)).filter((p) => p.kind === "renewal").length === 1, r3.body);
  console.log("  skip  a Main Street price change applying to the next renewal (it needs an offer edit)");

  console.log("\nFailed renewal: retries on days 1, 3 and 7, grace, then the plan ends");
  const bad = await savedProfile("bad", { zip: "46282" });
  const pF = Date.now() - 3_600_000;
  const g = await merchant("g", {
    source: "authorize_net", status: "active", current_period_end: iso(pF), offer_code: "general", billing_cycle: "monthly",
    anet_customer_profile_id: bad.customer, anet_payment_profile_id: bad.payment, card_last4: "1111",
  });
  const d0 = await daily(pF + 3_600_000, [g.business.id]);
  let pg = await planOf(g.business.id);
  check("day 0: declined, past due, coupons stay live", pg.status === "past_due" && pg.past_due_since && (await liveCoupon(g.coupon.id)), { pg, d0: d0.body });
  check(`charged at Main Street monthly ($${generalMonthly / 100})`, (await attemptsOf(g.business.id))[0]?.amount_cents === generalMonthly);
  const failedMail = must(await admin.from("email_notices").select("ref").eq("kind", "payment_failed").eq("ref", `${g.business.id}:${new Date(pF).toISOString()}`), "mail");
  check("the payment-failed email is claimed once for this period", failedMail.length === 1);
  await daily(pF + 2 * 3_600_000, [g.business.id]);
  check("running again the same day does not retry", (await attemptsOf(g.business.id)).length === 1);
  await daily(pF + DAY + 3_600_000, [g.business.id]);
  await daily(pF + 2 * DAY + 3_600_000, [g.business.id]);
  check("day 1 retried, day 2 skipped", (await attemptsOf(g.business.id)).map((x) => x.attempt_day).join() === "0,1");
  await daily(pF + 3 * DAY + 3_600_000, [g.business.id]);
  pg = await planOf(g.business.id);
  check("day 3 retried, still past due and live", (await attemptsOf(g.business.id)).length === 3 && pg.status === "past_due" && (await liveCoupon(g.coupon.id)));
  await daily(pF + 7 * DAY + 3_600_000, [g.business.id]);
  pg = await planOf(g.business.id);
  const attG = await attemptsOf(g.business.id);
  check("day 7 retried, then the plan ends and coupons are hidden", attG.map((x) => x.attempt_day).join() === "0,1,3,7" && attG.every((x) => x.status === "declined") && pg.status === "expired" && !(await liveCoupon(g.coupon.id)), { pg, attG });
  check("payment-failed email still claimed only once", must(await admin.from("email_notices").select("ref").eq("kind", "payment_failed").like("ref", `${g.business.id}:%`), "m").length === 1);
  check("four declined payments in history", (await paymentsOf(g.business.id)).filter((p) => p.status === "declined").length === 4);
  await daily(pF + 9 * DAY, [g.business.id]);
  check("an ended plan is never charged again", (await attemptsOf(g.business.id)).length === 4);

  console.log("\nUnknown result: looked up by invoice, never charged twice");
  const good = await savedProfile("good");
  const pH = Date.now() - 3_600_000;
  const h = await merchant("h", {
    source: "authorize_net", status: "active", current_period_end: iso(pH), offer_code: "general", billing_cycle: "annual",
    anet_customer_profile_id: good.customer, anet_payment_profile_id: good.payment, card_last4: "1111",
  });
  const invH = renewalInvoice(h.business.id, iso(pH), 0);
  const charged = await anet("createTransactionRequest", {
    transactionRequest: {
      transactionType: "authCaptureTransaction",
      amount: (generalAnnual / 100).toFixed(2),
      profile: { customerProfileId: good.customer, paymentProfile: { paymentProfileId: good.payment } },
      order: { invoiceNumber: invH, description: "lost response" },
    },
  });
  must(await admin.from("renewal_attempts").insert({ business_id: h.business.id, period_end: iso(pH), attempt_day: 0, invoice_number: invH, status: "unknown", amount_cents: generalAnnual, offer_code: "general", billing_cycle: "annual" }), "unknown attempt");
  await waitListed(charged.transactionResponse?.transId, good.customer);
  const recon = await daily(pH + 3_600_000, [h.business.id]);
  const attH = await attemptsOf(h.business.id);
  const custTx = await anet("getTransactionListForCustomerRequest", { customerProfileId: good.customer, paging: { limit: 100, offset: 1 } });
  check("the job finds the charge by invoice and records it, without charging again", attH.length === 1 && attH[0].status === "paid" && attH[0].anet_trans_id === charged.transactionResponse?.transId && (custTx.transactions ?? []).length === 1, { attH, recon: recon.body });
  check("the plan moved on", new Date((await planOf(h.business.id)).current_period_end).getTime() > pH + 300 * DAY);

  console.log("\nRenewal held for review, then approved or declined in Authorize.net");
  const heldCase = async (label, approve) => {
    const pX = Date.now() - 3_600_000;
    const x = await merchant(label, {
      source: "authorize_net", status: "past_due", past_due_since: iso(pX), current_period_end: iso(pX), offer_code: "general", billing_cycle: "annual",
      anet_customer_profile_id: good.customer, anet_payment_profile_id: good.payment, card_last4: "1111",
    });
    const inv = renewalInvoice(x.business.id, iso(pX), 0);
    const tx = (await anet("createTransactionRequest", {
      transactionRequest: {
        transactionType: "authCaptureTransaction",
        amount: (generalAnnual / 100).toFixed(2),
        profile: { customerProfileId: good.customer, paymentProfile: { paymentProfileId: good.payment } },
        order: { invoiceNumber: inv, description: "held renewal" },
      },
    })).transactionResponse?.transId;
    if (!approve) await anet("createTransactionRequest", { transactionRequest: { transactionType: "voidTransaction", refTransId: tx } });
    must(await admin.from("renewal_attempts").insert({ business_id: x.business.id, period_end: iso(pX), attempt_day: 0, invoice_number: inv, status: "pending", anet_trans_id: tx, amount_cents: generalAnnual, offer_code: "general", billing_cycle: "annual" }), "held attempt");
    const pageX = await page("/merchant/billing", x.owner);
    const run1 = await daily(pX + 3_600_000, [x.business.id]);
    return { x, pageX, run1, att: await attemptsOf(x.business.id), plan: await planOf(x.business.id) };
  };
  const ok1 = await heldCase("ha", true);
  check("while held, billing says it is being reviewed, not that it failed", /being reviewed/.test(ok1.pageX) && !/last payment failed/.test(ok1.pageX));
  check("approved: the job records it as paid and the plan moves on", ok1.att.length === 1 && ok1.att[0].status === "paid" && ok1.plan.status === "active" && new Date(ok1.plan.current_period_end).getTime() > Date.now() + 300 * DAY, { att: ok1.att, run: ok1.run1.body });
  const no1 = await heldCase("hd", false);
  const mailNo = must(await admin.from("email_notices").select("kind").eq("kind", "payment_failed").like("ref", `${no1.x.business.id}:%`), "m");
  check("declined: recorded as declined, still past due with grace, and the failure email goes out once", no1.att[0]?.status === "declined" && no1.plan.status === "past_due" && mailNo.length === 1 && (await liveCoupon(no1.x.coupon.id)), { att: no1.att, plan: no1.plan, run: no1.run1.body });

  console.log("\nReminders 60 and 30 days ahead");
  const pR = Date.now() + 45 * DAY;
  const rm = await merchant("r", {
    source: "authorize_net", status: "active", current_period_end: iso(pR), offer_code: "general", billing_cycle: "annual",
    anet_customer_profile_id: good.customer, anet_payment_profile_id: good.payment, card_last4: "1111",
  });
  await daily(Date.now(), [rm.business.id]);
  await daily(Date.now(), [rm.business.id]);
  await daily(pR - 20 * DAY, [rm.business.id]);
  const remR = must(await admin.from("email_notices").select("kind").eq("ref", `${rm.business.id}:${new Date(pR).toISOString()}`), "rem");
  check("renewal reminders at 60 and 30 days, once each", remR.map((x) => x.kind).sort().join() === "renewal_reminder_30,renewal_reminder_60", remR);

  console.log("\nFree-seat plan: add-card reminder, card saved, continues on Main Street");
  // A complimentary Founding plan row with a 12-month term, as a free seat has. No seat claim is made.
  const pJ = Date.now() + 40 * DAY;
  const j = await merchant("j", { source: "complimentary", status: "active", current_period_end: iso(pJ), term_ends_at: iso(pJ), offer_code: "founding_merchant" });
  await daily(Date.now(), [j.business.id]);
  const remJ = must(await admin.from("email_notices").select("kind").eq("ref", `${j.business.id}:${new Date(pJ).toISOString()}`), "remJ");
  check("the free seat gets the add-a-card reminder at 60 days", remJ.some((x) => x.kind === "add_card_reminder_60"), remJ);
  const freePage = await page("/merchant/billing", j.owner);
  check("with payments closed, billing does not offer Add card", !/Add card/.test(freePage) && !/data-renewal-terms/.test(freePage));
  const addClosed = await say(j.owner, "merchant/billing/actions.ts", "startCardUpdate", "monthly", "I agree");
  check("and the Add card action refuses", addClosed?.ok === false && /not open/.test(addClosed.error), addClosed);
  // As if the card had been added on the hosted page, after agreeing to continue on Main Street monthly.
  const jCard = await savedProfile("j", { number: "4007000000027" });
  must(await admin.from("subscriptions").update({ anet_customer_profile_id: jCard.customer, billing_cycle: "monthly" }).eq("business_id", j.business.id), "card");
  const consentJ = must(
    await admin
      .from("renewal_consents")
      .insert({ business_id: j.business.id, user_id: j.owner.id, context: "add_card", offer_code: "general", billing_cycle: "monthly", wording: `Your free Pioneer Circle year ends soon. Your plan then continues automatically as Main Street at $${generalMonthly / 100} a month. (test ${run})` })
      .select()
      .single(),
    "consent j",
  );
  const backJ = await page("/merchant/billing?card=updated", j.owner);
  check("back on billing: card saved, ending in 0027", /ending in 0027/.test(backJ) && (await planOf(j.business.id)).card_last4 === "0027");
  await page("/merchant/billing?card=updated", j.owner);
  const termsMail = must(await admin.from("email_notices").select("ref").eq("kind", "renewal_terms").eq("ref", consentJ.id), "termsMail");
  check("a confirmation email repeating the agreed terms is sent once", termsMail.length === 1, termsMail);
  must(await admin.from("subscriptions").update({ current_period_end: iso(Date.now() + 6 * 3_600_000), term_ends_at: iso(Date.now() + 6 * 3_600_000) }).eq("business_id", j.business.id), "end soon");
  await daily(Date.now(), [j.business.id]);
  const pj = await planOf(j.business.id);
  const attJ = await attemptsOf(j.business.id);
  check(`it continues on Main Street monthly at $${generalMonthly / 100}, paid with the saved card`, attJ[0]?.status === "paid" && attJ[0].amount_cents === generalMonthly && pj.source === "authorize_net" && pj.offer_code === "general" && pj.billing_cycle === "monthly", { pj, attJ });
  const freeNoCard = await merchant("k", { source: "complimentary", status: "active", current_period_end: iso(Date.now() - 3_600_000), term_ends_at: iso(Date.now() - 3_600_000), offer_code: "founding_merchant" });
  await daily(Date.now(), [freeNoCard.business.id]);
  check("a free seat without a card is never charged and simply ends", (await attemptsOf(freeNoCard.business.id)).length === 0 && !(await liveCoupon(freeNoCard.coupon.id)));

  console.log("\nTest clock is locked down");
  const noOnly = await fetch(`${base}/api/cron/daily?now=${encodeURIComponent(iso(Date.now()))}`, { headers: { authorization: `Bearer ${cron}` } });
  check("the test clock refuses to run without ?only=", noOnly.status === 400);

  console.log("\nNo email to real people");
  const realAdmins = must(await admin.from("profiles").select("id").eq("role", "admin"), "admins").filter((p) => !created.users.includes(p.id));
  const alerts = must(await admin.from("email_notices").select("ref, sent_at").eq("kind", "admin_billing_alert").gte("sent_at", runStartedAt), "alerts");
  check("no billing alert went to a real admin during this run", !alerts.some((n) => realAdmins.some((a) => n.ref.endsWith(`:${a.id}`))), { alerts: alerts.length });
}

const runStartedAt = new Date().toISOString();

async function cleanup() {
  // Void anything still only authorised, so nothing is left hanging in the sandbox.
  for (const transId of created.auths) {
    if ((await txStatus(transId).catch(() => null)) === "authorizedPendingCapture") {
      await anet("createTransactionRequest", { transactionRequest: { transactionType: "voidTransaction", refTransId: transId } }).catch(() => null);
    }
  }
  // Email records name a business, a plan, a checkout, a renewal attempt or an agreement: collect
  // this run's ids before the businesses (and so those rows) are deleted.
  const refIds = [...created.businesses];
  if (created.businesses.length) {
    for (const table of ["subscriptions", "checkouts", "renewal_attempts", "renewal_consents"]) {
      const { data } = await admin.from(table).select("id").in("business_id", created.businesses);
      refIds.push(...(data ?? []).map((r) => r.id));
    }
  }
  for (const id of created.businesses) await admin.from("businesses").delete().eq("id", id);
  // Production mode changes no setting or offer, so it restores nothing (writing them back would be a change).
  if (originalSettings && !PRODUCTION_MODE) {
    const { publishing_opens_at, payments_open } = originalSettings;
    await admin.from("platform_settings").update({ publishing_opens_at, payments_open }).eq("singleton", true);
  }
  for (const [code, o] of PRODUCTION_MODE ? [] : Object.entries(originalOffers)) {
    const { window_starts_at, free_seats, seat_cap, annual_price_cents, monthly_price_cents } = o;
    const { error } = await admin.from("offers").update({ window_starts_at, free_seats, seat_cap, annual_price_cents, monthly_price_cents }).eq("code", code);
    if (error) console.log(`  could not restore ${code}: ${error.message}`);
  }
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  if (created.events.length) await admin.from("anet_events").delete().in("id", created.events);
  for (const id of refIds) await admin.from("email_notices").delete().like("ref", `%${id}%`);
  for (const id of new Set(created.profiles.filter(Boolean))) await anet("deleteCustomerProfileRequest", { customerProfileId: id }).catch(() => null);
}

try {
  await (PRODUCTION_MODE ? mainProduction() : main());
} catch (error) {
  failed += 1;
  console.error("\nStopped early:", error.message);
} finally {
  await cleanup();
  if (PRODUCTION_MODE) {
    const seats = await admin.rpc("offer_seats_in_use", { p_offer_code: "founding_merchant" });
    const left = await admin.from("businesses").select("id").like("name", `% ${run}`);
    const users = (await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })).data?.users.filter((u) => u.email?.includes(`-${run}-`)) ?? [];
    check("clean-up: no test business or user from this run is left, and seats in use are unchanged", (left.data ?? []).length === 0 && users.length === 0 && seats.data === usedBefore, { businesses: left.data, users: users.length, seats: seats.data, usedBefore });
    console.log(`\n${passed} passed, ${failed} failed. Test users, businesses, checkouts, payments, agreements, plans and sandbox profiles removed.`);
    process.exit(failed ? 1 : 0);
  }
  const f = await admin.from("offers").select("*").eq("code", "founding_merchant").single();
  const o = originalOffers.founding_merchant;
  const seats = await admin.rpc("offer_seats_in_use", { p_offer_code: "founding_merchant" });
  check(
    "Pioneer Circle offer, Main Street price, settings and seat counts are back as they were",
    o && f.data.free_seats === o.free_seats && f.data.seat_cap === o.seat_cap && f.data.window_starts_at === o.window_starts_at && seats.data === usedBefore,
    { offer: f.data, seats: seats.data },
  );
  console.log(`\n${passed} passed, ${failed} failed. Test users, businesses, seat claims and sandbox profiles removed.`);
  process.exit(failed ? 1 : 0);
}
