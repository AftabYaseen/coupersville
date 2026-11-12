// Campaign and location limits, Build Your Route and per-business overrides (2026-11-09), through the real
// server actions and database functions, against a local build.
//
//   node --env-file=.env.local scripts/production-snapshot.mjs save before.json
//   ALLOW_PRODUCTION_TESTS=1 BASE_URL=http://localhost:3100 node --env-file=.env.local scripts/test-limits.mjs
//   node --env-file=.env.local scripts/production-snapshot.mjs save after.json
//   node --env-file=.env.local scripts/production-snapshot.mjs compare before.json after.json
//
// Never changes platform settings, offers or categories, never claims a Pioneer Circle seat, sends mail
// only to reserved test addresses (which are skipped), and deletes everything it creates.

// Exits unless this run targets staging, or production with ALLOW_PRODUCTION_TESTS=1 (see the guard).
import "./lib/staging-guard.mjs";
import { createClient } from "@supabase/supabase-js";
import { callAction, makeUser } from "./lib/call-action.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Date.now().toString(36);
const password = `Test-${run}-${Math.random().toString(36).slice(2)}`;
const created = { users: [], businesses: [] };

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
function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

const A = (file) => `src/app/${file}`;
const iso = (days) => new Date(Date.now() + days * 86_400_000).toISOString();
const day = (days) => iso(days).slice(0, 10);
let categoryId;

async function user(label, role) {
  const u = await makeUser({ url, publishable, admin, email: `cpv-test-${run}-${label}@example.com`, password, role, fullName: `Test ${label}` });
  created.users.push(u.id);
  return u;
}

const storeRow = (label) => ({ store_name: `Store ${label}`, address_line1: "1 Main St", city: "Town", state: "CA", postal_code: "90001" });

// An owner with an active business, one store and a plan on the given offer (null: no offer).
async function merchant(label, offerCode = "general") {
  const owner = await user(label, "merchant");
  const b = must(await admin.from("businesses").insert({ owner_id: owner.id, name: `Limits ${label} ${run}`, status: "active", timezone: "America/Los_Angeles" }).select().single(), "business");
  created.businesses.push(b.id);
  must(await admin.from("locations").insert({ business_id: b.id, ...storeRow(`${label} one`) }), "store");
  must(await admin.from("subscriptions").insert({ business_id: b.id, source: "complimentary", status: "active", current_period_end: iso(300), offer_code: offerCode }), "plan");
  return { owner, business: b };
}

const couponInput = (title) => ({
  title, description: "", categoryId, discountType: "percent", discountValue: 20, includedProducts: "", limitsText: "", minSpend: "", minQty: "", maxPeople: "",
  startsOn: day(0), expiresOn: day(14), imagePath: null, allLocations: true, locationIds: [], totalLimit: "", perUserMode: "once", perUserLimit: "", redeemFrequency: "none",
  scheduleOn: false, scheduleDays: [1, 2, 3, 4, 5, 6, 7], scheduleStart: "", scheduleEnd: "", visibility: "public",
});
const locationInput = (name) => ({ storeName: name, storeNumber: "", addressLine1: "1 Main St", addressLine2: "", city: "Town", state: "CA", postalCode: "90001", phone: "", lat: "", lng: "" });

const act = (who, file, name, args) => callAction(base, who.cookie, A(file), name, args);
const save = (who, id, title, intent) => act(who, "merchant/coupons/actions.ts", "saveCoupon", [id, couponInput(title), intent]);
const usageOf = async (who, businessId) => must(await who.client.rpc("business_usage", { p_business_id: businessId }), "usage");
const couponByTitle = async (businessId, title) => must(await admin.from("coupons").select("*").eq("business_id", businessId).eq("title", title).maybeSingle(), "coupon");
const page = async (path, who) => (await (await fetch(`${base}${path}`, { headers: { cookie: who.cookie } })).text()).replaceAll("<!-- -->", "");
// Main Street's campaigns per location, with one open store.
const LIMIT = 10;
const draftRow = (businessId, title) => ({ business_id: businessId, category_id: categoryId, title, discount_type: "percent", discount_value: 10, starts_at: iso(-1), expires_at: iso(10), status: "draft" });

