// Redemption checks against the real Supabase project, through the same RPCs the app calls.
// Creates throwaway users, a business, stores and coupons, runs every check, then deletes it all.
//
//   node --env-file=.env.local scripts/test-redemption.mjs
//
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY.

import { createClient } from "@supabase/supabase-js";

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

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`);
  }
}

function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

const created = { users: [], businesses: [] };

async function makeUser(label, role) {
  const email = `cpv-test-${run}-${label}@example.com`;
  const { user } = must(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, full_name: `Test ${label}` },
    }),
    `create ${label}`,
  );
  created.users.push(user.id);
  const client = createClient(url, publishable, opts);
  must(await client.auth.signInWithPassword({ email, password }), `sign in ${label}`);
  return { id: user.id, email, client };
}

async function makeBusiness(owner, name) {
  const business = must(
    await admin.from("businesses").insert({ owner_id: owner.id, name, status: "active", timezone: "America/New_York" }).select().single(),
    "business",
  );
  created.businesses.push(business.id);
  must(
    await admin.from("subscriptions").insert({ business_id: business.id, source: "complimentary", status: "active" }),
    "subscription",
  );
  return business;
}

async function makeStore(business, storeName) {
  return must(
    await admin
      .from("locations")
      .insert({ business_id: business.id, store_name: storeName, address_line1: "1 Main St", city: "Coupersville" })
      .select()
      .single(),
    "store",
  );
}

let categoryId;
async function makeCoupon(business, fields = {}) {
  return must(
    await admin
      .from("coupons")
      .insert({
        business_id: business.id,
        category_id: categoryId,
        title: fields.title ?? "Test coupon",
        discount_type: "percent",
        discount_value: 10,
        starts_at: new Date(Date.now() - 60_000).toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        status: "published",
        ...fields,
      })
      .select()
      .single(),
    "coupon",
  );
}

async function token(shopper, couponId) {
  const data = must(await shopper.client.rpc("create_redemption_token", { p_coupon_id: couponId }), "create token");
  return data;
}

// Inserts a token directly, bypassing create_redemption_token, to set up races and edge cases.
async function rawToken(userId, couponId, fields = {}) {
  const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  return must(
    await admin
      .from("redemption_tokens")
      .insert({
        coupon_id: couponId,
        user_id: userId,
        token: [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join(""),
        short_code: code,
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        ...fields,
      })
      .select()
      .single(),
    "raw token",
  );
}

const verify = (who, input, locationId) =>
  who.client.rpc("verify_redemption", { p_token_or_code: input, p_location_id: locationId }).then((r) => must(r, "verify"));
const preview = (who, input, locationId) =>
  who.client.rpc("preview_redemption", { p_token_or_code: input, p_location_id: locationId }).then((r) => must(r, "preview"));

async function redemptionCount(filter) {
  let q = admin.from("redemptions").select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { count, error } = await q;
  if (error) throw error;
  return count;
}

const tally = (results) =>
  results.reduce((acc, r) => {
    acc[r.result] = (acc[r.result] ?? 0) + 1;
    return acc;
  }, {});

async function main() {
  categoryId = must(await admin.from("categories").select("id").limit(1).single(), "category").id;

  console.log("Setting up test users, businesses, stores and coupons");
  const owner = await makeUser("owner", "merchant");
  const staff = await makeUser("staff", "consumer");
  const shopper1 = await makeUser("shopper1", "consumer");
  const shopper2 = await makeUser("shopper2", "consumer");
  const shopper3 = await makeUser("shopper3", "consumer");
  const otherOwner = await makeUser("other", "merchant");

  const shop = await makeBusiness(owner, `Test shop ${run}`);
  const otherShop = await makeBusiness(otherOwner, `Other shop ${run}`);
  const storeA = await makeStore(shop, "Store A");
  const storeB = await makeStore(shop, "Store B");
  const otherStore = await makeStore(otherShop, "Other store");

  console.log("\nStaff invites");
  const invite = must(
    await owner.client.from("staff_invites").insert({ business_id: shop.id, email: staff.email, invited_by: owner.id }).select().single(),
    "invite",
  );
  const wrongPerson = must(await shopper1.client.rpc("accept_staff_invite", { p_token: invite.token }), "accept wrong");
  check("invite cannot be accepted by a different email", wrongPerson.result === "email_mismatch", wrongPerson);
  const accepted = must(await staff.client.rpc("accept_staff_invite", { p_token: invite.token }), "accept");
  check("invited staff can accept", accepted.result === "ok", accepted);
  const again = must(await shopper1.client.rpc("accept_staff_invite", { p_token: invite.token }), "accept again");
  check("used invite cannot be reused by someone else", again.result === "already_accepted", again);
  const { data: staffRow } = await admin.from("business_members").select("role").eq("business_id", shop.id).eq("user_id", staff.id).single();
  check("staff membership has role staff", staffRow?.role === "staff", staffRow);

  const staffInvite = await staff.client.from("staff_invites").insert({ business_id: shop.id, email: "x@example.com", invited_by: staff.id });
  check("staff cannot invite", Boolean(staffInvite.error), staffInvite.error?.message);
  const ownerSelfDelete = await owner.client.from("business_members").delete().eq("business_id", shop.id).eq("user_id", owner.id).select();
  check("owner cannot remove the owner membership", Boolean(ownerSelfDelete.error), ownerSelfDelete);
  const staffPromote = await owner.client.from("business_members").update({ role: "owner" }).eq("business_id", shop.id).eq("user_id", staff.id).select();
  check("owner cannot make staff an owner", Boolean(staffPromote.error), staffPromote);
  const details = must(await createClient(url, publishable, opts).rpc("staff_invite_details", { p_token: invite.token }), "details");
  check("invite details are readable signed out, email masked", details[0]?.masked_email?.includes("*") && !details[0].masked_email.includes("staff"), details);

  console.log("\nRace: same QR token verified 12 times at once");
  const raceCoupon = await makeCoupon(shop, { title: "Race" });
  const t1 = await token(shopper1, raceCoupon.id);
  check("token created", t1.result === "ok" && /^[0-9]{6}$/.test(t1.short_code), t1);
  const qrResults = await Promise.all(
    Array.from({ length: 12 }, (_, i) => verify(i % 2 ? staff : owner, t1.token, storeA.id)),
  );
  const qrTally = tally(qrResults);
  check("exactly one ok, the rest already used", qrTally.ok === 1 && qrTally.already_used === 11, qrTally);
  check("exactly one redemption row for the token", (await redemptionCount({ token_id: t1.token_id })) === 1);

  console.log("\nRace: same 6-digit code verified 12 times at once");
  const t2 = await token(shopper2, raceCoupon.id);
  const codeResults = await Promise.all(Array.from({ length: 12 }, () => verify(staff, t2.short_code, storeA.id)));
  const codeTally = tally(codeResults);
  check("exactly one ok, the rest already used", codeTally.ok === 1 && codeTally.already_used === 11, codeTally);
  check("redemption recorded with method code", codeResults.find((r) => r.result === "ok")?.method === "code");

  console.log("\nRace: two different tokens for one shopper, per-user limit 1");
  const perUserRace = await makeCoupon(shop, { title: "Per-user race", per_user_limit: 1 });
  const [ra, rb] = [await rawToken(shopper3.id, perUserRace.id), await rawToken(shopper3.id, perUserRace.id)];
  const perUserRaceResults = await Promise.all([verify(staff, ra.token, storeA.id), verify(owner, rb.token, storeA.id)]);
  const puTally = tally(perUserRaceResults);
  check("one ok, one user limit reached", puTally.ok === 1 && puTally.user_limit_reached === 1, puTally);

  console.log("\nRace: two shoppers, total limit 1");
  const totalRace = await makeCoupon(shop, { title: "Total race", total_limit: 1 });
  const [ta, tb] = [await rawToken(shopper1.id, totalRace.id), await rawToken(shopper2.id, totalRace.id)];
  const totalRaceResults = await Promise.all([verify(staff, ta.token, storeA.id), verify(owner, tb.token, storeA.id)]);
  const trTally = tally(totalRaceResults);
  check("one ok, one total limit reached", trTally.ok === 1 && trTally.total_limit_reached === 1, trTally);
  check("total limit coupon has one redemption", (await redemptionCount({ coupon_id: totalRace.id })) === 1);

  console.log("\nPer-user limit 2");
  const perUser = await makeCoupon(shop, { title: "Twice each", per_user_limit: 2 });
  for (let i = 1; i <= 2; i += 1) {
    const t = await token(shopper1, perUser.id);
    const r = await verify(staff, t.token, storeA.id);
    check(`use ${i} of 2 is ok`, r.result === "ok", r);
  }
  const third = await token(shopper1, perUser.id);
  check("third token is refused", third.result === "user_limit_reached", third);
  const sneaky = await rawToken(shopper1.id, perUser.id);
  const sneakyResult = await verify(staff, sneaky.token, storeA.id);
  check("a token made outside the app is still refused at verify", sneakyResult.result === "user_limit_reached", sneakyResult);

  console.log("\nTotal limit 2");
  const total = await makeCoupon(shop, { title: "Two in total", total_limit: 2 });
  for (const s of [shopper1, shopper2]) {
    const t = await token(s, total.id);
    const r = await verify(staff, t.token, storeA.id);
    check(`${s === shopper1 ? "first" : "second"} shopper ok`, r.result === "ok", r);
  }
  const t3 = await token(shopper3, total.id);
  check("third shopper cannot get a token", t3.result === "total_limit_reached", t3);

  console.log("\nExpired token");
  const plain = await makeCoupon(shop, { title: "Plain", per_user_limit: 5 });
  // Ten minutes back, so a fast local clock cannot make it look valid to the database.
  const old = await rawToken(shopper2.id, plain.id, { expires_at: new Date(Date.now() - 600_000).toISOString() });
  check("preview says expired", (await preview(staff, old.token, storeA.id)).result === "expired");
  check("verify says expired", (await verify(staff, old.token, storeA.id)).result === "expired");
  check("verify by code says expired", (await verify(staff, old.short_code, storeA.id)).result === "expired");
  check("no redemption recorded", (await redemptionCount({ token_id: old.id })) === 0);

  console.log("\nToken from another business");
  const otherCoupon = await makeCoupon(otherShop, { title: "Other shop deal" });
  const ot = await token(shopper1, otherCoupon.id);
  const otherQr = await verify(staff, ot.token, storeA.id);
  check("QR from another business: wrong business", otherQr.result === "wrong_business", otherQr);
  const otherCode = await verify(staff, ot.short_code, storeA.id);
  check("code from another business: wrong business", otherCode.result === "wrong_business", otherCode);
  const otherPreview = await preview(staff, ot.token, storeA.id);
  check("preview does not reveal the other business's coupon", otherPreview.result === "wrong_business" && !otherPreview.offer, otherPreview);
  const atOwnStore = await verify(otherOwner, ot.token, otherStore.id);
  check("same token still works at its own business", atOwnStore.result === "ok", atOwnStore);

  console.log("\nPaused coupon");
  const pausing = await makeCoupon(shop, { title: "Will pause" });
  const pt = await token(shopper2, pausing.id);
  must(await admin.from("coupons").update({ status: "paused" }).eq("id", pausing.id), "pause");
  check("preview says coupon not live", (await preview(staff, pt.token, storeA.id)).result === "coupon_not_live");
  check("verify says coupon not live", (await verify(staff, pt.token, storeA.id)).result === "coupon_not_live");
  const pausedToken = await token(shopper3, pausing.id);
  check("no new token for a paused coupon", pausedToken.result === "not_live", pausedToken);

  console.log("\nStore eligibility");
  const onlyA = await makeCoupon(shop, { title: "Store A only", all_locations: false });
  must(await admin.from("coupon_locations").insert({ coupon_id: onlyA.id, location_id: storeA.id }), "link store");
  const et = await token(shopper3, onlyA.id);
  check("store B is not eligible", (await verify(staff, et.token, storeB.id)).result === "location_not_eligible");
  check("store A is eligible", (await verify(staff, et.token, storeA.id)).result === "ok");

  console.log("\nPreview records nothing");
  const pv = await token(shopper3, plain.id);
  const pvResult = await preview(staff, pv.short_code, storeA.id);
  check("preview ok with offer details", pvResult.result === "ok" && pvResult.offer?.title === "Plain", pvResult);
  check("no redemption after preview", (await redemptionCount({ token_id: pv.token_id })) === 0);
  const { data: pvToken } = await admin.from("redemption_tokens").select("used_at").eq("id", pv.token_id).single();
  check("token still unused after preview", pvToken.used_at === null);

  console.log("\nWho may verify");
  check("another business's owner: not a member", (await verify(otherOwner, pv.token, storeA.id)).result === "not_member");
  check("a shopper: not a member", (await verify(shopper1, pv.token, storeA.id)).result === "not_member");
  check("rubbish input: not found", (await verify(staff, "hello", storeA.id)).result === "not_found");
  check("unknown 6-digit code: not found or wrong business", ["not_found", "wrong_business"].includes((await verify(staff, "000000", storeA.id)).result));
  const anonVerify = await createClient(url, publishable, opts).rpc("verify_redemption", { p_token_or_code: pv.token, p_location_id: storeA.id });
  check("signed-out callers cannot run verify", Boolean(anonVerify.error));

  console.log("\nRealtime: the shopper's screen hears the redemption");
  const heard = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 15_000);
    const channel = shopper3.client
      .channel(`test-${pv.token_id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "redemptions", filter: `token_id=eq.${pv.token_id}` }, (payload) => {
        clearTimeout(timer);
        resolve(payload.new);
        shopper3.client.removeChannel(channel);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // The change stream can take a few seconds to start on a project that has been idle.
          await new Promise((r) => setTimeout(r, 4000));
          const r = await verify(staff, pv.token, storeA.id);
          check("verify after subscribing is ok", r.result === "ok", r);
        }
      });
  });
  const event = await heard;
  check("insert event arrived for the shopper", event?.token_id === pv.token_id, event);

  console.log("\nShopper reads");
  const mine = must(await shopper3.client.rpc("my_redemption_token", { p_token_id: pv.token_id }), "my token");
  check("shopper sees their redeemed token with store", mine[0]?.redeemed_store === "Store A" && mine[0]?.used_at, mine[0]);
  const notMine = must(await shopper1.client.rpc("my_redemption_token", { p_token_id: pv.token_id }), "not my token");
  check("another shopper cannot read it", notMine.length === 0);
  const history = must(await shopper3.client.rpc("my_redemptions"), "history");
  check("history lists the shopper's redemptions", history.length >= 2 && history.every((h) => h.business_name), history.length);
  const peek = must(await shopper1.client.from("redemptions").select("user_id"), "peek");
  check("shoppers only read their own redemption rows", peek.every((r) => r.user_id === shopper1.id), peek.length);

  console.log("\nStats");
  const stats = must(await owner.client.rpc("business_redemption_stats", { p_business_id: shop.id }), "stats");
  const actual = await redemptionCount({ business_id: shop.id });
  check("owner total matches redemptions", stats.total === actual && stats.today === actual && stats.week === actual, { stats, actual });
  check("per-coupon count for the race coupon is 2", stats.by_coupon?.[raceCoupon.id] === 2, stats.by_coupon);
  const staffStats = must(await staff.client.rpc("business_redemption_stats", { p_business_id: shop.id }), "staff stats");
  check("staff do not see stats", staffStats.total === 0, staffStats);
  const team = must(await owner.client.rpc("business_team", { p_business_id: shop.id }), "team");
  check("owner sees the team with emails", team.length === 2 && team.some((m) => m.email === staff.email), team);
  const staffTeam = must(await staff.client.rpc("business_team", { p_business_id: shop.id }), "staff team");
  check("staff do not see the team list", staffTeam.length === 0);

  console.log("\nRemoving staff");
  const removed = await owner.client.from("business_members").delete().eq("business_id", shop.id).eq("user_id", staff.id).select();
  check("owner can remove staff", !removed.error && removed.data.length === 1, removed.error);
  const afterRemoval = await verify(staff, (await token(shopper2, plain.id)).token, storeA.id);
  check("removed staff can no longer verify", afterRemoval.result === "not_member", afterRemoval);
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
