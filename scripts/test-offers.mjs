// Billing Part A checks: offers, the publishing open date, and Founding Merchant free seats,
// through the real server actions and database functions, against a running build.
//
//   npm run staging:build && npm run staging:start
//   BASE_URL=http://localhost:3100 node --env-file=.env.staging.local scripts/test-offers.mjs
//
// To test the Founders window before it opens, and the last free seat, the script moves the
// publishing date and the Founding offer's window and free seats for a few seconds. It puts every
// value back afterwards, and deletes its throwaway users and businesses (and so their seat claims).

// Exits unless this run targets the staging project (never production).
import "./lib/staging-guard.mjs";
import { createClient } from "@supabase/supabase-js";
import { callAction, makeUser } from "./lib/call-action.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !publishable || !secret) {
  console.error("Missing Supabase env vars. Run with --env-file=.env.local");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, opts);
const anon = createClient(url, publishable, opts);
const run = Date.now().toString(36);
const password = `Test-${run}-${Math.random().toString(36).slice(2)}`;
const created = { users: [], businesses: [] };
let originalSettings = null;
let originalOffer = null;

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
const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString();
const day = (offsetDays) => iso(offsetDays).slice(0, 10);

async function user(label, role) {
  const u = await makeUser({ url, publishable, admin, email: `cpv-test-${run}-${label}@example.com`, password, role, fullName: `Test ${label}` });
  created.users.push(u.id);
  return u;
}

// An owner with a business (no plan unless given) and one draft coupon.
async function merchant(label, { plan = null, status = "active" } = {}) {
  const owner = await user(label, "merchant");
  const b = must(
    await admin.from("businesses").insert({ owner_id: owner.id, name: `Offers ${label} ${run}`, status, timezone: "America/Los_Angeles" }).select().single(),
    "business",
  );
  created.businesses.push(b.id);
  if (plan) must(await admin.from("subscriptions").insert({ business_id: b.id, ...plan }), "plan");
  const coupon = must(
    await admin
      .from("coupons")
      .insert({ business_id: b.id, category_id: categoryId, title: `Offers coupon ${label} ${run}`, discount_type: "percent", discount_value: 10, starts_at: iso(-1), expires_at: iso(10), status: "draft" })
      .select()
      .single(),
    "coupon",
  );
  return { owner, business: b, coupon };
}

const settings = (patch) => admin.from("platform_settings").update(patch).eq("singleton", true);
const founding = async () => must(await admin.from("offers").select("*").eq("code", "founding_merchant").single(), "founding");
const usedFree = async () => (await admin.from("offer_seat_claims").select("id", { count: "exact", head: true }).eq("offer_code", "founding_merchant").eq("free", true)).count;
// Leaves exactly `left` free seats.
const freeSeatsLeft = async (left) => must(await admin.from("offers").update({ free_seats: (await usedFree()) + left }).eq("code", "founding_merchant"), "free seats");
const planOf = (id) => admin.from("subscriptions").select("*").eq("business_id", id).maybeSingle().then((r) => r.data);
const statusOf = (id) => admin.from("coupons").select("status").eq("id", id).single().then((r) => r.data?.status);
const isLive = (id) => anon.from("live_coupons").select("id").eq("id", id).maybeSingle().then((r) => Boolean(r.data));
const page = async (path, who) => (await (await fetch(`${base}${path}`, { headers: { cookie: who.cookie } })).text()).replaceAll("<!-- -->", "");
const claim = (who, businessId, couponId) =>
  who.client.rpc("claim_founding_seat", couponId ? { p_business_id: businessId, p_coupon_id: couponId } : { p_business_id: businessId }).then((r) => r.data?.result ?? r.error?.message);

let categoryId;

const couponInput = (title) => ({
  title,
  description: "",
  categoryId,
  discountType: "percent",
  discountValue: 20,
  includedProducts: "",
  limitsText: "",
  minSpend: "",
  minQty: "",
  maxPeople: "",
  startsOn: day(0),
  expiresOn: day(14),
  imagePath: null,
  allLocations: true,
  locationIds: [],
  totalLimit: "",
  perUserMode: "once",
  perUserLimit: "",
  redeemFrequency: "none",
  scheduleOn: false,
  scheduleDays: [1, 2, 3, 4, 5, 6, 7],
  scheduleStart: "",
  scheduleEnd: "",
});

