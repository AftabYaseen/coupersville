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
  check(
    "dashboard shows redemption stats",
    dash.body.includes("Redemptions") && dash.body.includes("Page test pastry"),
    `${dash.status} ${dash.location} redemptions:${dash.body.includes("Redemptions")} pastry:${dash.body.includes("Page test pastry")} length:${dash.body.length}`,
  );
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

  await phaseThree({ shop, owner, categoryId, insertCoupon, storeA, pastry: coupon });
  await nearMe();
  await roundThree();
  await pioneerAndFaq(owner);
}

// Client request (2026-11-11): the Pioneer Circle page, the welcome step, and the FAQ page.
async function pioneerAndFaq(plainOwner) {
  const founding = must(await admin.from("offers").select("name, seat_cap, free_seats").eq("code", "founding_merchant").single(), "founding");
  const name = founding.name;
  const first = founding.seat_cap ? `first ${founding.seat_cap}` : "first";

  console.log("\nPioneer Circle page");
  const pc = await get("/pioneer-circle");
  check("/pioneer-circle is public", pc.status === 200);
  check("its name and seat count come from the offers table", pc.body.includes(`Coupersville ${name}`) && pc.body.includes(`The ${first}. The beginning of something bigger.`));
  check(
    "it carries the client's sections, Honorary Pioneer included",
    ["What we ask of our Pioneers", "What you can expect from us", "When life and business happen", "Coupersville Honorary Pioneer", "Completing your Pioneer year", "The Pioneer spirit"].every((t) => pc.body.includes(t)),
  );
  // Our factual note, numbers from the offers table (the current figures: 200 places, 50 free).
  const note =
    founding.seat_cap && founding.free_seats > 0 && founding.free_seats < founding.seat_cap - 1
      ? `The ${name} has ${founding.seat_cap} places. The first ${founding.free_seats} Pioneers receive a complimentary year; Pioneers ${founding.free_seats + 1} to ${founding.seat_cap} join at the ${name} rate.`
      : null;
  if (note) check("the page has the places note, with numbers from the offers table", pc.body.includes(note), note);
  check("nothing to sign and no checkbox", pc.body.includes("nothing to sign") && !pc.body.includes('type="checkbox"'));
  check("no em dashes", !pc.body.includes("—"));

  console.log("\nLinks to the Pioneer Circle and FAQ pages");
  const home = await get("/");
  check("footer links to the Pioneer Circle (named from the table) and the FAQ", /href="\/pioneer-circle"[^>]*>[^<]*<\/a>/.test(home.body) && home.body.includes(`>${name}</a>`) && home.body.includes('href="/faq"'));
  const callout = must(await admin.from("offers").select("active, window_ends_at").eq("code", "founding_merchant").single(), "window");
  const open = callout.active && new Date(callout.window_ends_at).getTime() > Date.now();
  if (open) {
    check("home callout links to the Pioneer Circle", home.body.includes(`About the ${name}`));
    check("For businesses callout links to the Pioneer Circle", (await get("/for-businesses")).body.includes(`for what we ask of our Pioneers`));
  }
  const membership = await get("/business-membership");
  if (open) check("Business membership links to the Pioneer Circle from its level", membership.body.includes(`What it means to join the ${name}`));
  check("Business membership links to the FAQ", membership.body.includes('href="/faq"'));
  check("How to save links to the FAQ", (await get("/how-to-save")).body.includes('href="/faq"'));

  console.log("\nFAQ page");
  const faq = await get("/faq");
  check("/faq is public", faq.status === 200);
  check(
    "grouped under the client's headings",
    ["About Coupersville", "For shoppers", "For businesses", `Coupersville ${name}`, "Privacy and marketing", "Still have questions?"].every((t) => faq.body.includes(t)),
  );
  check("questions are collapsible", (faq.body.match(/<details/g) ?? []).length >= 30, (faq.body.match(/<details/g) ?? []).length);
  check("correction: free for shoppers", faq.body.includes("No. Coupersville is free for shoppers."));
  check(
    "correction: accounts",
    faq.body.includes("You can browse Coupersville without an account. To save or redeem a coupon, sign up with your email and a one-time code. No password needed."),
  );
  check(
    "correction: redeeming",
    faq.body.includes("When you are at the business and ready, tap Get my coupon to create your one-time QR code, then show it to the staff to scan. Each coupon page lists its limits, locations and expiry date."),
  );
  check(
    "the replaced answers are gone",
    !faq.body.includes("Some Coupersville features may require") && !faq.body.includes("Redemption instructions may vary") && !faq.body.includes("designed to make discovering coupons"),
  );
  check("coupon kinds include fixed-price offers and free items or services", faq.body.includes("Fixed-price offers") && faq.body.includes("Free items or services"));
  check("Pioneer answers use the table's name and seat count", faq.body.includes(`What is the Coupersville ${name}?`) && faq.body.includes(`${first} businesses`));
  if (note) {
    const section = faq.body.slice(faq.body.indexOf('id="pioneer-circle"'), faq.body.indexOf('id="privacy"'));
    check("the FAQ's Pioneer section has the places note", section.includes(note));
  }
  check("FAQ never says no account is needed", !/no account (is )?needed/i.test(faq.body));
  check("no em dashes", !faq.body.includes("—"));

  console.log("\nWelcome step and dashboard link");
  const pioneer = await makeUser("pioneer", "merchant");
  const biz = must(
    await admin.from("businesses").insert({ owner_id: pioneer.id, name: `Pioneer test shop ${run}`, status: "active", timezone: "America/Chicago" }).select().single(),
    "pioneer business",
  );
  created.businesses.push(biz.id);
  const welcome = await get("/merchant/welcome", pioneer);
  check("the welcome shows the Pioneer Circle page with its button", welcome.status === 200 && welcome.body.includes(`Coupersville ${name}`) && welcome.body.includes("Got it, take me to my dashboard"));
  const seen = must(await admin.from("businesses").select("pioneer_welcome_seen_at").eq("id", biz.id).single(), "seen");
  check("opening it records that it was shown", Boolean(seen.pioneer_welcome_seen_at));
  const again = await get("/merchant/welcome", pioneer);
  // The page streams, so the redirect may come as a 307 or inside the streamed page (Next's
  // NEXT_REDIRECT marker, which the browser follows). Either way the page itself is not shown again.
  const streamedTo = (r, path) => r.status === 200 && r.body.includes(`NEXT_REDIRECT;replace;${path};`);
  check(
    "it is shown only once: a second visit goes to the dashboard",
    (redirectsTo(again, "/merchant") || streamedTo(again, "/merchant")) && !again.body.includes("Got it, take me"),
    `${again.status} ${again.location} button:${again.body.includes("Got it, take me")} markers:${(again.body.match(/NEXT_REDIRECT.{0,60}|__next-page-redirect.{0,100}/g) ?? []).join(" | ")}`,
  );
  const plainDash = await get("/merchant", pioneer);
  check("no Pioneer Circle link without a founding seat or plan", plainDash.status === 200 && !plainDash.body.includes("You are part of the"));
  must(await admin.from("subscriptions").insert({ business_id: biz.id, source: "complimentary", status: "active", offer_code: "founding_merchant" }), "founding plan");
  const pioneerDash = await get("/merchant", pioneer);
  check("a Pioneer business's dashboard links to the Pioneer Circle", pioneerDash.body.includes(`You are part of the ${name}.`) && pioneerDash.body.includes('href="/pioneer-circle"'));
  const ownerDash = await get("/merchant", plainOwner);
  check("other businesses' dashboards have no Pioneer link", !ownerDash.body.includes("You are part of the"));
}

