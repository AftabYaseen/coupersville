// Email-code sign-in for shoppers, through the real server actions of a local build.
//
//   npm run build && npx next start -p 3100
//   BASE_URL=http://localhost:3100 node --env-file=.env.local scripts/test-signin-codes.mjs
//
// The 6-digit code is taken from Supabase's admin generateLink, which returns the same code the email
// would carry, without sending an email. Sending real emails is left to a person with an inbox.

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

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Date.now().toString(36);
const created = { users: [], businesses: [] };
const A = "src/app/(auth)/code-actions.ts";

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

// Each run looks like its own visitor, so the per-IP limit of one run does not block the next.
const fakeIp = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
const act = (name, args, cookie) => callAction(base, cookie ?? null, A, name, args, { headers: { "x-forwarded-for": fakeIp } });

async function codeFor(email) {
  const link = must(await admin.auth.admin.generateLink({ type: "magiclink", email }), "generate link");
  return link.properties.email_otp;
}

async function newUser(label, role) {
  const email = `cpv-test-${run}-${label}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { role } });
  if (error) throw new Error(`create ${label}: ${error.message}`);
  created.users.push(data.user.id);
  return { id: data.user.id, email };
}

async function main() {
  // A live coupon of its own (a business with a plan and a published coupon), so the test does not
  // depend on what is in the database.
  const categoryId = must(await admin.from("categories").select("id").eq("active", true).order("sort_order").limit(1).single(), "category").id;
  const shopOwner = await newUser("shopowner", "merchant");
  const shop = must(await admin.from("businesses").insert({ owner_id: shopOwner.id, name: `Sign-in code shop ${run}`, status: "active", timezone: "America/Los_Angeles" }).select().single(), "business");
  created.businesses.push(shop.id);
  must(await admin.from("subscriptions").insert({ business_id: shop.id, source: "complimentary", status: "active", current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString() }), "plan");
  const coupon = must(
    await admin
      .from("coupons")
      .insert({ business_id: shop.id, category_id: categoryId, title: `Sign-in code coupon ${run}`, discount_type: "percent", discount_value: 10, starts_at: new Date(Date.now() - 86_400_000).toISOString(), expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), status: "published" })
      .select("id")
      .single(),
    "a live coupon",
  );

  console.log("\nMerchants and admins keep their password");
  const merchant = await makeUser({ url, publishable, admin, email: `cpv-test-${run}-merchant@example.com`, password: `Pw-${run}-x9Z!`, role: "merchant", fullName: "Merchant" });
  created.users.push(merchant.id);
  const merchantSend = await act("requestSignInCode", [{ email: merchant.email }]);
  check("no code is sent to a merchant email", merchantSend.value?.ok === false && merchantSend.value.usePassword === true, merchantSend.value);
  const merchantVerify = await act("verifySignInCode", [{ email: merchant.email, code: await codeFor(merchant.email) }]);
  check("a merchant code from elsewhere does not sign them in", merchantVerify.value?.ok === false && merchantVerify.value.usePassword === true, merchantVerify.value);
  // The browser keeps the last value set for each cookie; signing out sets them empty.
  const finalCookies = new Map((merchantVerify.setCookies ?? []).map((c) => [c.split("=")[0], c.slice(c.indexOf("=") + 1)]));
  check("and leaves no session behind", [...finalCookies].every(([n, v]) => !n.includes("auth-token") || v === ""), [...finalCookies.keys()]);

  console.log("\nA shopper signs in with a code, then saves straight away");
  const shopper = await newUser("shopper", "consumer");
  const wrong = await act("verifySignInCode", [{ email: shopper.email, code: "000000" }]);
  check("a wrong code is refused with a clear message", wrong.value?.ok === false && /wrong or has expired/.test(wrong.value.error), wrong.value);
  const bad = await act("verifySignInCode", [{ email: shopper.email, code: "12ab" }]);
  check("a code with letters in it is refused", bad.value?.ok === false && /only numbers/.test(bad.value.error), bad.value);
  const good = await act("verifySignInCode", [{ email: shopper.email, code: (await codeFor(shopper.email)).replace(/(\d{3})/, "$1 ") }]);
  check("the right code (typed with a space) signs in", good.value?.ok === true, good.value);
  const cookie = (good.setCookies ?? []).filter((c) => !c.endsWith("=")).join("; ");
  check("a session cookie is set", /-auth-token/.test(cookie));
  const save = await callAction(base, cookie, "src/app/coupon/actions.ts", "saveFavorite", [coupon.id]);
  check("Save coupon works straight after", save.value?.ok === true, save.value);
  const fav = must(await admin.from("favorites").select("id").eq("user_id", shopper.id).eq("coupon_id", coupon.id), "favorite");
  check("the coupon is saved", fav.length === 1);
  const account = await (await fetch(`${base}/account`, { headers: { cookie } })).text();
  check("Account shows their email and an optional name field", account.includes(shopper.email) && account.includes("Save name"));
  const named = await callAction(base, cookie, "src/app/account/actions.ts", "updateName", [{ fullName: "Code Shopper" }]);
  const profile = must(await admin.from("profiles").select("role, full_name").eq("id", shopper.id).single(), "profile");
  check("they can add a name later", named.value?.ok === true && profile.full_name === "Code Shopper");
  check("and they are a shopper", profile.role === "consumer");

  console.log("\nExisting shopper with a password can use a code too");
  const pwShopper = await makeUser({ url, publishable, admin, email: `cpv-test-${run}-pw@example.com`, password: `Pw-${run}-x9Z!`, role: "consumer", fullName: "Password Shopper" });
  created.users.push(pwShopper.id);
  const pwCode = await act("verifySignInCode", [{ email: pwShopper.email, code: await codeFor(pwShopper.email) }]);
  check("code sign-in works for a shopper who has a password", pwCode.value?.ok === true, pwCode.value);

  console.log("\nRate limits");
  const limited = `cpv-test-${run}-limited@example.com`;
  const sends = [];
  for (let i = 0; i < 4; i += 1) sends.push((await act("requestSignInCode", [{ email: limited }])).value);
  check("the 4th code request in 10 minutes for one email is refused", sends[3]?.ok === false && /Too many codes/.test(sends[3].error), sends);
  check("the first three were not refused by the limit", sends.slice(0, 3).every((s) => !/Too many codes/.test(s?.error ?? "")), sends.slice(0, 3));
  const tries = [];
  const victim = await newUser("victim", "consumer");
  for (let i = 0; i < 11; i += 1) tries.push((await act("verifySignInCode", [{ email: victim.email, code: String(100000 + i) }])).value);
  check("after 10 wrong codes for one email, the 11th try is refused", /Too many tries/.test(tries[10]?.error ?? ""), tries[10]);
  const lockedOut = await act("verifySignInCode", [{ email: victim.email, code: await codeFor(victim.email) }]);
  check("even the right code waits until the limit clears", lockedOut.value?.ok === false && /Too many tries/.test(lockedOut.value.error), lockedOut.value);
  const ipSends = [];
  for (let i = 0; i < 9; i += 1) ipSends.push((await act("requestSignInCode", [{ email: `cpv-test-${run}-ip${i}@example.com` }])).value);
  check("one connection asking for codes for many emails is refused after 10 in 10 minutes", ipSends.some((s) => /Too many codes/.test(s?.error ?? "")), ipSends.map((s) => s?.error ?? "ok"));
  const { count } = await admin.from("auth_code_requests").select("id", { count: "exact", head: true }).like("email_hash", "%@%");
  check("no plain email address is stored in the limits table", count === 0, count);
}

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of data?.users ?? []) if (u.email?.startsWith(`cpv-test-${run}-`)) created.users.push(u.id);
  for (const id of new Set(created.users)) await admin.auth.admin.deleteUser(id);
  for (const id of created.businesses) await admin.from("businesses").delete().eq("id", id);
}

try {
  await main();
} catch (error) {
  failed += 1;
  console.error("\nStopped early:", error.message);
} finally {
  await cleanup();
  console.log(`\n${passed} passed, ${failed} failed. Test users removed.`);
  process.exit(failed ? 1 : 0);
}
