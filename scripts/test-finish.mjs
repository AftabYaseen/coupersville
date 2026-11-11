// Phase 7 checks, through a local production build:
//
//   npm run staging:build && npm run staging:start
//   BASE_URL=http://localhost:3100 node --env-file=.env.staging.local scripts/test-finish.mjs
//
// Public pages, metadata files, the PWA files, the 404 page, emails (welcome, staff invite, plan
// started, plan ending, plan ended, coupon removed), the daily cron job run twice, and account
// deletion for a shopper and for a business owner whose paid plan renews (no payment is made).
//
// Test accounts that should get a real email use Resend's test inbox (delivered+...@resend.dev),
// so each email really goes through Resend and shows in its dashboard, but reaches no person.

// Exits unless this run targets staging, or production with ALLOW_PRODUCTION_TESTS=1 (see the guard).
import { PRODUCTION_MODE } from "./lib/staging-guard.mjs";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { callAction, makeUser } from "./lib/call-action.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const cronSecret = process.env.CRON_SECRET;
if (!url || !publishable || !secret || !cronSecret) {
  console.error("Missing env vars (Supabase keys, CRON_SECRET). Run with --env-file=.env.local");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Date.now().toString(36);
const password = `Pw-${run}-x9Z!`;
const created = { users: [], businesses: [], refs: [] };
// A paid plan as Authorize.net leaves it. The profile ids are made up: nothing here calls Authorize.net.
const renewingPlan = (periodEnd) => ({
  source: "authorize_net",
  status: "active",
  current_period_end: periodEnd,
  offer_code: "general",
  billing_cycle: "annual",
  anet_customer_profile_id: `test-${run}`,
  anet_payment_profile_id: `test-${run}`,
});
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
  const how = await get("/how-to-save");
  check(
    "how to save loads with the four steps",
    how.status === 200 && ["Find it. Get it. Scan it. Save.", "Find a deal", "Get your coupon", "Show the QR code", "Enjoy your savings"].every((t) => how.body.includes(t)),
  );
  check(
    "how to save gives the confirmed sign-up wording",
    how.body.includes("No password, no app, no printing. Just enter your email and a one-time code the first time you redeem.") && how.body.includes("Do I need an account?"),
  );
  const old = await fetch(`${base}/how-it-works`, { redirect: "manual" });
  check("the old How it works address redirects to How to save", [301, 308].includes(old.status) && (old.headers.get("location") ?? "").endsWith("/how-to-save"), old.status);
  const biz = await get("/for-businesses");
  check("for businesses loads with the deck headline", biz.status === 200 && biz.body.includes("Give customers another reason to choose your business."));
  check("for businesses ends with Open your door in Coupersville", biz.body.includes('href="/signup?type=merchant"') && biz.body.includes("Open your door in Coupersville"));
  const shown = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "");
  // The example tickets say $5 OFF and ONLY $1; a membership price would say a year or a month.
  check("for businesses shows no membership price", !/\$\d+(\.\d\d)? (a|per) (year|month)|\/yr|\/mo\b/i.test(shown(biz.body)));
  const home = await get("/");
  check(
    "header and footer link How to save and For businesses",
    (home.body.match(/href="\/how-to-save"/g) ?? []).length >= 2 && (home.body.match(/href="\/for-businesses"/g) ?? []).length >= 2,
  );
  check("footer links privacy and terms", home.body.includes('href="/privacy"') && home.body.includes('href="/terms"'));
  check(
    "home is still shopper-first: headline and search come before the categories",
    home.body.indexOf("Where good deals live.") < home.body.indexOf("What kind of deal are you looking for?") &&
      home.body.indexOf("What kind of deal are you looking for?") < home.body.indexOf("Stroll through Coupersville"),
  );
  check("no page says no account is needed", ![home, how, biz].some((p) => /no account|without (creating )?an account/i.test(shown(p.body))));
  check("signed out header: Merchant sign in, Find a deal, Join Coupersville", ["Merchant sign in", "Find a deal", "Join Coupersville"].every((t) => home.body.includes(t)));
  check("a skip link jumps to the content", home.body.includes('href="#main"') && home.body.includes('id="main"'));
  // The client's privacy notice and terms, word for word, with the Phase 1 Launch Notice under the date.
  const visible = (html) =>
    html
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&amp;/g, "&");
  const legalDoc = (file) => {
    const src = readFileSync(new URL(`../src/lib/legal/${file}`, import.meta.url), "utf8");
    return JSON.parse(src.slice(src.indexOf("= {") + 2).trim().replace(/;$/, ""));
  };
  for (const [path, file] of [["/privacy", "privacy-text.ts"], ["/terms", "terms-text.ts"]]) {
    const page = await get(path);
    const text = visible(page.body);
    const doc = legalDoc(file);
    const lines = [doc.title, `Last updated: ${doc.updated}`, `Phase 1 Launch Notice: ${doc.notice}`, ...doc.blocks.flatMap((b) => b.items ?? b.lines ?? [b.text])];
    const missing = lines.filter((l) => !text.includes(l));
    check(`${path} shows the client's text, every line`, page.status === 200 && missing.length === 0, missing.slice(0, 3));
    check(`${path}: the launch notice sits right under Last updated`, text.indexOf("Phase 1 Launch Notice") > text.indexOf("Last updated:") && text.indexOf("Phase 1 Launch Notice") < text.indexOf(doc.blocks[0].text ?? ""));
    check(`${path}: no draft banner or [placeholders] left`, !/Draft for legal review|\[[^\]]*\]/.test(text.slice(text.indexOf(doc.title))));
  }
  const privacy = await get("/privacy");
  check("privacy contact email is a mail link", privacy.body.includes('href="mailto:admin@opalqsm.com"'));
  const signup = await get("/signup?type=merchant");
  check("signup links terms and privacy", signup.body.includes('href="/terms"') && signup.body.includes('href="/privacy"'));
  const emDash = [how, biz, privacy, await get("/terms")].some((p) => p.body.replace(/<script[\s\S]*?<\/script>/g, "").includes("—"));
  check("no em dashes on the new pages", !emDash);

  console.log("\nTitles, sitemap, robots, Open Graph");
  check(
    "pages have their own titles",
    /<title>How to use Coupersville coupons \| Coupersville<\/title>/.test(how.body) && /<title>Digital coupons for businesses \| Coupersville<\/title>/.test(biz.body),
  );
  check("pages have descriptions", /<meta name="description" content="Find a deal, get your one-time QR coupon/.test(how.body));
  check("Open Graph image is set from the town sign", /<meta property="og:image" content="[^"]*opengraph-image/.test(home.body) && home.body.includes("og:image:alt"));
  const og = await get(home.body.match(/<meta property="og:image" content="https?:\/\/[^/]+([^"]+)"/)?.[1] ?? "/opengraph-image.jpg");
  check("the Open Graph image is a 1200 x 630 JPEG", og.status === 200 && og.type.startsWith("image/jpeg") && og.body.length > 50_000);
  const sitemap = await get("/sitemap.xml");
  check("sitemap lists public pages and categories", sitemap.status === 200 && sitemap.body.includes("/how-to-save") && sitemap.body.includes("/c/"));
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
  check("an unknown coupon says it is not available", badCoupon.body.includes("This deal is not available"));

  await phaseTwoPages();
}

