// Phase 7 checks, through a local production build:
//
//   npm run build && npx next start -p 3100
//   BASE_URL=http://localhost:3100 node --env-file=.env.local scripts/test-finish.mjs
//
// Public pages, metadata files, the PWA files, the 404 page, emails (welcome, staff invite, plan
// started, plan ending, plan ended, coupon removed), the daily cron job run twice, and account
// deletion for a shopper and for a business owner with a Stripe plan (test mode only).
//
// Test accounts that should get a real email use Resend's test inbox (delivered+...@resend.dev),
// so each email really goes through Resend and shows in its dashboard, but reaches no person.

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { callAction, makeUser } from "./lib/call-action.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const cronSecret = process.env.CRON_SECRET;
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!url || !publishable || !secret || !cronSecret) {
  console.error("Missing env vars (Supabase keys, CRON_SECRET). Run with --env-file=.env.local");
  process.exit(1);
}
const stripe = stripeKey?.startsWith("sk_test_") ? new Stripe(stripeKey) : null;

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Date.now().toString(36);
const password = `Pw-${run}-x9Z!`;
const created = { users: [], businesses: [], refs: [], stripe: [] };
const DAY = 86_400_000;
const iso = (days) => new Date(Date.now() + days * DAY).toISOString();

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`);
  }
}
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

const A = (file) => `src/app/${file}`;
const realInbox = (label) => `delivered+cpv-test-${run}-${label}@resend.dev`;
const fakeInbox = (label) => `cpv-test-${run}-${label}@example.com`;

async function user(label, role, email = fakeInbox(label)) {
  const u = await makeUser({ url, publishable, admin, email, password, role, fullName: `Test ${label}` });
  created.users.push(u.id);
  return u;
}

async function business(owner, name, plan) {
  const b = must(await admin.from("businesses").insert({ owner_id: owner.id, name, status: "active", timezone: "America/Denver" }).select().single(), "business");
  created.businesses.push(b.id);
  if (plan) must(await admin.from("subscriptions").insert({ business_id: b.id, ...plan }), "plan");
  return b;
}

const notice = async (kind, ref) => (await admin.from("email_notices").select("kind").eq("kind", kind).eq("ref", ref)).data ?? [];
const noticesLike = async (kind, prefix) => (await admin.from("email_notices").select("ref").eq("kind", kind).like("ref", `${prefix}%`)).data ?? [];

async function get(path, cookie) {
  const response = await fetch(`${base}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const type = response.headers.get("content-type") ?? "";
  const body = type.startsWith("image/") ? Buffer.from(await response.arrayBuffer()) : await response.text();
  return { status: response.status, type, body };
}