async function main() {
  categoryId = must(await admin.from("categories").select("id").eq("active", true).limit(1).single(), "category").id;
  const settings = must(await admin.from("platform_settings").select("payments_open, renewals_enabled, enterprise_contact_email").eq("singleton", true).single(), "settings");
  check("payments stay closed and renewals off", settings.payments_open === false && settings.renewals_enabled === false, settings);

  console.log("\nOffers");
  const offers = Object.fromEntries(must(await admin.from("offers").select("*"), "offers").map((o) => [o.code, o]));
  check("Founding: $99 a year, $12 a month, 200 seats, 50 free, 12 months, into Main Street", offers.founding_merchant.annual_price_cents === 9900 && offers.founding_merchant.monthly_price_cents === 1200 && offers.founding_merchant.seat_cap === 200 && offers.founding_merchant.free_seats === 50 && offers.founding_merchant.term_months === 12 && offers.founding_merchant.renews_into === "general");
  for (const [code, stores, each, jfy] of [["founding_merchant", 1, 10, 5], ["early_access", 1, 10, 5], ["general", 1, 10, 8], ["merchant_plus", 3, 20, 12]]) {
    check(`${code}: ${each} campaigns per location, ${stores} location(s), ${jfy} Just for You a month`, offers[code].campaigns_per_location === each && offers[code].max_locations === stores && offers[code].private_offers_per_month === jfy, offers[code]);
  }
  check("Build Your Route: inactive, admin only", offers.enterprise?.active === false && offers.enterprise?.admin_only === true);
  const membership = (await (await fetch(`${base}/business-membership`)).text()).replaceAll("<!-- -->", "").replaceAll("&amp;", "&");
  const n = (code) => offers[code].name;
  check(
    "Business membership: campaigns per location for each level, from the table",
    membership.includes(`${n("founding_merchant")}, ${n("early_access")} and ${n("general")} include up to 10 campaigns per location per month, and ${n("merchant_plus")} includes up to 20`),
  );
  check(
    "Business membership: Just for You offers for each level, from the table",
    membership.includes(`Just for You private offers for one customer: 5 a month with ${n("founding_merchant")} and ${n("early_access")}, 8 with ${n("general")} and 12 with ${n("merchant_plus")}.`) &&
      membership.includes("Includes up to 10 campaigns per location per month and 8 Just for You private offers per month."),
  );
  check("Business membership no longer says 4 campaigns", !/\b4 campaigns/.test(membership));

  console.log("\nCampaigns");
  const m = await merchant("a");
  const biz = m.business.id;
  for (let i = 1; i <= LIMIT; i += 1) {
    const r = await save(m.owner, null, `Campaign ${i} ${run}`, "publish");
    check(`publish ${i} goes through`, Boolean(r.redirect) && (await couponByTitle(biz, `Campaign ${i} ${run}`))?.status === "published", r);
  }
  let u = await usageOf(m.owner, biz);
  check(`usage says ${LIMIT} of ${LIMIT}, ${LIMIT} per location with 1 open store`, u.campaigns_used === LIMIT && u.campaigns_limit === LIMIT && u.campaigns_per_location === LIMIT && u.locations_used === 1 && u.campaigns_override === false, u);

  const fifth = await save(m.owner, null, `Campaign five ${run}`, "publish");
  check("one more publish is refused and says when it resets", fifth.value?.ok === false && /used all your campaigns/.test(fifth.value.error) && /reset on/.test(fifth.value.error), fifth);
  check("the refused coupon was not created", (await couponByTitle(biz, `Campaign five ${run}`)) === null);
  const draft = await save(m.owner, null, `Campaign five ${run}`, "draft");
  check("a draft can still be saved", Boolean(draft.redirect) && (await couponByTitle(biz, `Campaign five ${run}`))?.status === "draft", draft);
  const fifthCoupon = await couponByTitle(biz, `Campaign five ${run}`);
  const fromDraft = await save(m.owner, fifthCoupon.id, `Campaign five ${run}`, "publish");
  check("publishing that draft is refused", fromDraft.value?.ok === false && /used all your campaigns/.test(fromDraft.value.error), fromDraft);

  const bypassUpdate = await m.owner.client.from("coupons").update({ status: "published" }).eq("id", fifthCoupon.id);
  check("database refuses a direct publish of a draft", bypassUpdate.error?.hint === "campaign_limit", bypassUpdate.error);
  const bypassInsert = await m.owner.client.from("coupons").insert({ ...draftRow(biz, `Bypass ${run}`), status: "published" });
  check("database refuses a direct published insert", bypassInsert.error?.hint === "campaign_limit", bypassInsert.error);

  const first = await couponByTitle(biz, `Campaign 1 ${run}`);
  const edit = await save(m.owner, first.id, `Campaign 1 edited ${run}`, "publish");
  check("editing a published coupon does not count", Boolean(edit.redirect) && (await usageOf(m.owner, biz)).campaigns_used === LIMIT, edit);
  const pause = await act(m.owner, "merchant/coupons/actions.ts", "setCouponStatus", [first.id, "paused"]);
  const resume = await act(m.owner, "merchant/coupons/actions.ts", "setCouponStatus", [first.id, "published"]);
  check("pausing and resuming at the limit works and does not count", pause.value?.ok === true && resume.value?.ok === true && (await usageOf(m.owner, biz)).campaigns_used === LIMIT, { pause, resume });

  const pages = { dashboard: "/merchant", builder: "/merchant/coupons/new", editor: `/merchant/coupons/${first.id}`, billing: "/merchant/billing" };
  for (const [name, path] of Object.entries(pages)) {
    const html = await page(path, m.owner);
    check(`${name} shows ${LIMIT} of ${LIMIT} campaigns used this month, ${LIMIT} per location`, html.includes(`${LIMIT} of ${LIMIT} campaigns used this month`) && (name === "dashboard" || html.includes(`includes ${LIMIT} per location each month, with 1 open store`)), path);
  }

  const held = await couponByTitle(biz, `Campaign 2 ${run}`);
  must(await admin.from("coupons").update({ admin_hold: true }).eq("id", held.id), "hold");
  const del = await act(m.owner, "merchant/coupons/actions.ts", "deleteCoupon", [held.id]);
  check("deleting a coupon does not give the campaign back", Boolean(del.redirect) && (await usageOf(m.owner, biz)).campaigns_used === LIMIT, del);

  must(await admin.from("coupon_campaigns").update({ month: day(-40).slice(0, 8) + "01" }).eq("business_id", biz), "age ledger");
  u = await usageOf(m.owner, biz);
  check("a new month starts at 0 with no rollover", u.campaigns_used === 0 && u.campaigns_limit === LIMIT, u);
  const afterReset = await save(m.owner, fifthCoupon.id, `Campaign five ${run}`, "publish");
  check("the draft publishes after the reset", Boolean(afterReset.redirect) && (await usageOf(m.owner, biz)).campaigns_used === 1, afterReset);

  console.log("\nCampaigns: two publishes at once");
  const raceM = await merchant("race");
  const raceIds = [];
  for (let i = 0; i <= LIMIT; i += 1) raceIds.push(must(await admin.from("coupons").insert(draftRow(raceM.business.id, `Race ${i} ${run}`)).select("id").single(), "race coupon").id);
  const results = await Promise.all(raceIds.map((id) => raceM.owner.client.from("coupons").update({ status: "published" }).eq("id", id)));
  const won = results.filter((r) => !r.error).length;
  const refused = results.filter((r) => r.error?.hint === "campaign_limit").length;
  check(`${LIMIT + 1} at once: exactly ${LIMIT} published, one refused`, won === LIMIT && refused === 1, results.map((r) => r.error?.hint ?? "ok"));
  check(`ledger holds ${LIMIT}`, (await usageOf(raceM.owner, raceM.business.id)).campaigns_used === LIMIT);

  console.log("\nLocations");
  check("dashboard shows 1 of 1 location", /1 of 1 location/.test(await page("/merchant", m.owner)));
  const locPage = await page("/merchant/locations", m.owner);
  check("Stores page shows 1 of 1 location, the limit and no Add store", /1 of 1 location/.test(locPage) && /includes up to 1 location/.test(locPage) && !/\/merchant\/locations\/new/.test(locPage));
  check("billing shows 1 of 1 location", /1 of 1 location/.test(await page("/merchant/billing", m.owner)));
  const over = await act(m.owner, "merchant/locations/actions.ts", "createLocation", [locationInput("Second")]);
  check("adding a second store is refused with a clear message", over.value?.ok === false && /includes up to 1 location/.test(over.value.error), over);
  const direct = await m.owner.client.from("locations").insert({ business_id: biz, ...storeRow("direct") });
  check("database refuses a direct insert", direct.error?.hint === "location_limit", direct.error);

  const oldStore = must(await admin.from("locations").select("id").eq("business_id", biz).single(), "store");
  const closed = await act(m.owner, "merchant/locations/actions.ts", "setLocationActive", [oldStore.id, false]);
  check("closing the only store works", closed.value?.ok === true, closed);
  const swap = await act(m.owner, "merchant/locations/actions.ts", "createLocation", [locationInput("Replacement")]);
  check("a store can be added once the other is closed", Boolean(swap.redirect), swap);
  const reopen = await act(m.owner, "merchant/locations/actions.ts", "setLocationActive", [oldStore.id, true]);
  check("reopening over the limit is refused", reopen.value?.ok === false && /includes up to 1 location/.test(reopen.value.error), reopen);
  const directReopen = await m.owner.client.from("locations").update({ active: true }).eq("id", oldStore.id);
  check("database refuses a direct reopen", directReopen.error?.hint === "location_limit", directReopen.error);

  const plus = await merchant("plus", "merchant_plus");
  for (const n of ["two", "three"]) {
    const r = await act(plus.owner, "merchant/locations/actions.ts", "createLocation", [locationInput(n)]);
    check(`Boulevard adds store ${n}`, Boolean(r.redirect), r);
  }
  check("Boulevard shows 3 of 3 locations", /3 of 3 locations/.test(await page("/merchant/locations", plus.owner)));
  const fourth = await act(plus.owner, "merchant/locations/actions.ts", "createLocation", [locationInput("four")]);
  check("Boulevard: a fourth is refused", fourth.value?.ok === false && /includes up to 3 locations/.test(fourth.value.error), fourth);
  let pu = await usageOf(plus.owner, plus.business.id);
  check("Boulevard with 3 open stores: 20 per location x 3 = 60 campaigns", pu.campaigns_limit === 60 && pu.campaigns_per_location === 20 && pu.locations_used === 3, pu);
  const plusBilling = await page("/merchant/billing", plus.owner);
  check("Boulevard billing shows 0 of 60 campaigns, 20 per location with 3 open stores", /0 of 60 campaigns used this month/.test(plusBilling) && /includes 20 per location each month, with 3 open stores/.test(plusBilling));
  const plusStore = must(await admin.from("locations").select("id").eq("business_id", plus.business.id).eq("store_name", "Store plus one").single(), "plus store");
  const plusClosed = await act(plus.owner, "merchant/locations/actions.ts", "setLocationActive", [plusStore.id, false]);
  pu = await usageOf(plus.owner, plus.business.id);
  check("closing a store lowers the allowance to 40", plusClosed.value?.ok === true && pu.campaigns_limit === 40, { plusClosed, pu });

  for (const [code, stores] of [["founding_merchant", 1], ["early_access", 1], [null, 1]]) {
    const x = await merchant(`limit-${code ?? "none"}`, code);
    const v = await usageOf(x.owner, x.business.id);
    check(`${code ?? "a plan with no offer"}: ${stores} location, ${LIMIT} campaigns`, v.locations_limit === stores && v.campaigns_limit === LIMIT, v);
  }

  await justForYou();

  console.log("\nAccess");
  const stranger = await merchant("stranger");
  check("another merchant cannot read this business's usage", (await usageOf(stranger.owner, biz)) === null);
  const strangerLedger = await stranger.owner.client.from("coupon_campaigns").select("id").eq("business_id", biz);
  check("another merchant cannot read this business's ledger", strangerLedger.data?.length === 0, strangerLedger);
  const ownerLedgerWrite = await m.owner.client.from("coupon_campaigns").delete().eq("business_id", biz).select("id");
  check("a merchant cannot delete ledger rows", ownerLedgerWrite.data?.length === 0, ownerLedgerWrite);
  const selfOverride = await m.owner.client.from("business_limit_overrides").insert({ business_id: biz, max_locations: 99 });
  check("a merchant cannot set their own limits", Boolean(selfOverride.error), selfOverride.error);
  const merchantOffers = must(await m.owner.client.rpc("offer_overview"), "overview");
  check("merchants do not see Build Your Route", !merchantOffers.some((o) => o.code === "enterprise"));

  console.log("\nAdmin overrides and Build Your Route");
  const boss = await user("boss", "admin");
  const adminAct = (name, args) => act(boss, "admin/subscriptions/actions.ts", name, args);
  const notAllowed = await act(m.owner, "admin/subscriptions/actions.ts", "setBusinessLimits", [biz, { maxLocations: 99, campaignsPerMonth: 99 }]);
  check("a merchant cannot call the admin action", notAllowed.value?.ok !== true, notAllowed);
  const setOverride = await adminAct("setBusinessLimits", [biz, { maxLocations: 2, campaignsPerMonth: 6 }]);
  u = await usageOf(boss, biz);
  check("admin override changes the limits (a total for the business)", setOverride.value?.ok === true && u.locations_limit === 2 && u.campaigns_limit === 6 && u.campaigns_override === true, { setOverride, u });
  const reopenNow = await act(m.owner, "merchant/locations/actions.ts", "setLocationActive", [oldStore.id, true]);
  check("the extra store can reopen under the override", reopenNow.value?.ok === true, reopenNow);
  const adminPage = await page(`/admin/merchants/${biz}`, boss);
  check("admin merchant page shows Limits and Grant Build Your Route", /2 of 2 locations/.test(adminPage) && /Grant Build Your Route/.test(adminPage));
  const cleared = await adminAct("setBusinessLimits", [biz, { maxLocations: "", campaignsPerMonth: "" }]);
  u = await usageOf(boss, biz);
  check("clearing the override returns to the plan's limits", cleared.value?.ok === true && u.locations_limit === 1 && u.campaigns_override === false, { cleared, u });

  const ent = await merchant("ent", null);
  must(await admin.from("subscriptions").delete().eq("business_id", ent.business.id), "remove plan");
  const noNumbers = await adminAct("grantEnterprisePlan", [ent.business.id, { maxLocations: "", campaignsPerMonth: "", endsOn: "" }]);
  check("Build Your Route needs its limits", noNumbers.value?.ok === false, noNumbers);
  const granted = await adminAct("grantEnterprisePlan", [ent.business.id, { maxLocations: 5, campaignsPerMonth: 10, endsOn: day(200) }]);
  const entPlan = must(await admin.from("subscriptions").select("*").eq("business_id", ent.business.id).single(), "enterprise plan");
  u = await usageOf(ent.owner, ent.business.id);
  check("Build Your Route granted with custom limits", granted.value?.ok === true && entPlan.offer_code === "enterprise" && entPlan.source === "complimentary" && u.locations_limit === 5 && u.campaigns_limit === 10, { granted, u });
  const fifthStores = [];
  for (const n of ["b", "c", "d", "e", "f"]) fifthStores.push(await act(ent.owner, "merchant/locations/actions.ts", "createLocation", [locationInput(n)]));
  check("Build Your Route: four more stores fit, a sixth does not", fifthStores.slice(0, 4).every((r) => r.redirect) && fifthStores[4].value?.ok === false, fifthStores.map((r) => r.redirect ?? r.value));
  const noCheckout = must(await admin.rpc("begin_paid_checkout", { p_business_id: ent.business.id, p_offer_code: "enterprise", p_cycle: "annual", p_amount_cents: 100, p_invoice: `T${run}`, p_created_by: ent.owner.id, p_hold_minutes: 1 }), "checkout");
  check("Build Your Route has no checkout", noCheckout.result === "no_offer", noCheckout);
  const entBilling = await page("/merchant/billing", ent.owner);
  check("Build Your Route billing shows limits and no offer to buy", /of 5 locations/.test(entBilling) && /of 10 campaigns/.test(entBilling) && !/Pioneer Circle: /.test(entBilling));

  const paid = await merchant("paid");
  must(await admin.from("subscriptions").update({ source: "authorize_net", offer_code: "general" }).eq("business_id", paid.business.id), "paid");
  const overPaid = await adminAct("grantEnterprisePlan", [paid.business.id, { maxLocations: 5, campaignsPerMonth: 10, endsOn: "" }]);
  check("Build Your Route cannot replace a current paid plan", overPaid.value?.ok === false && /paid plan/.test(overPaid.value.error), overPaid);

  console.log("\nBilling pages");
  const contact = settings.enterprise_contact_email;
  const history = await page("/merchant/billing/history", m.owner);
  const billing = await page("/merchant/billing", m.owner);
  for (const [name, html] of [["billing", billing], ["history", history]]) {
    check(`${name} shows More than 3 locations? with the email`, /More than 3 locations\?/.test(html) && html.includes(`mailto:${contact}`));
  }
  const noPlan = await merchant("noplan");
  must(await admin.from("subscriptions").delete().eq("business_id", noPlan.business.id), "remove plan");
  check("the Pioneer Circle offer shows both prices", /Pioneer Circle: \$99 a year or \$12 a month for your first year/.test(await page("/merchant/billing", noPlan.owner)));
}