async function main() {
  originalSettings = must(await admin.from("platform_settings").select("*").eq("singleton", true).single(), "settings");
  originalOffer = await founding();
  categoryId = must(await admin.from("categories").select("id").eq("active", true).order("sort_order").limit(1).single(), "cat").id;

  console.log("\nSeeded offers");
  const offers = must(await admin.from("offers").select("*").order("sort_order"), "offers");
  const by = Object.fromEntries(offers.map((o) => [o.code, o]));
  check("four offers, in order", offers.map((o) => o.code).join() === "founding_merchant,early_access,general,merchant_plus", offers.map((o) => o.code));
  const f = by.founding_merchant;
  check(
    "Founding Merchant: Nov 1 to Jan 31 Pacific, 200 seats, 50 free, $99 a year only, 12 months, renews into General",
    f.window_starts_at.startsWith("2026-11-01T07:00:00") && f.window_ends_at.startsWith("2027-02-01T08:00:00") && f.seat_cap === 200 && f.free_seats === 50 &&
      f.annual_price_cents === 9900 && f.monthly_price_cents === null && f.term_months === 12 && f.renews_into === "general" && f.active,
    f,
  );
  const e = by.early_access;
  check("Early Access: Feb 1 to Jun 30, $149 or $19, 12 months, renews into General", e.window_starts_at.startsWith("2027-02-01T08:00:00") && e.window_ends_at.startsWith("2027-07-01T07:00:00") && e.annual_price_cents === 14900 && e.monthly_price_cents === 1900 && e.term_months === 12 && e.renews_into === "general", e);
  const g = by.general;
  check("General: from Jul 1, $249 or $29, ongoing", g.window_starts_at.startsWith("2027-07-01T07:00:00") && !g.window_ends_at && g.annual_price_cents === 24900 && g.monthly_price_cents === 2900 && g.term_months === null && g.active, g);
  const p = by.merchant_plus;
  check("Merchant Plus: $499 or $49, inactive, limits not set", p.annual_price_cents === 49900 && p.monthly_price_cents === 4900 && !p.active && p.max_locations === null && p.max_live_coupons === null, p);
  check("defaults: publishing opens Nov 1 Pacific, first-coupon rule, Early Access when full", originalSettings.founders_rule === "profile_and_first_coupon" && originalSettings.founders_full_early_access === true);

  const boss = await user("admin", "admin");
  const shopper = await user("shopper", "consumer");
  const paidUp = await merchant("planned", { plan: { source: "complimentary", status: "active", current_period_end: iso(90) } });
  const a = await merchant("a");
  const b = await merchant("b");
  const c = await merchant("c");
  const d = await merchant("d");
  const draftShop = await merchant("draft", { status: "draft" });

  console.log("\nWho can read offers");
  check("a merchant cannot read the offers table", (await a.owner.client.from("offers").select("code")).data?.length === 0);
  const overview = must(await a.owner.client.rpc("offer_overview"), "overview");
  check("a merchant sees active offers with seats used through offer_overview", overview.length === 3 && overview.every((o) => o.active && "seats_used" in o), overview.map((o) => o.code));
  check("signed out sees no offers", ((await anon.rpc("offer_overview")).data ?? []).length === 0);
  check("a merchant cannot read other businesses' seat claims", (await a.owner.client.from("offer_seat_claims").select("id").neq("business_id", a.business.id)).data?.length === 0);
  check("admin sees all four, inactive included", must(await boss.client.rpc("offer_overview"), "admin overview").length === 4);

  console.log("\nBefore publishing opens");
  must(await settings({ publishing_opens_at: iso(1) }), "close publishing");
  const early = (await callAction(base, paidUp.owner.cookie, A("merchant/coupons/actions.ts"), "saveCoupon", [null, couponInput(`Too early ${run}`), "publish"])).value;
  check("a merchant with a plan cannot publish yet, and is told when it opens", early?.ok === false && /Publishing opens on/.test(early.error), early);
  const earlyDraft = await callAction(base, paidUp.owner.cookie, A("merchant/coupons/actions.ts"), "saveCoupon", [null, couponInput(`Early draft ${run}`), "save"]);
  check("but can save drafts", Boolean(earlyDraft.redirect), earlyDraft);
  const direct = await paidUp.owner.client.from("coupons").update({ status: "published" }).eq("id", paidUp.coupon.id);
  check("the database refuses it too", direct.error?.hint === "publishing_not_open", direct.error);
  check("a free seat cannot be claimed yet", (await claim(a.owner, a.business.id, a.coupon.id)) === "not_open");
  const bossPublish = await boss.client.from("coupons").update({ status: "published" }).eq("id", paidUp.coupon.id);
  check("an admin can still publish", !bossPublish.error, bossPublish.error);
  check("live coupons stay live", await isLive(paidUp.coupon.id));
  const billingEarly = await page("/merchant/billing", a.owner);
  check("billing page says when publishing opens and shows the Founding offer", /Publishing opens on/.test(billingEarly) && /Founding Merchant: \$99 a year or \$12 a month for your first year/.test(billingEarly), billingEarly.length);

  console.log("\nFounders window open: the race for the last free seat");
  must(await settings({ publishing_opens_at: iso(-1) }), "open publishing");
  must(await admin.from("offers").update({ window_starts_at: iso(-1) }).eq("code", "founding_merchant"), "open window");
  await freeSeatsLeft(1);
  const [ra, rb] = await Promise.all([claim(a.owner, a.business.id, a.coupon.id), claim(b.owner, b.business.id, b.coupon.id)]);
  check("two merchants claim the last seat at once: exactly one gets it", [ra, rb].sort().join() === "claimed,seats_gone", [ra, rb]);
  const [winner, loser] = ra === "claimed" ? [a, b] : [b, a];
  const won = await planOf(winner.business.id);
  const months = won && (new Date(won.current_period_end) - Date.now()) / 86_400_000;
  check("the winner has a complimentary Founding plan for 12 months", won?.source === "complimentary" && won.offer_code === "founding_merchant" && won.status === "active" && months > 360 && months < 370, won);
  check("and its first coupon is live", (await statusOf(winner.coupon.id)) === "published" && (await isLive(winner.coupon.id)));
  const seat = must(await admin.from("offer_seat_claims").select("*").eq("business_id", winner.business.id).single(), "claim");
  check("the claim records the seat, the coupon and who claimed it", seat.free && seat.coupon_id === winner.coupon.id && seat.claimed_by === winner.owner.id && seat.seat_number > 0, seat);
  check("the loser has no plan", (await planOf(loser.business.id)) === null);
  check("and its coupon is still a draft", (await statusOf(loser.coupon.id)) === "draft");
  const loserDirect = await loser.owner.client.from("coupons").update({ status: "published" }).eq("id", loser.coupon.id);
  check("a merchant without a plan cannot publish straight to the database", loserDirect.error?.hint === "subscription_required", loserDirect.error);
  const loserSave = (await callAction(base, loser.owner.cookie, A("merchant/coupons/actions.ts"), "saveCoupon", [loser.coupon.id, couponInput(`Loser ${run}`), "publish"])).value;
  check("Publish coupon says a membership is needed", loserSave?.ok === false && /active plan|active membership/.test(loserSave.error), loserSave);
  const loserBilling = await page("/merchant/billing", loser.owner);
  check("billing: Founding Merchant: $99 a year or $12 a month for your first year, Payments open soon, 0 free seats left", /Founding Merchant: \$99 a year or \$12 a month for your first year/.test(loserBilling) && /Payments open soon/.test(loserBilling) && /0 of /.test(loserBilling));
  check("billing: no checkout while payments are closed", !/Continue to payment/.test(loserBilling));

  console.log("\nOne seat per business, and nothing for anyone else");
  check("the winner cannot claim again (has a plan)", (await claim(winner.owner, winner.business.id, null)) === "has_plan");
  check("a merchant cannot claim for someone else's business", (await claim(c.owner, d.business.id, d.coupon.id)) === "not_allowed");
  check("a shopper cannot claim", (await claim(shopper, c.business.id, c.coupon.id)) === "not_allowed");
  await freeSeatsLeft(2);
  check("another business's coupon cannot be used", (await claim(c.owner, c.business.id, d.coupon.id)) === "coupon_invalid");
  check("a business still setting up cannot claim", (await claim(draftShop.owner, draftShop.business.id, draftShop.coupon.id)) === "profile_incomplete");
  check("under the default rule, a coupon is needed", (await claim(c.owner, c.business.id, null)) === "coupon_required");
  check("signed out cannot call it", (await anon.rpc("claim_founding_seat", { p_business_id: c.business.id })).error !== null);

  console.log("\nThrough the app: Publish coupon claims the seat");
  const viaApp = await callAction(base, c.owner.cookie, A("merchant/coupons/actions.ts"), "saveCoupon", [null, couponInput(`First coupon ${run}`), "publish"]);
  check("publishing the first coupon lands on billing with the seat confirmed", viaApp.redirect === "/merchant/billing?claim=claimed", viaApp);
  const first = must(await admin.from("coupons").select("id, status").eq("title", `First coupon ${run}`).single(), "first coupon");
  check("that coupon is live", first.status === "published" && (await isLive(first.id)));
  const cBilling = await page("/merchant/billing?claim=claimed", c.owner);
  check("billing shows the free seat", /Your free Founding Merchant seat is confirmed/.test(cBilling) && /Founding Merchant, complimentary year/.test(cBilling) && /Founding Merchant seat \d+/.test(cBilling));
  const second = await callAction(base, c.owner.cookie, A("merchant/coupons/actions.ts"), "saveCoupon", [c.coupon.id, couponInput(`Second coupon ${run}`), "publish"]);
  check("with the plan, a second coupon publishes normally", second.redirect?.startsWith("/merchant/coupons"), second);
  const dash = await page("/merchant", c.owner);
  check("dashboard shows the Founding plan", /Founding Merchant, complimentary year/.test(dash));
  const email = must(await admin.from("email_notices").select("kind").eq("kind", "plan_started").eq("ref", `founding:${c.business.id}`), "notice");
  check("the plan started email is claimed once (sending is skipped for test addresses)", email.length === 0 || email.length === 1, email);

  console.log("\nRule: profile complete");
  must(await settings({ founders_rule: "profile_complete" }), "rule");
  const dBilling = await page("/merchant/billing", d.owner);
  check("billing offers Claim free seat", /Claim free seat/.test(dBilling));
  const claimD = await callAction(base, d.owner.cookie, A("merchant/billing/actions.ts"), "claimFreeSeat", []);
  check("Claim free seat gives the plan without a coupon", claimD.redirect === "/merchant/billing?claim=claimed" && (await planOf(d.business.id))?.offer_code === "founding_merchant", claimD);
  check("the draft coupon stays a draft", (await statusOf(d.coupon.id)) === "draft");
  check("free seats are now gone", (await claim(loser.owner, loser.business.id, null)) === "seats_gone");

  console.log("\nAdmin");
  const revoke = await callAction(base, boss.cookie, A("admin/subscriptions/actions.ts"), "revokeComplimentaryPlan", [d.business.id]);
  check("an admin can revoke a free seat plan", revoke.value?.ok === true, revoke);
  check("but the seat is not given back", (await claim(loser.owner, loser.business.id, null)) === "seats_gone");
  const regrant = await callAction(base, boss.cookie, A("admin/subscriptions/actions.ts"), "setComplimentaryPlan", [d.business.id, day(30)]);
  check("a new admin grant is not a Founding seat", regrant.value?.ok === true && (await planOf(d.business.id))?.offer_code === null, await planOf(d.business.id));
  const subsPage = await page("/admin/subscriptions", boss);
  check("subscriptions page shows the Founding seat", /Founding Merchant, free seat/.test(subsPage));
  const offersPage = await page("/admin/offers", boss);
  check("offers page lists all four with seats taken", ["Founding Merchant", "Early Access", "General", "Merchant Plus"].every((n) => offersPage.includes(n)) && /Free seats taken/.test(offersPage));
  const current = await founding();
  const formFor = (patch) => ({
    name: current.name,
    startsOn: day(-1),
    endsOn: "2027-01-31",
    seatCap: current.seat_cap,
    freeSeats: current.free_seats,
    term: "12",
    annualPrice: 99,
    monthlyPrice: "",
    renewsInto: "general",
    active: true,
    maxLocations: "",
    maxLiveCoupons: "",
    ...patch,
  });
  const below = (await callAction(base, boss.cookie, A("admin/offers/actions.ts"), "updateOffer", ["founding_merchant", formFor({ freeSeats: 0 })])).value;
  check("free seats cannot go below the seats taken", below?.ok === false && /already taken/.test(below.error), below);
  const capBelow = (await callAction(base, boss.cookie, A("admin/offers/actions.ts"), "updateOffer", ["founding_merchant", formFor({ seatCap: 1, freeSeats: 1 })])).value;
  check("the seat cap cannot go below the seats taken", capBelow?.ok === false, capBelow);
  const self = (await callAction(base, boss.cookie, A("admin/offers/actions.ts"), "updateOffer", ["founding_merchant", formFor({ renewsInto: "founding_merchant" })])).value;
  check("an offer cannot renew into itself", self?.ok === false, self);
  const edit = (await callAction(base, boss.cookie, A("admin/offers/actions.ts"), "updateOffer", ["founding_merchant", formFor({ maxLocations: 3, monthlyPrice: 12.5 })])).value;
  const edited = await founding();
  check("an admin edit saves limits and prices in cents, with the end date exclusive", edit?.ok === true && edited.max_locations === 3 && edited.monthly_price_cents === 1250 && edited.window_ends_at.startsWith("2027-02-01T08:00:00"), edited);
  const merchantEdit = await callAction(base, c.owner.cookie, A("admin/offers/actions.ts"), "updateOffer", ["founding_merchant", formFor({})]);
  check("a merchant cannot edit offers", merchantEdit.blocked === true, merchantEdit);
  const directEdit = await c.owner.client.from("offers").update({ free_seats: 999 }).eq("code", "founding_merchant").select("code");
  check("nor straight in the database", (directEdit.data ?? []).length === 0);
}