const cron = (auth) => fetch(`${base}/api/cron/daily`, { headers: auth ? { authorization: auth } : {} }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

async function pages() {
  console.log("\nPublic pages");
  const how = await get("/how-it-works");
  check("how it works loads with the four steps", how.status === 200 && ["Browse deals", "Sign up once", "Redeem with QR", "Save instantly"].every((t) => how.body.includes(t)));
  check("how it works says over a dozen categories, not dozens", how.body.includes("Over a dozen categories") && !/\bdozens\b/i.test(how.body));
  const biz = await get("/for-businesses");
  check("for businesses loads with the promise line", biz.status === 200 && biz.body.includes("No approvals. No commissions. No complicated setup."));
  check("for businesses ends with Create a business account", biz.body.includes('href="/signup?type=merchant"') && biz.body.includes("Create a business account"));
  check("for businesses has the pricing spot and no price", biz.body.includes("Pricing is coming soon") && !/a year|per year|\/yr/i.test(biz.body));
  const home = await get("/");
  check("header and footer link both pages", (home.body.match(/href="\/how-it-works"/g) ?? []).length >= 2 && (home.body.match(/href="\/for-businesses"/g) ?? []).length >= 2);
  check("footer links privacy and terms", home.body.includes('href="/privacy"') && home.body.includes('href="/terms"'));
  check("home is still shopper-first: welcome and search come first", home.body.indexOf("Welcome to Coupersville") < home.body.indexOf("Main Street"));
  check("a skip link jumps to the content", home.body.includes('href="#main"') && home.body.includes('id="main"'));
  for (const path of ["/privacy", "/terms"]) {
    const page = await get(path);
    check(`${path} loads, marked as a draft for the lawyer`, page.status === 200 && page.body.includes("Draft for legal review"));
  }
  const privacy = await get("/privacy");
  check("privacy covers the facts the client listed", ["Your email address", "add one in Account", "coupons you save", "Your redemptions", "never your name or email", "no advertising, analytics or tracking", "payment processor", "IP address and browser details", "delete your account"].every((t) => privacy.body.includes(t)));
  const signup = await get("/signup?type=merchant");
  check("signup links terms and privacy", signup.body.includes('href="/terms"') && signup.body.includes('href="/privacy"'));
  const emDash = [how, biz, privacy, await get("/terms")].some((p) => p.body.replace(/<script[\s\S]*?<\/script>/g, "").includes("—"));
  check("no em dashes on the new pages", !emDash);

  console.log("\nTitles, sitemap, robots, Open Graph");
  check("pages have their own titles", /<title>How it works \| Coupersville<\/title>/.test(how.body) && /<title>For businesses \| Coupersville<\/title>/.test(biz.body));
  check("pages have descriptions", /<meta name="description" content="Browse coupons/.test(how.body));
  check("Open Graph image is set from the town sign", /<meta property="og:image" content="[^"]*opengraph-image/.test(home.body) && home.body.includes("og:image:alt"));
  const og = await get(home.body.match(/<meta property="og:image" content="https?:\/\/[^/]+([^"]+)"/)?.[1] ?? "/opengraph-image.jpg");
  check("the Open Graph image is a 1200 x 630 JPEG", og.status === 200 && og.type.startsWith("image/jpeg") && og.body.length > 50_000);
  const sitemap = await get("/sitemap.xml");
  check("sitemap lists public pages and categories", sitemap.status === 200 && sitemap.body.includes("/how-it-works") && sitemap.body.includes("/c/"));
  const live = (await admin.from("live_coupons").select("id").limit(1)).data?.[0];
  check("sitemap lists live coupons", !live || sitemap.body.includes(`/coupon/${live.id}`));
  const robots = await get("/robots.txt");
  check("robots keeps private areas out and points at the sitemap", robots.body.includes("Disallow: /merchant") && robots.body.includes("Disallow: /admin") && robots.body.includes("sitemap.xml"));

  console.log("\nPWA");
  const manifest = await get("/manifest.webmanifest");
  const m = JSON.parse(manifest.body);
  check("manifest: name, standalone, ink theme colour", m.name === "Coupersville" && m.display === "standalone" && m.theme_color === "#1B2A8F");
  for (const icon of m.icons) {
    const file = await get(icon.src);
    check(`icon ${icon.src} is a PNG`, file.status === 200 && file.type === "image/png" && file.body.length > 500);
  }
  check("there is a maskable icon", m.icons.some((i) => i.purpose === "maskable"));
  check("theme colour meta tag", home.body.includes('name="theme-color" content="#1B2A8F"'));
  check("favicon and apple icon are linked", /rel="icon" href="\/icon/.test(home.body) && /rel="apple-touch-icon" href="\/apple-icon/.test(home.body));
  for (const path of ["/icon", "/apple-icon"]) {
    const file = await get((home.body.match(new RegExp(`href="(${path}[^"]*)"`)) ?? [])[1] ?? path);
    check(`${path} renders`, file.status === 200 && file.type === "image/png");
  }
  const sw = await get("/sw.js");
  check("service worker is served", sw.status === 200 && sw.body.includes("offline.html"));
  const offline = await get("/offline.html");
  check("offline page is branded and self-contained", offline.status === 200 && offline.body.includes("You are offline") && offline.body.includes("@font-face") && !/<script|src="http/.test(offline.body));

  console.log("\nNot found");
  const missing = await get(`/no-such-page-${run}`);
  check("an unknown address gets a branded 404", missing.status === 404 && missing.body.includes("This page is not in town"));
  const badCoupon = await get("/coupon/00000000-0000-4000-8000-000000000000");
  check("an unknown coupon says it is not available", badCoupon.body.includes("This coupon is not available"));
}

async function emails() {
  console.log("\nWelcome email");
  const email = realInbox("newshopper");
  const link = must(await admin.auth.admin.generateLink({ type: "magiclink", email }), "magic link");
  created.users.push(link.user.id);
  const verify = await callAction(base, null, A("(auth)/code-actions.ts"), "verifySignInCode", [{ email, code: link.properties.email_otp }], {
    headers: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 20}` },
  });
  check("a new shopper signs in with a code", verify.value?.ok === true, verify.value);
  check("they get one welcome email", (await notice("welcome", link.user.id)).length === 1);
  const again = await admin.auth.admin.generateLink({ type: "magiclink", email });
  await callAction(base, null, A("(auth)/code-actions.ts"), "verifySignInCode", [{ email, code: again.data.properties.email_otp }], {
    headers: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 20}` },
  });
  check("signing in again does not send a second one", (await notice("welcome", link.user.id)).length === 1);

  console.log("\nStaff invite email");
  const owner = await user("owner", "merchant", realInbox("owner"));
  const shop = await business(owner, `Email test shop ${run}`, { source: "complimentary", status: "active", current_period_end: iso(3) });
  const invite = await callAction(base, owner.cookie, A("merchant/staff/actions.ts"), "inviteStaff", [{ email: realInbox("staff") }]);
  check("the invite is emailed (through Resend)", invite.value?.ok === true && /Invite emailed/.test(invite.value.message), invite.value);
  const staffPage = await get("/merchant/staff", owner.cookie);
  check("the copy link button is still there as a fallback", staffPage.body.includes("Copy invite link"));

  console.log("\nCoupon removed by Coupersville");
  const boss = await user("admin", "admin");
  const categoryId = must(await admin.from("categories").select("id").eq("active", true).limit(1).single(), "category").id;
  const coupon = must(
    await admin
      .from("coupons")
      .insert({ business_id: shop.id, category_id: categoryId, title: `Email test coupon ${run}`, discount_type: "percent", discount_value: 10, starts_at: iso(-1), expires_at: iso(10), status: "published" })
      .select("id")
      .single(),
    "coupon",
  );
  const held = await callAction(base, boss.cookie, A("admin/coupons/actions.ts"), "holdCoupon", [coupon.id, "Test reason"]);
  check("admin unpublishes the coupon", held.value?.ok === true, held.value);
  check("the owner gets the coupon removed email", (await noticesLike("coupon_removed", coupon.id)).length === 1);

  console.log("\nComplimentary plan started");
  const later = await business(owner, `Later plan shop ${run}`, null);
  const grant = await callAction(base, boss.cookie, A("admin/subscriptions/actions.ts"), "setComplimentaryPlan", [later.id, ""]);
  check("admin grants a complimentary plan", grant.value?.ok === true, grant.value);
  const started = await noticesLike("plan_started", `complimentary:${later.id}`);
  check("the owner gets the plan started email", started.length === 1);
  await callAction(base, boss.cookie, A("admin/subscriptions/actions.ts"), "setComplimentaryPlan", [later.id, new Date(Date.now() + 40 * DAY).toISOString().slice(0, 10)]);
  check("changing the end date of a running plan does not email again", (await noticesLike("plan_started", `complimentary:${later.id}`)).length === 1);

  console.log("\nDaily job: plan ending and plan ended");
  const ended = await business(owner, `Ended plan shop ${run}`, { source: "complimentary", status: "active", current_period_end: iso(-2) });
  const renewing = await business(owner, `Renewing shop ${run}`, { source: "stripe", status: "active", current_period_end: iso(3), stripe_subscription_id: `sub_test_${run}` });
  const plans = must(await admin.from("subscriptions").select("id, business_id, current_period_end").in("business_id", [shop.id, ended.id, renewing.id]), "plans");
  const planOf = (b) => plans.find((p) => p.business_id === b.id);

  // The job reads every plan, and this may be the live database: never email a real merchant from a test.
  const window = must(
    await admin.from("subscriptions").select("business_id").gte("current_period_end", iso(-7)).lte("current_period_end", iso(7)),
    "plans in window",
  );
  const outsiders = window.filter((p) => !created.businesses.includes(p.business_id));
  if (outsiders.length) throw new Error(`${outsiders.length} real plan(s) end within 7 days; not running the daily job from a test`);

  check("the job refuses a request without the secret", (await cron(null)).status === 401);
  check("and one with the wrong secret", (await cron("Bearer wrong")).status === 401);
  const first = await cron(`Bearer ${cronSecret}`);
  check("the job runs with the secret", first.status === 200 && first.body?.ok === true, first);
  const endingRef = (b) => `${planOf(b).id}:${planOf(b).current_period_end}`;
  // Supabase returns timestamps in its own format; match on the plan id.
  check("plan ending in 3 days gets the ending email", (await noticesLike("plan_ending", planOf(shop).id)).length === 1, endingRef(shop));
  check("a plan that ended 2 days ago gets the ended email", (await noticesLike("plan_ended", planOf(ended).id)).length === 1);
  check("a Stripe plan that renews gets no ending email", (await noticesLike("plan_ending", planOf(renewing).id)).length === 0);
  const second = await cron(`Bearer ${cronSecret}`);
  check("running the job twice is safe", second.status === 200 && second.body.report.ending.sent === 0 && second.body.report.ended.sent === 0, second.body);
  check("still one email each", (await noticesLike("plan_ending", planOf(shop).id)).length === 1 && (await noticesLike("plan_ended", planOf(ended).id)).length === 1);
  created.refs.push(link.user.id, coupon.id, `complimentary:${later.id}`, planOf(shop).id, planOf(ended).id);
}