// Client changes, round 3 (2026-11-12): the home hero, the new membership level names (read from the
// offers table everywhere), and the permanent /join address for the printed QR code. Reads only.
async function roundThree() {
  console.log("\nRound 3: home hero");
  const home = await get("/");
  const tagline = home.body.indexOf("Local offers. Local shoppers. One simple marketplace.");
  // The headline highlights its last word, so it is split across tags.
  const headline = home.body.search(/Where good deals(<!-- -->)?\s*(<!-- -->)?<span[^>]*>\s*live\.\s*<\/span>/);
  check("home: the marketplace line sits above the headline", tagline > -1 && headline > tagline, { tagline, headline });
  check(
    "home: the supporting line",
    home.body.includes("Coupersville is a digital coupon marketplace that connects local businesses with shoppers ready to discover them."),
  );
  // Rebrand (2026-11-13): the hero shows the illustrated Main Street with the search bar inside it;
  // the town sign photo moved to the About page.
  check(
    "home: the hero has the Main Street illustration, then the search inside the hero",
    home.body.includes('viewBox="0 0 560 450"') && home.body.indexOf('viewBox="0 0 560 450"') < home.body.indexOf("What kind of deal are you looking for?") &&
      home.body.indexOf("What kind of deal are you looking for?") < home.body.indexOf("New around town"),
  );
  check("home: no town sign photo", !home.body.includes("town-sign"));
  const about = await get("/about");
  check("About: the town sign photo with its description", about.body.includes("town-sign") && about.body.includes("A wooden sign reading Welcome to Coupersville"));
  check("header: the horizontal logo with the name as its text", /<img[^>]*alt="Coupersville"[^>]*src="\/brand\/coupersville-logo-horizontal\.svg"|<img[^>]*src="\/brand\/coupersville-logo-horizontal\.svg"[^>]*alt="Coupersville"/.test(home.body));
  check("footer: the reversed logo on evergreen", home.body.includes("/brand/coupersville-logo-reversed-transparent.svg") && home.body.includes("bg-evergreen-900"));
  check("fonts are served from this site, never from Google", !/fonts\.(googleapis|gstatic)\.com/.test(home.body) && /\/_next\/static\/media\/[^"]+\.woff2/.test(home.body));

  console.log("\nRound 3: membership level names");
  const offers = must(await admin.from("offers").select("code, name"), "offers");
  const name = Object.fromEntries(offers.map((o) => [o.code, o.name]));
  check(
    "offers table has the new names",
    name.founding_merchant === "Pioneer Circle" && name.early_access === "Early Bird" && name.general === "Main Street" && name.merchant_plus === "Boulevard" && name.enterprise === "Build Your Route",
    name,
  );
  const OLD = ["Founding Merchant", "Early Access", "General Membership", "Merchant Plus", "Enterprise (Custom)", "Founding seat", "General rate", "Enterprise custom quote"];
  const membership = await get("/business-membership");
  const shownLevels = ["early_access", "general", "merchant_plus", "enterprise"].map((c) => name[c]);
  check("Business membership shows the level names from the offers table", shownLevels.every((n) => membership.body.includes(n)), shownLevels);
  check(
    "Business membership words other levels by their table names",
    membership.body.includes(`${name.merchant_plus} includes up to`) && membership.body.includes(`for a ${name.enterprise} custom quote`) &&
      membership.body.includes(`${name.early_access} renewals convert to the then-current ${name.general} rate`),
  );
  for (const [path, label] of [["/", "home"], ["/business-membership", "Business membership"], ["/for-businesses", "For businesses"]]) {
    const body = path === "/" ? home.body : path === "/business-membership" ? membership.body : (await get(path)).body;
    const found = OLD.filter((o) => body.includes(o));
    check(`${label}: no old level names`, found.length === 0, found);
  }
  const callout = must(await admin.from("offers").select("active, free_seats, window_ends_at").eq("code", "founding_merchant").single(), "founding");
  if (callout.active && new Date(callout.window_ends_at).getTime() > Date.now()) {
    check("home: the founding callout uses its table name", home.body.includes(`${name.founding_merchant} offer:`));
  }

  console.log("\nRound 3: coupersville.com/join");
  const join = await get("/join");
  check(
    "/join sends visitors to the business sign-up (temporary redirect, so the printed address keeps working if the page moves)",
    join.status === 307 && new URL(join.location, base).pathname === "/signup" && new URL(join.location, base).searchParams.get("type") === "merchant",
    `${join.status} ${join.location}`,
  );
  const joinFollowed = await fetch(`${base}/join`);
  check("/join lands on the business sign-up form", joinFollowed.status === 200 && (await joinFollowed.text()).includes("Create my business account"));
  const staffInvite = await get(`/join/${"0".repeat(48)}`);
  check("/join/[token] staff invites still open the invite page", staffInvite.status === 200 && staffInvite.body.includes("Invite not available"));
}

// Copy deck phase 3 (2026-11-12): breadcrumb, Get directions, Exclusions, the generate step, search
// sort and filters, Redemptions this month, the merchant sign-in, sign-up and setup pages, builder.
async function phaseThree({ shop, owner, categoryId, insertCoupon, storeA, pastry }) {
  console.log("\nCopy deck phase 3");
  const category = must(await admin.from("categories").select("slug, name").eq("id", categoryId).single(), "category name");
  const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

  // Coupon page: breadcrumb, Exclusions, directions per store (two stores).
  const page = await get(`/coupon/${pastry.id}`);
  const crumbs = page.body.match(/<nav aria-label="Breadcrumb">.*?<\/nav>/s)?.[0] ?? "";
  check(
    "breadcrumb: Coupersville > category > business, the business is the current page",
    crumbs.includes('href="/"') && crumbs.includes(`href="/c/${category.slug}"`) && text(crumbs).includes(category.name.replace(/&/g, "&")) &&
      /aria-current="page"[^>]*>Page test shop/.test(crumbs),
    crumbs.slice(0, 300),
  );
  check("Good to know says Exclusions: None stated when there are none", /Exclusions<\/dt><dd[^>]*>None stated</.test(page.body));
  const mapsLinks = page.body.match(/href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=[^"]+"/g) ?? [];
  check("two stores: a Get directions link for each, with the store address", mapsLinks.length === 2 && mapsLinks[0].includes("1%20Main%20St%2C%20Coupersville"), mapsLinks.join(" "));
  check("nothing is loaded from a maps service until a link is tapped", !/<(script|iframe|img|link)[^>]+(google\.com\/maps|maps\.googleapis|maps\.apple\.com|mapkit)/i.test(page.body));
  check("the generate step stays closed until Get my coupon is tapped", !page.body.includes("Ready to use this deal?"));

  // One store and an exclusion: Get directions sits with Get my coupon.
  const single = await insertCoupon({ title: "Exclusion test", discount_type: "percent", discount_value: 10, all_locations: false, exclusions: "Gift cards and alcohol" });
  must(await admin.from("coupon_locations").insert({ coupon_id: single.id, location_id: storeA.id }), "single store");
  const singlePage = await get(`/coupon/${single.id}`);
  check("an exclusion is shown under Good to know", /Exclusions<\/dt><dd[^>]*>Gift cards and alcohol</.test(singlePage.body));
  check("one store: one Get directions button", (singlePage.body.match(/google\.com\/maps\/dir/g) ?? []).length === 1 && singlePage.body.includes("Get directions"));

  // Search: business name filter, Biggest savings, Available now.
  const name = encodeURIComponent(`Page test shop ${run}`);
  const titles = ["Free cookie", "Lunch special", "Exclusion test", "Page test pastry", "Regular coffee"];
  const bySavings = await get(`/search?business=${name}&sort=savings`);
  const order = titles.map((t) => bySavings.body.indexOf(`>${t}<`));
  check("business name filter: only this business, all 5 of its deals", bySavings.body.includes("5 deals found"), text(bySavings.body).match(/\d+ deals? found/)?.[0]);
  check("Biggest savings: free, then percent (20, 10), then dollars off, then fixed price", order.every((p, i) => p > 0 && (i === 0 || p > order[i - 1])), order.join(","));
  const nowOnly = await get(`/search?business=${name}&available=1`);
  check("Available now leaves out the deal that opens on another day", nowOnly.body.includes("4 deals found") && !nowOnly.body.includes(">Lunch special<"));
  const nobody = await get(`/search?business=${encodeURIComponent(`No such shop ${run}`)}`);
  check("a business name with no deals finds nothing", nobody.body.includes("No deals matched that search just yet."));
  check("the sort menu offers Biggest savings, and the filters Business name and Available now", bySavings.body.includes(">Biggest savings<") && bySavings.body.includes(">Business name<") && bySavings.body.includes("Available now"));

  // Dashboard: one redemption so far, this month (business timezone).
  const dash = await get("/merchant", owner);
  check("dashboard shows Redemptions this month", /Redemptions this month<\/dt><dd[^>]*>1</.test(dash.body), text(dash.body).match(/Redemptions this month \d+/)?.[0]);
  const stats = must(await owner.client.rpc("business_redemption_stats", { p_business_id: shop.id }), "stats");
  check("the stats function counts this month", stats.this_month === 1 && stats.total === 1, JSON.stringify(stats));

  // Builder: Exclusions, Save draft, Preview coupon and Publish now; exclusions are saved.
  const builder = await get("/merchant/coupons/new", owner);
  check("builder has Exclusions, Save draft, Preview coupon and Publish now", ["Exclusions", "Save draft", "Preview coupon", "Publish now"].every((t) => builder.body.includes(t)));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  const draftInput = {
    title: `Draft ${run}`, description: "", categoryId, discountType: "percent", discountValue: 15, includedProducts: "", limitsText: "",
    exclusions: "Sale items", minSpend: "", minQty: "", maxPeople: "", startsOn: today, expiresOn: today, imagePath: null, allLocations: true,
    locationIds: [], perUserMode: "once", perUserLimit: "", redeemFrequency: "none", scheduleOn: false, scheduleDays: [], scheduleStart: "",
    scheduleEnd: "", totalLimit: "",
  };
  const saved = await callAction(base, owner.cookie, "src/app/merchant/coupons/actions.ts", "saveCoupon", [null, draftInput, "draft"]);
  const draft = must(await admin.from("coupons").select("id, status, exclusions").eq("business_id", shop.id).eq("title", `Draft ${run}`).maybeSingle(), "draft");
  check("Save draft keeps the exclusions and does not publish", Boolean(saved.redirect) && draft?.status === "draft" && draft.exclusions === "Sale items", JSON.stringify({ saved, draft }));
  const edit = await get(`/merchant/coupons/${draft?.id}`, owner);
  // The form fills its inputs in the browser from props sent with the page, so look for the value there.
  check("the coupon editor loads the saved exclusions", edit.status === 200 && edit.body.includes("Sale items"));

  // Sign in (deck page 18).
  const login = await get("/login");
  check(
    "merchant sign in: Welcome back, Business email, Forgot password and View business membership",
    ["Welcome back.", "Sign in to manage your business, create offers, scan coupons and review redemption activity.", "Business email", "Forgot password?", 'href="/business-membership"', "View business membership"].every((t) => login.body.includes(t)) &&
      !login.body.includes("Remember me"),
  );
  const shopperLogin = await get(`/login?next=${encodeURIComponent(`/coupon/${pastry.id}`)}`);
  check("a shopper coming back from the sign-in sheet gets plain wording", shopperLogin.body.includes(">Email<") && !shopperLogin.body.includes("Business email"));
  const wrong = await callAction(base, null, "src/app/(auth)/actions.ts", "signIn", [{ email: owner.email, password: "not-the-password" }]);
  check("wrong password: the deck's security error", wrong.value?.error === "We could not sign you in with those details. Check your email address and password, then try again.", JSON.stringify(wrong));
  const reset = await get("/reset-password");
  check("reset password: deck copy and Send reset instructions", reset.body.includes("Enter the email address connected to your business account.") && reset.body.includes("Send reset instructions"));

  // Sign up (deck page 16). Only refusals are sent, so no account is made and no email goes out.
  const join = await get("/signup?type=merchant");
  check(
    "merchant sign-up: the deck's sections and fields, no number of locations",
    ["Open your door in Coupersville.", "About you", "First name", "Last name", "Business email", "Phone number", "Create password", "Confirm password", "About your business", "Business name", "Primary category", "Business website", "Street address", "City", "State or region", "ZIP or postal code", "Country", "authorized to represent this business", "Create my business account", "Already have a Coupersville business account?"].every((t) => join.body.includes(t)) &&
      !/number of locations/i.test(join.body),
  );
  const mismatch = await callAction(base, null, "src/app/(auth)/actions.ts", "signUpMerchant", [{
    firstName: "Test", lastName: "Merchant", email: `cpv-test-${run}-join@example.com`, phone: "555 123 4567", password: "a-long-password", confirm: "different",
    businessName: "Nope", primaryCategoryId: categoryId, websiteUrl: "", addressLine1: "1 Main St", city: "Coupersville", state: "", postalCode: "", country: "United States",
  }]);
  const joined = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.some((u) => u.email === `cpv-test-${run}-join@example.com`);
  check("sign-up with passwords that do not match is refused and makes no account", mismatch.value?.ok === false && !joined, JSON.stringify(mismatch));
  const shopperJoin = await get("/signup");
  check("the shopper sign-up has no account type choice and links to the business sign-up", !shopperJoin.body.includes("I run a business") && shopperJoin.body.includes('href="/signup?type=merchant"'));

  // Setup after confirming: the sign-up details fill in the form.
  const fresh = await makeUser("fresh", "merchant");
  must(
    await admin.auth.admin.updateUserById(fresh.id, {
      user_metadata: {
        role: "merchant", full_name: "Test fresh",
        business_signup: { name: `Prefill shop ${run}`, primary_category_id: categoryId, website_url: "https://example.com", contact_phone: "555 222 3333", address_line1: "9 Elm Street", city: "Coupersville", state: "IL", postal_code: "62701", country: "United States" },
      },
    }),
    "metadata",
  );
  const freshAgain = await reSignIn(fresh);
  const setup = await get("/merchant/onboarding", freshAgain);
  check(
    "setup page: Welcome to Coupersville, the sign-up details filled in, Set up my business",
    ["Welcome to Coupersville.", `Prefill shop ${run}`, "9 Elm Street", "62701", "United States", "555 222 3333", "https://example.com", "Set up my business"].every((t) => setup.body.includes(t)),
  );
}

// Signs a user in again so the session carries metadata changed after the first sign-in.
async function reSignIn(who) {
  const jar = new Map();
  const ssr = createServerClient(url, publishable, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  must(await ssr.auth.signInWithPassword({ email: who.email, password }), "sign in again");
  return { ...who, cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; ") };
}

async function nearMe() {
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