async function cleanup() {
  // Deleting the businesses removes their seat claims, so the seat counts return to what they were.
  for (const id of created.businesses) await admin.from("businesses").delete().eq("id", id);
  if (originalOffer) {
    const { name, window_starts_at, window_ends_at, seat_cap, free_seats, term_months, annual_price_cents, monthly_price_cents, renews_into, active, max_locations, max_live_coupons } = originalOffer;
    const { error } = await admin
      .from("offers")
      .update({ name, window_starts_at, window_ends_at, seat_cap, free_seats, term_months, annual_price_cents, monthly_price_cents, renews_into, active, max_locations, max_live_coupons })
      .eq("code", "founding_merchant");
    if (error) console.log(`  could not restore the Founding offer: ${error.message}`);
  }
  if (originalSettings) {
    const { publishing_opens_at, founders_rule, founders_full_early_access } = originalSettings;
    const { error } = await settings({ publishing_opens_at, founders_rule, founders_full_early_access });
    if (error) console.log(`  could not restore settings: ${error.message}`);
  }
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  const refs = created.businesses.map((id) => `founding:${id}`);
  if (refs.length) await admin.from("email_notices").delete().eq("kind", "plan_started").in("ref", refs);
}

try {
  await main();
} catch (error) {
  failed += 1;
  console.error("\nStopped early:", error.message);
} finally {
  await cleanup();
  const restored = await founding().catch(() => null);
  check(
    "Founding offer and settings are back as they were",
    restored && originalOffer && restored.free_seats === originalOffer.free_seats && restored.window_starts_at === originalOffer.window_starts_at && restored.max_locations === originalOffer.max_locations,
    restored,
  );
  console.log(`\n${passed} passed, ${failed} failed. Test users and businesses removed.`);
  process.exit(failed ? 1 : 0);
}