async function deletion() {
  console.log("\nShopper deletes their account");
  const owner = await user("delowner", "merchant");
  const shop = await business(owner, `Deletion shop ${run}`, { source: "complimentary", status: "active" });
  const store = must(await admin.from("locations").insert({ business_id: shop.id, store_name: "Main", address_line1: "1 Main St", city: "Coupersville" }).select("id").single(), "store");
  const categoryId = must(await admin.from("categories").select("id").eq("active", true).limit(1).single(), "category").id;
  const coupon = must(
    await admin
      .from("coupons")
      .insert({ business_id: shop.id, category_id: categoryId, title: `Deletion coupon ${run}`, discount_type: "amount", discount_value: 2, starts_at: iso(-1), expires_at: iso(10), status: "published", per_user_limit: null })
      .select("id")
      .single(),
    "coupon",
  );
  const shopper = await user("delshopper", "consumer");
  must(await admin.from("favorites").insert({ user_id: shopper.id, coupon_id: coupon.id }), "favorite");
  const tokenRows = must(await shopper.client.rpc("create_redemption_token", { p_coupon_id: coupon.id }), "token");
  const tok = Array.isArray(tokenRows) ? tokenRows[0] : tokenRows;
  const verified = must(await owner.client.rpc("verify_redemption", { p_token_or_code: tok.token, p_location_id: store.id }), "verify");
  const result = Array.isArray(verified) ? verified[0] : verified;
  check("setup: the shopper redeemed the coupon", (result?.result ?? result) === "ok" || JSON.stringify(result).includes("ok"), result);

  const account = await get("/account", shopper.cookie);
  check("Account offers Delete account", account.body.includes("Delete account"));
  const wrong = await callAction(base, shopper.cookie, A("account/actions.ts"), "deleteMyAccount", [{ confirm: "yes" }]);
  check("without typing delete, nothing happens", wrong.value?.ok === false && /Type delete/.test(wrong.value.error), wrong.value);
  check("the account is still there", Boolean((await admin.auth.admin.getUserById(shopper.id)).data.user));
  const done = await callAction(base, shopper.cookie, A("account/actions.ts"), "deleteMyAccount", [{ confirm: " Delete " }]);
  check("typing delete deletes the account and lands on the goodbye page", done.redirect === "/account-deleted", done);
  check("the sign-in is gone", !(await admin.auth.admin.getUserById(shopper.id)).data.user);
  check("the profile is gone", !(await admin.from("profiles").select("id").eq("id", shopper.id).maybeSingle()).data);
  check("saved coupons are gone", (await admin.from("favorites").select("id").eq("user_id", shopper.id)).data.length === 0);
  const kept = must(await admin.from("redemptions").select("user_id, coupon_id, verified_by").eq("coupon_id", coupon.id), "redemptions");
  check("the redemption is kept, with no link to the shopper", kept.length === 1 && kept[0].user_id === null, kept);
  const stats = must(await owner.client.rpc("business_redemption_stats", { p_business_id: shop.id }), "stats");
  check("the shop's count still includes it", JSON.stringify(stats).includes('"total":1') || stats?.total === 1, stats);
  const goodbye = await get("/account-deleted");
  check("the goodbye page loads signed out", goodbye.status === 200 && goodbye.body.includes("Your account is deleted"));

  console.log("\nAdmins cannot delete themselves here");
  const boss = await user("deladmin", "admin");
  const bossTry = await callAction(base, boss.cookie, A("account/actions.ts"), "deleteMyAccount", [{ confirm: "delete" }]);
  check("refused with a clear message", bossTry.value?.ok === false && /Admin accounts/.test(bossTry.value.error), bossTry.value);
  const adminAccount = await get("/account", boss.cookie);
  check("and Account does not offer it", !adminAccount.body.includes("Delete account"));

  console.log("\nBusiness owner with a paid plan deletes their account");
  const paidOwner = await user("paidowner", "merchant");
  const paidShop = await business(paidOwner, `Paid deletion shop ${run}`, null);
  const staff = await user("delstaff", "consumer");
  must(await admin.from("business_members").insert({ business_id: paidShop.id, user_id: staff.id, role: "staff" }), "staff member");
  must(await admin.from("staff_invites").insert({ business_id: paidShop.id, email: fakeInbox("pending"), invited_by: paidOwner.id }), "invite");
  must(await admin.from("locations").insert({ business_id: paidShop.id, store_name: "Main", address_line1: "2 Main St", city: "Coupersville" }), "store");

  let sub = null;
  if (stripe) {
    const customer = await stripe.customers.create({ email: fakeInbox("paidowner"), payment_method: "pm_card_visa", invoice_settings: { default_payment_method: "pm_card_visa" } });
    created.stripe.push(customer.id);
    sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: process.env.STRIPE_ANNUAL_PRICE_ID }] });
    must(
      await admin.from("subscriptions").insert({
        business_id: paidShop.id,
        source: "stripe",
        status: "active",
        stripe_customer_id: customer.id,
        stripe_subscription_id: sub.id,
        current_period_end: new Date(sub.items.data[0].current_period_end * 1000).toISOString(),
      }),
      "paid plan",
    );
  } else {
    console.log("  skip  Stripe plan cancel (no test-mode Stripe key)");
  }

  const ownerAccount = await get("/account", paidOwner.cookie);
  check("Account warns the business will be taken off", ownerAccount.body.includes(`Paid deletion shop ${run} is taken off Coupersville`));
  if (stripe) check("and that the plan will be cancelled", ownerAccount.body.includes("plan is cancelled"));
  const gone = await callAction(base, paidOwner.cookie, A("account/actions.ts"), "deleteMyAccount", [{ confirm: "delete" }]);
  check("the owner's account is deleted", gone.redirect === "/account-deleted", gone);
  if (stripe) {
    const after = await stripe.subscriptions.retrieve(sub.id);
    check("the Stripe plan is set to cancel at the end of the period, not now", after.cancel_at_period_end === true && after.status === "active", { status: after.status, cancel: after.cancel_at_period_end });
  }
  const shopAfter = must(await admin.from("businesses").select("status, owner_id").eq("id", paidShop.id).single(), "business after");
  check("the business is suspended and has no owner", shopAfter.status === "suspended" && shopAfter.owner_id === null, shopAfter);
  check("staff lose access", (await admin.from("business_members").select("id").eq("business_id", paidShop.id)).data.length === 0);
  check("waiting invites are cancelled", (await admin.from("staff_invites").select("id").eq("business_id", paidShop.id)).data.length === 0);
  check("the staff member's own account is untouched", Boolean((await admin.auth.admin.getUserById(staff.id)).data.user));
  const listed = must(await boss.client.rpc("admin_list_businesses", { p_query: `Paid deletion shop ${run}` }), "admin list");
  check("admin still sees the business, owner marked as deleted", listed.length === 1 && listed[0].owner_email === null, listed);
}

async function cleanup() {
  if (created.businesses.length) await admin.from("businesses").delete().in("id", created.businesses);
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of data?.users ?? []) if (u.email?.includes(`cpv-test-${run}-`)) created.users.push(u.id);
  for (const id of new Set(created.users)) await admin.auth.admin.deleteUser(id);
  for (const ref of created.refs) await admin.from("email_notices").delete().like("ref", `%${ref}%`);
  if (stripe) for (const id of created.stripe) await stripe.customers.del(id).catch(() => {});
}

try {
  await pages();
  await emails();
  await deletion();
} catch (error) {
  failed += 1;
  console.error("\nStopped early:", error.message);
} finally {
  await cleanup();
  console.log(`\n${passed} passed, ${failed} failed. Test data removed.`);
  process.exit(failed ? 1 : 0);
}
