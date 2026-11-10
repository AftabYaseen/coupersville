// Page checks against a running app, signed in as a shopper, a staff member, an owner, and nobody.
// Creates throwaway users and a test business, fetches pages, then deletes everything.
//
//   npm run staging:build && npm run staging:start
//   BASE_URL=http://localhost:3100 node --env-file=.env.staging.local scripts/test-pages.mjs

// Exits unless this run targets staging, or production with ALLOW_PRODUCTION_TESTS=1 (see the guard).
import "./lib/staging-guard.mjs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { callAction } from "./lib/call-action.mjs";

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${String(detail).slice(0, 300)}`}`);
  }
}
function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

// Signs in the way the app does and keeps the auth cookies it would set in a browser.
async function makeUser(label, role) {
  const email = `cpv-test-${run}-${label}@example.com`;
  const { user } = must(
    await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role, full_name: `Test ${label}` } }),
    `create ${label}`,
  );
  created.users.push(user.id);
  const jar = new Map();
  const ssr = createServerClient(url, publishable, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  must(await ssr.auth.signInWithPassword({ email, password }), `sign in ${label}`);
  const client = createClient(url, publishable, opts);
  must(await client.auth.signInWithPassword({ email, password }), `rpc sign in ${label}`);
  const cookie = [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
  return { id: user.id, email, client, cookie };
}

async function get(path, who) {
  const res = await fetch(`${base}${path}`, { redirect: "manual", headers: who ? { cookie: who.cookie } : {} });
  // React separates adjacent text with <!-- -->; drop it so checks read like the page does.
  const body = res.status === 200 ? (await res.text()).replaceAll("<!-- -->", "") : "";
  return { status: res.status, location: res.headers.get("location") ?? "", body };
}

const redirectsTo = (r, path) => r.status >= 300 && r.status < 400 && new URL(r.location, base).pathname === path;

async function main() {
  const categoryId = must(await admin.from("categories").select("id").limit(1).single(), "category").id;
  const owner = await makeUser("owner", "merchant");
  const staff = await makeUser("staff", "consumer");
  const shopper = await makeUser("shopper", "consumer");

  const shop = must(
    await admin.from("businesses").insert({ owner_id: owner.id, name: `Page test shop ${run}`, status: "active", timezone: "America/Chicago" }).select().single(),
    "business",
  );
  created.businesses.push(shop.id);
  must(await admin.from("subscriptions").insert({ business_id: shop.id, source: "complimentary", status: "active" }), "sub");
  for (const name of ["North store", "South store"]) {
    must(await admin.from("locations").insert({ business_id: shop.id, store_name: name, address_line1: "1 Main St", city: "Coupersville" }), "store");
  }
  const storeA = must(await admin.from("locations").select("id").eq("business_id", shop.id).eq("store_name", "North store").single(), "store a");
  const coupon = must(
    await admin
      .from("coupons")
      .insert({
        business_id: shop.id,
        category_id: categoryId,
        title: "Page test pastry",
        discount_type: "amount",
        discount_value: 3,
        min_spend: 10,
        total_limit: 50,
        starts_at: new Date(Date.now() - 3_600_000).toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        status: "published",
      })
      .select()
      .single(),
    "coupon",
  );
  const invite = must(
    await owner.client.from("staff_invites").insert({ business_id: shop.id, email: staff.email, invited_by: owner.id }).select().single(),
    "invite",
  );

  console.log("\nJoin page");
  const joinAnon = await get(`/join/${invite.token}`);
  check("signed out: invite page names the shop", joinAnon.status === 200 && joinAnon.body.includes(`Join Page test shop ${run}`));
  check("signed out: sign in link returns to the invite", joinAnon.body.includes(`/login?next=%2Fjoin%2F${invite.token}`));
  const joinBad = await get(`/join/${"0".repeat(48)}`);
  check("unknown invite: says not valid", joinBad.body.includes("not valid"));
  must(await staff.client.rpc("accept_staff_invite", { p_token: invite.token }), "accept");

  console.log("\nCoupon detail");
  const detailAnon = await get(`/coupon/${coupon.id}`);
  check("signed out: Get my coupon opens the sign-in sheet on the page", detailAnon.body.includes("Get my coupon") && !detailAnon.body.includes("/login?next="));
  check("signed out: the coupon page says how signing up works", detailAnon.body.includes("No password, no app, no printing. Just enter your email and a one-time code the first time you redeem."));
  check(
    "coupon page: Good to know gives the real limit and minimum purchase, and Where to use it",
    ["Good to know", "Redemption limit", "One per customer", "Minimum purchase", "$10", "Where to use it"].every((t) => detailAnon.body.includes(t)),
  );
  const detailShopper = await get(`/coupon/${coupon.id}`, shopper);
  check("shopper: Get my coupon, and no sign-up line", detailShopper.body.includes("Get my coupon") && !detailShopper.body.includes("No password, no app"));

  console.log("\nRedeem screen");
  const token = must(await shopper.client.rpc("create_redemption_token", { p_coupon_id: coupon.id }), "token");
  const redeem = await get(`/redeem/${token.token_id}`, shopper);
  check("shows the 6-digit code", redeem.body.includes(`${token.short_code.slice(0, 3)} ${token.short_code.slice(3)}`));
  check("shows a QR code", redeem.body.includes("<svg") && redeem.body.includes("QR code for staff to scan"));
  check("shows the countdown", /Coupon expires in [45]:\d\d/.test(redeem.body) && redeem.body.includes("Show this code to the business."));
  check("shows the ticket", redeem.body.includes("$3 OFF") && redeem.body.includes("Minimum spend $10"));
  const redeemOther = await get(`/redeem/${token.token_id}`, staff);
  check("someone else's code is a 404", redeemOther.status === 404 || redeemOther.body.includes("NEXT_HTTP_ERROR_FALLBACK;404"));
  const redeemAnon = await get(`/redeem/${token.token_id}`);
  check("signed out: sent to sign in", redirectsTo(redeemAnon, "/login"));

  console.log("\nStaff access");
  for (const path of ["/merchant", "/merchant/coupons", "/merchant/staff", "/merchant/locations", "/merchant/business"]) {
    const r = await get(path, staff);
    check(`staff ${path} goes to the scanner`, redirectsTo(r, "/merchant/scan"), `${r.status} ${r.location}`);
  }
  const scanStaff = await get("/merchant/scan", staff);
  check("staff scanner asks which store", scanStaff.status === 200 && scanStaff.body.includes("Which store are you at?"));
  check("staff nav shows only the scanner", !scanStaff.body.includes('href="/merchant/coupons"'));
  const home = await get("/", staff);
  check("staff header links to the scanner", home.body.includes('href="/merchant/scan"'));
  const shopperMerchant = await get("/merchant/scan", shopper);
  check("shoppers cannot open the scanner", redirectsTo(shopperMerchant, "/"), `${shopperMerchant.status} ${shopperMerchant.location}`);

  console.log("\nOwner pages");
  const staffPage = await get("/merchant/staff", owner);
  check("owner sees staff page with the new staff member", staffPage.status === 200 && staffPage.body.includes(staff.email));
  const scanOwner = await get("/merchant/scan", owner);
  check("owner can open the scanner", scanOwner.status === 200 && scanOwner.body.includes("Which store are you at?"));

  console.log("\nAfter staff redeem");
  const verified = must(await staff.client.rpc("verify_redemption", { p_token_or_code: token.short_code, p_location_id: storeA.id }), "verify");
  check("verify ok", verified.result === "ok", JSON.stringify(verified));
  const redeemed = await get(`/redeem/${token.token_id}`, shopper);
  check("redeem screen shows the stamp", redeemed.body.includes("stamp") && redeemed.body.includes("Coupon accepted."));
  check("QR is gone after redemption", !redeemed.body.includes("QR code for staff to scan"));
  const history = await get("/history", shopper);
  check("history lists it with business and store", history.body.includes(`Page test shop ${run}`) && history.body.includes("North store"));
  const dash = await get("/merchant", owner);
  check("dashboard shows redemption stats", dash.body.includes("Redemptions") && dash.body.includes("Page test pastry"));
  const list = await get("/merchant/coupons?view=live", owner);
  check("coupon list shows 1 of 50 redeemed", list.body.includes("1 of 50 redeemed"));

  console.log("\nRules and offer kinds on the page");
  const chicagoDay =
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
      new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(new Date()),
    ) + 1;
  const otherDay = (chicagoDay % 7) + 1;
  const dayName = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][otherDay - 1];
  const insertCoupon = (fields) =>
    admin
      .from("coupons")
      .insert({
        business_id: shop.id,
        category_id: categoryId,
        starts_at: new Date(Date.now() - 3_600_000).toISOString(),
        expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        status: "published",
        ...fields,
      })
      .select()
      .single()
      .then((r) => must(r, "rule coupon"));
  const scheduled = await insertCoupon({
    title: "Lunch special",
    discount_type: "percent",
    discount_value: 20,
    per_user_limit: null,
    redeem_frequency: "day",
    schedule_days: [otherDay],
    schedule_start: "11:00",
    schedule_end: "15:00",
  });
  const sched = await get(`/coupon/${scheduled.id}`, shopper);
  check("the ticket states the schedule", sched.body.includes(`Available ${dayName}s, 11am to 3pm`), dayName);
  check("the ticket states the per-customer rule", sched.body.includes("Once a day per customer"));
  // The schedule day is tomorrow's weekday, so it opens tomorrow at 11am.
  check(
    "Redeem is greyed out with when it is next available",
    /<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Get my coupon/s.test(sched.body) && sched.body.includes("Available tomorrow at 11am"),
  );
  const free = await insertCoupon({ title: "Free cookie", discount_type: "free", discount_value: null });
  const fixed = await insertCoupon({ title: "Regular coffee", discount_type: "fixed_price", discount_value: 1 });
  check("a free offer reads FREE", (await get(`/coupon/${free.id}`)).body.includes(">FREE<"));
  check("a fixed price offer reads ONLY $1", (await get(`/coupon/${fixed.id}`)).body.includes("ONLY $1"));
  const signedOut = await get(`/coupon/${free.id}`);
  check("signed out, Get my coupon and Save for later are buttons that open the sign-in sheet", signedOut.body.includes("Get my coupon") && signedOut.body.includes("Save for later") && !signedOut.body.includes("Sign in to redeem"));

  console.log("\nNear me: location in a short-lived cookie, never in the address");
  const near = await callAction(base, null, "src/app/search/actions.ts", "setNearMe", [{ lat: 47.60621, lng: -122.33207 }]);
  const nearCookie = (near.rawCookies ?? []).find((c) => c.startsWith("cpv_near=")) ?? "";
  check("Near me saves the rounded location (3 decimal places) in the cpv_near cookie", near.value?.ok === true && /^cpv_near=47\.606(%2C|,)-122\.332;/.test(nearCookie), nearCookie);
  check("the cookie is HttpOnly, SameSite=Lax, site-wide, and lasts 30 minutes", /HttpOnly/i.test(nearCookie) && /SameSite=lax/i.test(nearCookie) && /Path=\//.test(nearCookie) && /Max-Age=1800/.test(nearCookie), nearCookie);
  const bad = await callAction(base, null, "src/app/search/actions.ts", "setNearMe", [{ lat: 200, lng: 0 }]);
  check("an impossible location is refused and sets no cookie", bad.value?.ok === false && !(bad.rawCookies ?? []).some((c) => c.startsWith("cpv_near=")), bad);
  const nearPage = await fetch(`${base}/search?near=1&sort=nearest`, { headers: { cookie: near.setCookies.find((c) => c.startsWith("cpv_near=")) ?? "" } });
  const nearBody = (await nearPage.text()).replaceAll("<!-- -->", "");
  check("search uses it: within 25 miles, sorted nearest", nearBody.includes("Showing deals within 25 miles of you."));
  check("and no coordinates appear in the page or its links", !/[?&;](lat|lng)=/.test(nearBody) && !nearBody.includes("47.606") && !nearBody.includes("-122.332"));
  const expired = await get("/search?near=1&sort=nearest");
  check("without the cookie (after 30 minutes), search asks to tap Near me again", expired.body.includes("Your location has expired") && !expired.body.includes("within 25 miles"));
  const oldLink = await get("/search?lat=47.606&lng=-122.332&sort=nearest");
  check("coordinates in an old-style address are ignored", !oldLink.body.includes("within 25 miles"));
}

async function cleanup() {
  for (const id of created.businesses) await admin.from("businesses").delete().eq("id", id);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
}

try {
  await main();
} catch (error) {
  failed += 1;
  console.error("\nStopped early:", error.message);
} finally {
  await cleanup();
  console.log(`\n${passed} passed, ${failed} failed. Test data removed.`);
  process.exit(failed ? 1 : 0);
}