// Just for You private offers: hidden everywhere public, opened by private link, redeemed once.
// The "count as campaigns" setting is not switched here: tests never change platform settings.
async function justForYou() {
  console.log("\nJust for You");
  const settings = must(await admin.from("platform_settings").select("private_offers_count_as_campaigns").eq("singleton", true).single(), "settings");
  check("setting default: Just for You offers have their own allowance", settings.private_offers_count_as_campaigns === false, settings);
  const LABEL = "Private Offer – Just for You";
  // Main Street's Just for You offers per month (client, 2026-11-12).
  const JFY = 8;
  const j = await merchant("jfy");
  const jb = j.business.id;
  const title = `JFY ${run}`;
  const jfyInput = (t, extra = {}) => ({ ...couponInput(t), visibility: "private", totalLimit: 5, ...extra });
  const builder = await page("/merchant/coupons/new", j.owner);
  check("the builder asks Who can see this offer? with both choices", builder.includes("Who can see this offer?") && builder.includes("Everyone: appears publicly on Coupersville") && builder.includes("Just for You: private offer for one customer"));

  const draft = await act(j.owner, "merchant/coupons/actions.ts", "saveCoupon", [null, jfyInput(`${title} draft`), "draft"]);
  const draftNow = await couponByTitle(jb, `${title} draft`);
  check("a private draft is not counted", Boolean(draft.redirect) && draftNow?.visibility === "private" && Boolean(draftNow?.private_key) && (await usageOf(j.owner, jb)).private_used === 0, draftNow);
  const anon = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  check("a draft's link shows nothing", (await anon.rpc("private_offer", { p_key: draftNow.private_key })).data === null);
  const toPublic = await act(j.owner, "merchant/coupons/actions.ts", "saveCoupon", [draftNow.id, { ...jfyInput(`${title} draft`), visibility: "public" }, "draft"]);
  const nowPublic = await couponByTitle(jb, `${title} draft`);
  check("a draft can still switch to Everyone, and loses its key", Boolean(toPublic.redirect) && nowPublic.visibility === "public" && nowPublic.private_key === null, nowPublic);

  const pub = await act(j.owner, "merchant/coupons/actions.ts", "saveCoupon", [null, jfyInput(title), "publish"]);
  const jc = await couponByTitle(jb, title);
  check("publishing opens the coupon page with its link", Boolean(jc) && Boolean(pub.redirect?.includes(`/merchant/coupons/${jc.id}`)), pub);
  check("the database fixes total uses at 1 and sets a 32-character private key", jc.visibility === "private" && jc.status === "published" && jc.total_limit === 1 && /^[0-9a-f]{32}$/.test(jc.private_key), jc);
  const ju = await usageOf(j.owner, jb);
  check("it counts as a Just for You offer, not a campaign", ju.campaigns_used === 0 && ju.private_used === 1 && ju.private_limit === JFY, ju);
  const editor = await page(`/merchant/coupons/${jc.id}?published=1`, j.owner);
  check("the editor shows the label, the private link and Copy link", editor.includes(LABEL) && editor.includes(`https://coupersville.com/just-for-you/${jc.private_key}`) && editor.includes("Copy link"));
  check(`the editor shows 1 of ${JFY} Just for You offers used this month`, editor.includes(`1 of ${JFY} Just for You offers used this month`));
  check("who can see it is locked after publishing", editor.includes("This cannot change after the offer is published."));
  check("the coupon list shows the badge", (await page("/merchant/coupons?view=live", j.owner)).includes(LABEL));

  console.log("\nJust for You: hidden from every public list");
  const shopper = await user("jfy-shopper", "consumer");
  check("not in live_coupons", ((await anon.from("live_coupons").select("id").eq("id", jc.id)).data ?? []).length === 0);
  check("signed out cannot read it from coupons by id", ((await anon.from("coupons").select("id").eq("id", jc.id)).data ?? []).length === 0);
  check("a signed-in shopper cannot read it by id", ((await shopper.client.from("coupons").select("id").eq("id", jc.id)).data ?? []).length === 0);
  const found = must(await anon.rpc("search_live_coupons", { p_business: j.business.name, p_limit: 60 }), "search");
  check("search by business name does not find it", !found.some((r) => r.id === jc.id), found.length);
  const featuredTry = await admin.from("coupons").update({ featured: true }).eq("id", jc.id).select("featured").single();
  check("it cannot be featured, even by an admin", featuredTry.data?.featured === false, featuredTry);
  const slug = must(await admin.from("categories").select("slug").eq("id", categoryId).single(), "category").slug;
  for (const path of ["/", `/search?business=${encodeURIComponent(j.business.name)}`, "/explore", `/c/${slug}`, "/sitemap.xml", `/coupon/${jc.id}`]) {
    const html = await (await fetch(`${base}${path}`)).text();
    check(`${path.split("?")[0]} does not show it`, !html.includes(title), path);
  }
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  check("robots.txt keeps crawlers off /just-for-you", /Disallow: \/just-for-you/.test(robots));

  console.log("\nJust for You: the private link");
  const link = `/just-for-you/${jc.private_key}`;
  const open = (await (await fetch(`${base}${link}`)).text()).replaceAll("<!-- -->", "");
  check("the link opens signed out, says Just for You and offers Get my coupon", open.includes(title) && open.includes("Just for You") && open.includes("Get my coupon") && !open.includes("Private Offer"));
  check("the page is not indexed and sends no referrer", /<meta name="robots" content="noindex, nofollow"/.test(open) && /<meta name="referrer" content="no-referrer"/.test(open));
  check("it has no Save button", !/Save for later|Save coupon/.test(open));
  const wrong = await (await fetch(`${base}/just-for-you/${"0".repeat(32)}`)).text();
  check("a wrong key shows nothing", !wrong.includes(title));

  const noKey = must(await shopper.client.rpc("create_redemption_token", { p_coupon_id: jc.id }), "no key");
  check("its id alone gets no code", noKey.result === "not_live", noKey);
  const badKey = must(await shopper.client.rpc("create_redemption_token", { p_coupon_id: jc.id, p_private_key: "f".repeat(32) }), "bad key");
  check("a wrong key gets no code", badKey.result === "not_live", badKey);
  const fav = await shopper.client.from("favorites").insert({ user_id: shopper.id, coupon_id: jc.id });
  check("it cannot be saved to a list", Boolean(fav.error), fav.error);
  const started = await act(shopper, "redeem/actions.ts", "startRedemption", [jc.id, jc.private_key]);
  check("with the key, Get my coupon makes a code", Boolean(started.redirect?.startsWith("/redeem/")), started);
  const tokenId = started.redirect?.split("/").pop();
  check("the redeem screen links back to the private page", (await page(started.redirect ?? "/", shopper)).includes(link));

  const store = must(await admin.from("locations").select("id").eq("business_id", jb).single(), "store");
  const tokenRow = must(await admin.from("redemption_tokens").select("token").eq("id", tokenId).single(), "token");
  const preview = must(await j.owner.client.rpc("preview_redemption", { p_token_or_code: tokenRow.token, p_location_id: store.id }), "preview");
  check("staff see it is a Just for You offer before confirming", preview.result === "ok" && preview.offer?.just_for_you === true, preview);
  const verified = must(await j.owner.client.rpc("verify_redemption", { p_token_or_code: tokenRow.token, p_location_id: store.id }), "verify");
  check("staff redeem it", verified.result === "ok", verified);

  const second = await user("jfy-second", "consumer");
  const again = must(await second.client.rpc("create_redemption_token", { p_coupon_id: jc.id, p_private_key: jc.private_key }), "again");
  check("nobody can redeem it a second time", again.result === "total_limit_reached", again);
  const againAction = await act(second, "redeem/actions.ts", "startRedemption", [jc.id, jc.private_key]);
  check("and the shopper is told This offer has been used.", againAction.value?.error === "This offer has been used.", againAction);
  const used = (await (await fetch(`${base}${link}`)).text()).replaceAll("<!-- -->", "");
  check("the link now says This offer has been used.", used.includes("This offer has been used.") && !used.includes("Get my coupon"));
  check("the coupon page says it has been redeemed", (await page(`/merchant/coupons/${jc.id}`, j.owner)).includes("It has been redeemed"));

  console.log("\nJust for You: no free Pioneer Circle seat");
  const seatless = await merchant("jfy-noplan");
  must(await admin.from("subscriptions").delete().eq("business_id", seatless.business.id), "remove plan");
  const privateFirst = await act(seatless.owner, "merchant/coupons/actions.ts", "saveCoupon", [null, jfyInput(`${title} first`), "publish"]);
  const privateFirstRow = await couponByTitle(seatless.business.id, `${title} first`);
  check(
    "a Just for You first coupon is kept as a draft and Billing says why",
    privateFirstRow?.status === "draft" && (privateFirst.redirect === "/merchant/billing?claim=coupon_private" || /active plan/.test(privateFirst.value?.error ?? "")),
    privateFirst,
  );
  const claimDirect = must(await seatless.owner.client.rpc("claim_founding_seat", { p_business_id: seatless.business.id, p_coupon_id: privateFirstRow.id }), "claim");
  check("the database refuses a seat for a Just for You offer", claimDirect.result === "coupon_private", claimDirect);
  const seatRows = must(await admin.from("offer_seat_claims").select("id").eq("business_id", seatless.business.id), "seat claims");
  const seatPlan = must(await admin.from("subscriptions").select("id").eq("business_id", seatless.business.id), "plan");
  check("no seat and no plan were given", seatRows.length === 0 && seatPlan.length === 0, { seatRows, seatPlan });
  const seatBilling = await page("/merchant/billing?claim=coupon_private", seatless.owner);
  check("Billing explains that the next public coupon claims the seat", seatBilling.includes("A Just for You offer cannot claim your free") && seatBilling.includes("Publish a public coupon to claim your seat"));

  console.log("\nJust for You: the rules hold in the database");
  const flip = await j.owner.client.from("coupons").update({ visibility: "public" }).eq("id", jc.id);
  check("who can see it cannot change after publishing", flip.error?.hint === "visibility_locked", flip.error);
  await j.owner.client.from("coupons").update({ total_limit: 5, private_key: "a".repeat(32) }).eq("id", jc.id);
  const after = await couponByTitle(jb, title);
  check("total uses stay 1 and the key never changes", after.total_limit === 1 && after.private_key === jc.private_key, after);

  for (let i = 2; i <= JFY; i += 1) {
    must(await j.owner.client.from("coupons").insert({ ...draftRow(jb, `${title} ${i}`), visibility: "private", status: "published" }), `private ${i}`);
  }
  const overLimit = await j.owner.client.from("coupons").insert({ ...draftRow(jb, `${title} over`), visibility: "private", status: "published" });
  check(`Just for You offer ${JFY + 1} this month is refused`, overLimit.error?.hint === "private_limit", overLimit.error);
  const viaAction = await act(j.owner, "merchant/coupons/actions.ts", "saveCoupon", [null, jfyInput(`${title} 12`), "publish"]);
  check("the builder says the private offers are used up", viaAction.value?.ok === false && /used all your Just for You offers/.test(viaAction.value.error), viaAction);
  const publicStill = await save(j.owner, null, `${title} public`, "publish");
  const ju2 = await usageOf(j.owner, jb);
  check("public campaigns are still available", Boolean(publicStill.redirect) && ju2.campaigns_used === 1 && ju2.private_used === JFY, { publicStill, ju2 });
}

let crashed = null;
try {
  await main();
} catch (e) {
  crashed = e;
  console.error(`\nStopped: ${e.message}`);
}

console.log("\nCleaning up");
for (const id of created.businesses) await admin.from("email_notices").delete().like("ref", `%${id}%`);
for (const id of created.businesses) await admin.from("businesses").delete().eq("id", id);
for (const id of created.users) await admin.auth.admin.deleteUser(id);
const left = await admin.from("businesses").select("id", { count: "exact", head: true }).in("id", created.businesses.length ? created.businesses : ["00000000-0000-0000-0000-000000000000"]);
console.log(`  removed ${created.businesses.length} businesses and ${created.users.length} users; ${left.count} businesses left`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed || crashed || left.count ? 1 : 0);