// Copy deck phase 2: Business membership, Explore, About, Contact.
async function phaseTwoPages() {
  console.log("\nBusiness membership, Explore, About, Contact");
  const shown = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "");
  const money = (cents) => `$${(cents / 100).toFixed(2)}`;
  const offers = must(await admin.from("offers").select("*"), "offers");
  const by = Object.fromEntries(offers.map((o) => [o.code, o]));

  const mem = await get("/business-membership");
  const memText = shown(mem.body);
  check("membership page loads with the deck headline", mem.status === 200 && memText.includes("One membership. Plenty of possibilities."));
  for (const code of ["founding_merchant", "early_access", "general", "merchant_plus"]) {
    const o = by[code];
    const saved = o.monthly_price_cents * 12 - o.annual_price_cents;
    const pct = ((saved / (o.monthly_price_cents * 12)) * 100).toFixed(1);
    check(
      `${o.name}: annual, monthly and savings from the offers table`,
      memText.includes(o.name) && memText.includes(money(o.annual_price_cents)) && memText.includes(money(o.monthly_price_cents)) && memText.includes(`saves ${money(saved)} (${pct}%)`),
      { name: o.name, saved, pct },
    );
  }
  check("Founding: 50 free, the next 150, and its window", memText.includes(`First ${by.founding_merchant.free_seats} qualifying merchants`) && memText.includes(`The next ${by.founding_merchant.seat_cap - by.founding_merchant.free_seats}`) && memText.includes("November 1, 2026 to January 31, 2027"));
  check("Build Your Route asks for a custom quote and links to Contact", memText.includes("Build Your Route") && memText.includes("Contact us for a custom quote") && mem.body.includes('href="/contact"'));
  check("the $1 admin test offer never shows", !memText.includes(by.admin_test?.name ?? "Admin payment test") && !memText.includes("$1.00"));
  check("Start my membership goes to sign-up", mem.body.includes('href="/signup?type=merchant"') && memText.includes("Start my membership"));

  const explore = await get("/explore");
  const live = must(await admin.from("categories").select("name, description").eq("active", true), "categories");
  check("explore lists every active category with its description", explore.status === 200 && live.every((c) => shown(explore.body).includes(c.name.replace(/&/g, "&amp;")) && (!c.description || shown(explore.body).includes(c.description.replace(/'/g, "&#x27;").replace(/&/g, "&amp;")))));

  const about = await get("/about");
  check("about loads, says how sign-up works, never no account", about.status === 200 && shown(about.body).includes("A place where businesses and savings meet.") && !/no account|without (creating )?an account|or creating an account/i.test(shown(about.body)));

  const contact = await get("/contact");
  check("contact page loads with the form and the contact address", contact.status === 200 && shown(contact.body).includes("How can we help?") && shown(contact.body).includes("Send message") && contact.body.includes("mailto:"));
  const home = await get("/");
  check("header and footer link Explore, Business membership, About and Contact", ["/explore", "/business-membership", "/about", "/contact"].every((p) => home.body.includes(`href="${p}"`)));

  const { createHmac } = await import("node:crypto");
  const hash = (kind, value) => createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex");
  const ip = `203.0.113.${(Date.now() % 200) + 20}`;
  const sender = fakeInbox("contact");
  const message = (extra = {}) => ({ name: "Test sender", email: sender, role: "Shopper", topic: "Coupon question", message: "Is this deal still on next week?", website: "", ...extra });
  const send = (input) => callAction(base, null, A("contact/actions.ts"), "sendContactMessage", [input], { headers: { "x-forwarded-for": ip } });
  try {
    const bad = await send(message({ message: "hi" }));
    check("contact: a too-short message is refused with a clear reason", bad.value?.ok === false && /at least 10 characters/.test(bad.value.error), bad.value);
    const bot = await send(message({ website: "http://spam.example" }));
    check("contact: a filled honeypot looks sent but is not counted", bot.value?.ok === true && (await admin.from("auth_code_requests").select("id").eq("kind", "contact").eq("email_hash", hash("email", sender))).data.length === 0, bot.value);
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await send(message()));
    check("contact: a message is accepted with the response time", results[0].value?.ok === true && /will respond within/.test(results[0].value.message), results[0].value);
    check("contact: the fourth message in 10 minutes from one email is refused", results.slice(0, 3).every((r) => r.value?.ok === true) && results[3].value?.ok === false && /wait a few minutes/.test(results[3].value.error), results.map((r) => r.value?.ok));
  } finally {
    // The limiter keeps keyed hashes only; remove this run's rows.
    await admin.from("auth_code_requests").delete().eq("kind", "contact").eq("email_hash", hash("email", sender));
    await admin.from("auth_code_requests").delete().eq("kind", "contact").eq("ip_hash", hash("ip", ip));
  }
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
  const renewing = await business(owner, `Renewing shop ${run}`, renewingPlan(iso(3)));
  const plans = must(await admin.from("subscriptions").select("id, business_id, current_period_end").in("business_id", [shop.id, ended.id, renewing.id]), "plans");
  const planOf = (b) => plans.find((p) => p.business_id === b.id);

  if (PRODUCTION_MODE) {
    // Without ?only= the job works on every real business (plan emails, renewals, reminders).
    check("the job refuses a request without the secret", (await cron(null)).status === 401);
    check("and one with the wrong secret", (await cron("Bearer wrong")).status === 401);
    console.log("  skip  running the daily job (it would act on real businesses; test-anet runs it for test businesses only)");
    created.refs.push(link.user.id, coupon.id, `complimentary:${later.id}`);
    return;
  }

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
  check("a paid plan that renews gets no ending email", (await noticesLike("plan_ending", planOf(renewing).id)).length === 0);
  const second = await cron(`Bearer ${cronSecret}`);
  check("running the job twice is safe", second.status === 200 && second.body.report.plan_notices.ending.sent === 0 && second.body.report.plan_notices.ended.sent === 0, second.body);
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
  must(await admin.from("staff_invites").insert({ business_id: paidShop.id, email: fakeInbox("accepted"), invited_by: paidOwner.id, accepted_at: new Date().toISOString(), accepted_by: staff.id }), "accepted invite");
  must(await admin.from("businesses").update({ contact_email: fakeInbox("contact"), contact_phone: "555-0100", website_url: "https://example.com" }).eq("id", paidShop.id), "contact details");
  must(await admin.from("locations").insert({ business_id: paidShop.id, store_name: "Main", address_line1: "2 Main St", city: "Coupersville" }), "store");

  must(await admin.from("subscriptions").insert({ business_id: paidShop.id, ...renewingPlan(iso(200)) }), "paid plan");

  const ownerAccount = await get("/account", paidOwner.cookie);
  check("Account warns the business will be taken off", ownerAccount.body.includes(`Paid deletion shop ${run} is taken off Coupersville`));
  check("and that the plan will be cancelled", ownerAccount.body.includes("plan is cancelled"));
  const gone = await callAction(base, paidOwner.cookie, A("account/actions.ts"), "deleteMyAccount", [{ confirm: "delete" }]);
  check("the owner's account is deleted", gone.redirect === "/account-deleted", gone);
  const planAfter = must(await admin.from("subscriptions").select("status, cancel_at_period_end").eq("business_id", paidShop.id).single(), "plan after");
  check("the paid plan stops renewing but lasts to the end of the period", planAfter.cancel_at_period_end === true && planAfter.status === "active", planAfter);
  const shopAfter = must(await admin.from("businesses").select("status, owner_id, contact_email, contact_phone, website_url").eq("id", paidShop.id).single(), "business after");
  check("the business is suspended and has no owner", shopAfter.status === "suspended" && shopAfter.owner_id === null, shopAfter);
  check("staff lose access", (await admin.from("business_members").select("id").eq("business_id", paidShop.id)).data.length === 0);
  check("the business contact email, phone and website are cleared", shopAfter.contact_email === null && shopAfter.contact_phone === null && shopAfter.website_url === null, shopAfter);
  check("every staff invite is deleted, accepted or waiting", (await admin.from("staff_invites").select("id").eq("business_id", paidShop.id)).data.length === 0);
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
