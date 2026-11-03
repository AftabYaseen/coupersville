// Admin portal checks through the real server actions, plus the Phase 4 actions, against a running build.
// Creates throwaway users, businesses, coupons and a category, then deletes them and restores
// anything shared (category order, platform settings).
//
//   npm run build && npx next start -p 3100
//   BASE_URL=http://localhost:3100 node --env-file=.env.local scripts/test-admin-actions.mjs

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
const created = { users: [], businesses: [], categories: [] };
let originalOrder = [];
let originalSettings = null;

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
const act = async (who, file, name, ...args) => {
  const r = await callAction(base, who?.cookie, A(file), name, args);
  return r.value ?? r;
};

async function user(label, role) {
  const u = await makeUser({
    url,
    publishable,
    admin,
    email: `cpv-test-${run}-${label}@example.com`,
    password,
    role,
    fullName: `Test ${label}`,
  });
  created.users.push(u.id);
  return u;
}

async function business(owner, name, plan) {
  const b = must(
    await admin.from("businesses").insert({ owner_id: owner.id, name, status: "active", timezone: "America/Denver" }).select().single(),
    "business",
  );
  created.businesses.push(b.id);
  if (plan) must(await admin.from("subscriptions").insert({ business_id: b.id, ...plan }), "plan");
  return b;
}

const day = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const isLive = async (couponId) => {
  const { data } = await anon.rpc("search_live_coupons", { p_query: null, p_limit: 60 });
  const { data: detail } = await anon.from("live_coupons").select("id").eq("id", couponId).maybeSingle();
  return Boolean(detail) && (data ?? []).some((c) => c.id === couponId);
};

async function main() {
  originalOrder = must(await admin.from("categories").select("id, sort_order"), "order");
  originalSettings = must(await admin.from("platform_settings").select("*").eq("singleton", true).single(), "settings");
  // Merchant publishing below needs publishing open. Cleanup puts the real date back.
  must(await admin.from("platform_settings").update({ publishing_opens_at: new Date(Date.now() - 86_400_000).toISOString() }).eq("singleton", true), "open publishing");
  const categoryId = must(await admin.from("categories").select("id").eq("active", true).order("sort_order").limit(1).single(), "cat").id;

  const boss = await user("admin", "admin");
  const owner = await user("owner", "merchant");
  const shopper = await user("shopper", "consumer");
  const staff = await user("staff", "consumer");

  const shop = await business(owner, `Admin test shop ${run}`, { source: "complimentary", status: "active" });
  const noPlan = await business(owner, `No plan shop ${run}`, null);
  const paid = await business(owner, `Stripe shop ${run}`, { source: "stripe", status: "active", stripe_subscription_id: `sub_test_${run}` });
  const store = must(
    await admin.from("locations").insert({ business_id: shop.id, store_name: "Main store", address_line1: "1 Main St", city: "Coupersville" }).select().single(),
    "store",
  );
  const coupon = must(
    await admin
      .from("coupons")
      .insert({
        business_id: shop.id,
        category_id: categoryId,
        title: `Admin test coupon ${run}`,
        discount_type: "percent",
        discount_value: 15,
        starts_at: new Date(Date.now() - 3_600_000).toISOString(),
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        status: "published",
      })
      .select()
      .single(),
    "coupon",
  );

  console.log("\nOnly admins get through");
  // The middleware turns non-admins away from /admin before any admin action runs. Each action also
  // asks is_admin() itself, but that check cannot be reached over HTTP while the middleware is in place.
  const shopperTry = await act(shopper, "admin/merchants/actions.ts", "setBusinessStatus", shop.id, "suspended");
  check("shopper: turned away from the action", shopperTry.blocked === true && shopperTry.redirect === "/", shopperTry);
  const ownerTry = await act(owner, "admin/merchants/actions.ts", "setBusinessStatus", shop.id, "suspended");
  check("merchant: turned away from the action", ownerTry.blocked === true && ownerTry.redirect === "/merchant", ownerTry);
  const signedOut = await act(null, "admin/coupons/actions.ts", "setCouponFeatured", coupon.id, true);
  check("signed out: sent to sign in", signedOut.blocked === true && signedOut.redirect.startsWith("/login"), signedOut);
  const stillActive = must(await admin.from("businesses").select("status").eq("id", shop.id).single(), "status").status;
  check("nothing changed", stillActive === "active");
  const isAdminOwner = must(await owner.client.rpc("is_admin"), "is_admin");
  check("is_admin() is false for the merchant", isAdminOwner === false);

  console.log("\nMerchants");
  check("coupon is live before suspension", await isLive(coupon.id));
  const suspend = await act(boss, "admin/merchants/actions.ts", "setBusinessStatus", shop.id, "suspended");
  check("admin suspends", suspend.ok === true, suspend);
  check("business is suspended", must(await admin.from("businesses").select("status").eq("id", shop.id).single(), "s").status === "suspended");
  check("its coupon is hidden from shoppers", !(await isLive(coupon.id)));
  const t = must(await shopper.client.rpc("create_redemption_token", { p_coupon_id: coupon.id }), "token");
  check("shoppers cannot get a code for it", t.result === "not_live", t);
  const again = await act(boss, "admin/merchants/actions.ts", "setBusinessStatus", shop.id, "suspended");
  check("suspending twice says so", again.ok === false && /already suspended/.test(again.error), again);
  const reactivate = await act(boss, "admin/merchants/actions.ts", "setBusinessStatus", shop.id, "active");
  check("admin reactivates", reactivate.ok === true, reactivate);
  check("coupon is live again", await isLive(coupon.id));
  const bad = await act(boss, "admin/merchants/actions.ts", "setBusinessStatus", "nope", "active");
  check("bad id is refused", bad.ok === false, bad);
  const list = must(await boss.client.rpc("admin_list_businesses", { p_query: owner.email }), "list");
  check("search by owner email finds all three", list.length === 3, list.length);
  const byName = must(await boss.client.rpc("admin_list_businesses", { p_query: `No plan shop ${run}` }), "list");
  check("search by name finds one", byName.length === 1 && byName[0].plan_source === null, byName);
  const listAsOwner = await owner.client.rpc("admin_list_businesses", {});
  check("non-admins cannot list businesses", Boolean(listAsOwner.error));

  console.log("\nSubscriptions");
  const grant = await act(boss, "admin/subscriptions/actions.ts", "setComplimentaryPlan", noPlan.id, day(60));
  check("grant with an end date", grant.ok === true, grant);
  let plan = must(await admin.from("subscriptions").select("*").eq("business_id", noPlan.id).single(), "plan");
  check("plan is complimentary and active", plan.source === "complimentary" && plan.status === "active");
  check("ends at the end of that day in the business timezone", plan.current_period_end && new Date(plan.current_period_end).toISOString().startsWith(day(61)), plan.current_period_end);
  const extend = await act(boss, "admin/subscriptions/actions.ts", "extendComplimentaryPlan", noPlan.id);
  check("extend by a year", extend.ok === true, extend);
  const extended = must(await admin.from("subscriptions").select("current_period_end").eq("business_id", noPlan.id).single(), "p");
  const gain = (new Date(extended.current_period_end) - new Date(plan.current_period_end)) / 86_400_000;
  check("end date moved on by a year", gain >= 365 && gain <= 366, gain);
  const forever = await act(boss, "admin/subscriptions/actions.ts", "setComplimentaryPlan", noPlan.id, "");
  check("change to no end date", forever.ok === true && /no end date/.test(forever.message), forever);
  const noExtend = await act(boss, "admin/subscriptions/actions.ts", "extendComplimentaryPlan", noPlan.id);
  check("cannot extend a plan with no end", noExtend.ok === false, noExtend);
  const past = await act(boss, "admin/subscriptions/actions.ts", "setComplimentaryPlan", noPlan.id, day(-3));
  check("a past end date is refused", past.ok === false && /already passed/.test(past.error), past);
  const junk = await act(boss, "admin/subscriptions/actions.ts", "setComplimentaryPlan", noPlan.id, "next tuesday");
  check("a non-date is refused", junk.ok === false, junk);
  const revoke = await act(boss, "admin/subscriptions/actions.ts", "revokeComplimentaryPlan", noPlan.id);
  check("revoke", revoke.ok === true, revoke);
  plan = must(await admin.from("subscriptions").select("*").eq("business_id", noPlan.id).single(), "plan");
  check("plan is canceled and ended", plan.status === "canceled" && new Date(plan.current_period_end) <= new Date());
  const revokeAgain = await act(boss, "admin/subscriptions/actions.ts", "revokeComplimentaryPlan", noPlan.id);
  check("revoking twice says there is no active plan", revokeAgain.ok === false, revokeAgain);
  const regrant = await act(boss, "admin/subscriptions/actions.ts", "setComplimentaryPlan", noPlan.id, day(30));
  check("grant again after revoking", regrant.ok === true, regrant);
  const stripe = await act(boss, "admin/subscriptions/actions.ts", "setComplimentaryPlan", paid.id, day(30));
  check("paid plans are left alone", stripe.ok === false && /paid plan/.test(stripe.error), stripe);
  const stripeRevoke = await act(boss, "admin/subscriptions/actions.ts", "revokeComplimentaryPlan", paid.id);
  check("paid plans cannot be revoked here", stripeRevoke.ok === false && /paid plan/.test(stripeRevoke.error), stripeRevoke);
  const ownerGrant = await callAction(base, owner.cookie, A("admin/subscriptions/actions.ts"), "setComplimentaryPlan", [noPlan.id, ""]);
  check("merchant cannot grant themselves a plan", ownerGrant.blocked === true, ownerGrant);

  // Revoking the shop's plan hides its coupon, granting brings it back.
  await act(boss, "admin/subscriptions/actions.ts", "revokeComplimentaryPlan", shop.id);
  check("revoked plan hides the coupon", !(await isLive(coupon.id)));
  await act(boss, "admin/subscriptions/actions.ts", "setComplimentaryPlan", shop.id, "");
  check("new plan shows it again", await isLive(coupon.id));

  console.log("\nCoupons");
  const feature = await act(boss, "admin/coupons/actions.ts", "setCouponFeatured", coupon.id, true);
  check("feature a coupon", feature.ok === true, feature);
  const { data: featured } = await anon.rpc("search_live_coupons", { p_featured_only: true, p_limit: 60 });
  check("it shows in the featured list", (featured ?? []).some((c) => c.id === coupon.id));
  const ownerFeature = await owner.client.from("coupons").update({ featured: false }).eq("id", coupon.id);
  check("the merchant cannot unfeature it themselves", Boolean(ownerFeature.error));
  const unfeature = await act(boss, "admin/coupons/actions.ts", "setCouponFeatured", coupon.id, false);
  check("remove from featured", unfeature.ok === true);
  const badFlag = await act(boss, "admin/coupons/actions.ts", "setCouponFeatured", coupon.id, "yes");
  check("featured must be true or false", badFlag.ok === false, badFlag);
  console.log("\nAdmin hold (unpublish that sticks)");
  const M = "merchant/coupons/actions.ts";
  const merchantSays = async (name, ...args) => {
    const r = await callAction(base, owner.cookie, A(M), name, args);
    return r.value ?? r;
  };
  const selfHold = await owner.client.from("coupons").update({ admin_hold: true }).eq("id", coupon.id);
  check("a merchant cannot place a hold", Boolean(selfHold.error));
  const heldEarlier = must(await shopper.client.rpc("create_redemption_token", { p_coupon_id: coupon.id }), "token before hold");
  const reason = "Price does not match the shop window";
  const hold = await act(boss, "admin/coupons/actions.ts", "holdCoupon", coupon.id, reason);
  check("admin unpublishes with a reason", hold.ok === true, hold);
  const held = must(await admin.from("coupons").select("*").eq("id", coupon.id).single(), "held");
  check("hold, reason, who and when are recorded", held.admin_hold && held.hold_reason === reason && held.held_by === boss.id && Boolean(held.held_at), held);
  check("status is left as it was", held.status === "published");
  check("held coupon is not in live_coupons or search", !(await isLive(coupon.id)));
  const heldToken = must(await shopper.client.rpc("create_redemption_token", { p_coupon_id: coupon.id }), "token");
  check("shoppers cannot get a code for it", heldToken.result === "not_live", heldToken);
  const heldVerify = must(await owner.client.rpc("verify_redemption", { p_token_or_code: heldEarlier.token, p_location_id: store.id }), "verify");
  check("a code issued before the hold cannot be redeemed", heldVerify.result === "coupon_not_live", heldVerify);
  const heldPreview = must(await owner.client.rpc("preview_redemption", { p_token_or_code: heldEarlier.short_code, p_location_id: store.id }), "preview");
  check("the confirm screen refuses it too", heldPreview.result === "coupon_not_live", heldPreview);
  const holdAgain = await act(boss, "admin/coupons/actions.ts", "holdCoupon", coupon.id, "");
  check("unpublishing twice says so", holdAgain.ok === false && /already unpublished/.test(holdAgain.error), holdAgain);
  const longReason = await act(boss, "admin/coupons/actions.ts", "holdCoupon", coupon.id, "x".repeat(501));
  check("a reason over 500 characters is refused", longReason.ok === false, longReason);

  const pause = await merchantSays("setCouponStatus", coupon.id, "paused");
  check("merchant cannot pause or resume it through the app", pause.ok === false && /removed this coupon/.test(pause.error), pause);
  const directPause = await owner.client.from("coupons").update({ status: "paused" }).eq("id", coupon.id).select("status");
  check("a status change that is not publishing is allowed in the database", !directPause.error && directPause.data?.[0]?.status === "paused", directPause.error);
  const directPublish = await owner.client.from("coupons").update({ status: "published" }).eq("id", coupon.id);
  check("merchant cannot republish it, even straight to the database", directPublish.error?.message?.includes("removed this coupon"), directPublish.error);
  const resume = await merchantSays("setCouponStatus", coupon.id, "published");
  check("Resume coupon is refused", resume.ok === false && /removed this coupon/.test(resume.error), resume);
  const selfRelease = await owner.client.from("coupons").update({ admin_hold: false }).eq("id", coupon.id);
  check("merchant cannot release the hold in the database", Boolean(selfRelease.error));
  const reasonEdit = await owner.client.from("coupons").update({ hold_reason: "All fine now" }).eq("id", coupon.id);
  check("merchant cannot change the reason", Boolean(reasonEdit.error));
  const ownerRelease = await callAction(base, owner.cookie, A("admin/coupons/actions.ts"), "releaseCouponHold", [coupon.id]);
  check("merchant cannot use the admin release action", ownerRelease.blocked === true, ownerRelease);

  const editInput = {
    title: `Admin test coupon ${run}`,
    description: "Edited while removed",
    categoryId,
    discountType: "percent",
    discountValue: 15,
    includedProducts: "",
    limitsText: "",
    minSpend: "",
    minQty: "",
    maxPeople: "",
    startsOn: day(0),
    expiresOn: day(7),
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
  };
  const publishEdit = await merchantSays("saveCoupon", coupon.id, editInput, "publish");
  check("saving with Publish is refused", publishEdit.ok === false && /removed this coupon/.test(publishEdit.error), publishEdit);
  const saveEdit = await merchantSays("saveCoupon", coupon.id, editInput, "save");
  check("merchant can still edit it", Boolean(saveEdit.redirect), saveEdit);
  const edited = must(await admin.from("coupons").select("description, admin_hold, status").eq("id", coupon.id).single(), "edited");
  check("the edit saved and the hold stayed", edited.description === "Edited while removed" && edited.admin_hold && edited.status === "paused", edited);

  console.log("\nCoupon builder: new offer kinds and rules, through the merchant's save action");
  const ruleInput = {
    ...editInput,
    title: `Free cookie Tuesdays ${run}`,
    description: "",
    discountType: "free",
    discountValue: "",
    perUserMode: "limited",
    perUserLimit: 3,
    redeemFrequency: "week",
    scheduleOn: true,
    scheduleDays: [4, 2],
    scheduleStart: "11:00",
    scheduleEnd: "15:00",
  };
  const savedRules = await merchantSays("saveCoupon", null, ruleInput, "publish");
  check("a free coupon with rules publishes", Boolean(savedRules.redirect), savedRules);
  const ruleRow = must(await admin.from("coupons").select("*").eq("title", ruleInput.title).single(), "rule coupon");
  check(
    "stored as: free with no value, up to 3 per customer, once a week, Tuesday and Thursday 11:00 to 15:00",
    ruleRow.discount_type === "free" &&
      ruleRow.discount_value === null &&
      ruleRow.per_user_limit === 3 &&
      ruleRow.redeem_frequency === "week" &&
      JSON.stringify(ruleRow.schedule_days) === "[2,4]" &&
      ruleRow.schedule_start === "11:00:00" &&
      ruleRow.schedule_end === "15:00:00",
    ruleRow,
  );
  const unlimitedInput = { ...ruleInput, title: `Unlimited ${run}`, discountType: "fixed_price", discountValue: 1, perUserMode: "unlimited", perUserLimit: "", redeemFrequency: "none", scheduleOn: false };
  await merchantSays("saveCoupon", null, unlimitedInput, "draft");
  const unlimitedRow = must(await admin.from("coupons").select("*").eq("title", unlimitedInput.title).single(), "unlimited coupon");
  check("unlimited per customer is stored as no limit, fixed price keeps its price", unlimitedRow.per_user_limit === null && Number(unlimitedRow.discount_value) === 1 && unlimitedRow.schedule_days === null && unlimitedRow.schedule_start === null);
  const noNumber = await merchantSays("saveCoupon", null, { ...ruleInput, title: `Bad ${run}`, perUserLimit: "" }, "draft");
  check("Up to without a number is refused", noNumber.ok === false, noNumber);
  const backwards = await merchantSays("saveCoupon", null, { ...ruleInput, title: `Bad ${run}`, scheduleStart: "16:00", scheduleEnd: "09:00" }, "draft");
  check("a time window that ends before it starts is refused", backwards.ok === false, backwards);
  const noDays = await merchantSays("saveCoupon", null, { ...ruleInput, title: `Bad ${run}`, scheduleDays: [] }, "draft");
  check("a schedule with no days is refused", noDays.ok === false, noDays);
  const noPrice = await merchantSays("saveCoupon", null, { ...ruleInput, title: `Bad ${run}`, discountType: "fixed_price", discountValue: "" }, "draft");
  check("a fixed price with no price is refused", noPrice.ok === false, noPrice);

  const fetchPage = (path, who) =>
    fetch(`${base}${path}`, { redirect: "manual", headers: { cookie: who.cookie } }).then(async (r) => (await r.text()).replaceAll("<!-- -->", ""));
  const merchantList = await fetchPage("/merchant/coupons?view=removed", owner);
  check("merchant list shows Removed by Coupersville with the reason", merchantList.includes("Removed by Coupersville") && merchantList.includes(reason));
  const merchantEdit = await fetchPage(`/merchant/coupons/${coupon.id}`, owner);
  check("edit page explains the removal, offers Delete coupon and no Resume", merchantEdit.includes(`Reason: ${reason}`) && merchantEdit.includes("Delete coupon") && !merchantEdit.includes("Resume coupon") && !merchantEdit.includes("Publish coupon"));
  const adminRemoved = await fetchPage("/admin/coupons?view=removed", boss);
  check("admin removed filter lists it with the reason and Release hold", adminRemoved.includes(`Admin test coupon ${run}`) && adminRemoved.includes(reason) && adminRemoved.includes("Release hold"));

  const release = await act(boss, "admin/coupons/actions.ts", "releaseCouponHold", coupon.id);
  check("admin releases the hold", release.ok === true, release);
  const released = must(await admin.from("coupons").select("*").eq("id", coupon.id).single(), "released");
  check("hold fields are cleared", !released.admin_hold && released.hold_reason === null && released.held_by === null && released.held_at === null, released);
  const releaseAgain = await act(boss, "admin/coupons/actions.ts", "releaseCouponHold", coupon.id);
  check("releasing twice says it is not on hold", releaseAgain.ok === false, releaseAgain);
  const resumeAfter = await merchantSays("setCouponStatus", coupon.id, "published");
  check("after release the merchant can resume it", resumeAfter.ok === true, resumeAfter);
  check("and it is live again", await isLive(coupon.id));

  // Deleting a held coupon: allowed, unless it has redemptions (that would erase them).
  const spare = must(
    await admin
      .from("coupons")
      .insert({
        business_id: shop.id,
        category_id: categoryId,
        title: `Spare ${run}`,
        discount_type: "amount",
        discount_value: 1,
        starts_at: new Date(Date.now() - 3_600_000).toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        status: "published",
      })
      .select()
      .single(),
    "spare",
  );
  const spareToken = must(await shopper.client.rpc("create_redemption_token", { p_coupon_id: spare.id }), "spare token");
  must(await owner.client.rpc("verify_redemption", { p_token_or_code: spareToken.token, p_location_id: store.id }), "spare redeem");
  await act(boss, "admin/coupons/actions.ts", "holdCoupon", spare.id, "");
  const keepRedeemed = await merchantSays("deleteCoupon", spare.id);
  check("a removed coupon that was redeemed is kept", keepRedeemed.ok === false && /kept for your records/.test(keepRedeemed.error), keepRedeemed);
  must(await admin.from("redemptions").delete().eq("coupon_id", spare.id), "clear spare redemptions");
  const deleteHeld = await merchantSays("deleteCoupon", spare.id);
  check("a removed coupon with no redemptions can be deleted", Boolean(deleteHeld.redirect), deleteHeld);
  check("it is gone", (await admin.from("coupons").select("id").eq("id", spare.id)).data.length === 0);
  const deleteLive = await merchantSays("deleteCoupon", coupon.id);
  check("a live coupon still cannot be deleted", deleteLive.ok === false, deleteLive);

  console.log("\nCategories");
  const before = must(await admin.from("categories").select("id"), "count").length;
  const create = await act(boss, "admin/categories/actions.ts", "createCategory", {
    name: `Test Market ${run}`,
    slug: "",
    shopLabel: "The test market",
    tint: "sky",
  });
  check("add a category", create.ok === true, create);
  const cat = must(await admin.from("categories").select("*").eq("name", `Test Market ${run}`).single(), "cat");
  created.categories.push(cat.id);
  check("web address name made from the name", cat.slug === `test-market-${run}`, cat.slug);
  const maxOrder = Math.max(...must(await admin.from("categories").select("sort_order"), "o").map((c) => c.sort_order));
  check("added at the end", cat.sort_order === maxOrder, { sort: cat.sort_order, maxOrder, before });
  const dupe = await act(boss, "admin/categories/actions.ts", "createCategory", { name: "Bakeries again", slug: "bakeries", shopLabel: "x", tint: "mint" });
  check("a taken web address name is refused", dupe.ok === false && /already uses/.test(dupe.error), dupe);
  const badSlug = await act(boss, "admin/categories/actions.ts", "createCategory", { name: "Bad", slug: "Not OK!", shopLabel: "x", tint: "mint" });
  check("an invalid web address name is refused", badSlug.ok === false, badSlug);
  const rename = await act(boss, "admin/categories/actions.ts", "updateCategory", cat.id, {
    name: `Test Bazaar ${run}`,
    slug: `test-bazaar-${run}`,
    shopLabel: "The bazaar",
    tint: "butter",
  });
  check("rename, relabel and retint", rename.ok === true, rename);
  const renamed = must(await admin.from("categories").select("*").eq("id", cat.id).single(), "cat");
  check("saved", renamed.name === `Test Bazaar ${run}` && renamed.shop_label === "The bazaar" && renamed.stock_tint === "butter");
  const ordered = () => admin.from("categories").select("id").order("sort_order").order("name").then((r) => r.data.map((c) => c.id));
  const beforeMove = await ordered();
  const up = await act(boss, "admin/categories/actions.ts", "moveCategory", cat.id, "up");
  const afterUp = await ordered();
  check("move up one place", up.ok === true && afterUp.indexOf(cat.id) === beforeMove.indexOf(cat.id) - 1, up);
  const down = await act(boss, "admin/categories/actions.ts", "moveCategory", cat.id, "down");
  check("move back down", down.ok === true && (await ordered()).indexOf(cat.id) === beforeMove.indexOf(cat.id));
  const tooFar = await act(boss, "admin/categories/actions.ts", "moveCategory", cat.id, "down");
  check("last cannot move down", tooFar.ok === false, tooFar);

  const catCoupon = must(
    await admin
      .from("coupons")
      .insert({
        business_id: shop.id,
        category_id: cat.id,
        title: `Bazaar coupon ${run}`,
        discount_type: "amount",
        discount_value: 2,
        starts_at: new Date(Date.now() - 3_600_000).toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        status: "published",
      })
      .select()
      .single(),
    "cat coupon",
  );
  check("coupon in the new category is live", await isLive(catCoupon.id));
  const deactivate = await act(boss, "admin/categories/actions.ts", "setCategoryActive", cat.id, false);
  check("deactivate", deactivate.ok === true, deactivate);
  const { data: hiddenSearch } = await anon.rpc("search_live_coupons", { p_limit: 60 });
  check("its coupon drops out of shopper search", !(hiddenSearch ?? []).some((c) => c.id === catCoupon.id));
  const { data: anonCats } = await anon.from("categories").select("id").eq("id", cat.id);
  check("shoppers no longer see the category", (anonCats ?? []).length === 0);
  const noDelete = await act(boss, "admin/categories/actions.ts", "deleteCategory", cat.id);
  check("a category with coupons cannot be deleted", noDelete.ok === false && /Deactivate it instead/.test(noDelete.error), noDelete);
  const reactivateCat = await act(boss, "admin/categories/actions.ts", "setCategoryActive", cat.id, true);
  check("activate again", reactivateCat.ok === true);
  must(await admin.from("coupons").delete().eq("id", catCoupon.id), "remove cat coupon");
  const del = await act(boss, "admin/categories/actions.ts", "deleteCategory", cat.id);
  check("an unused category can be deleted", del.ok === true, del);
  check("gone", (await admin.from("categories").select("id").eq("id", cat.id)).data.length === 0);
  const ownerCat = await callAction(base, owner.cookie, A("admin/categories/actions.ts"), "createCategory", [
    { name: "Sneaky", slug: "", shopLabel: "x", tint: "mint" },
  ]);
  check("merchant cannot add categories", ownerCat.blocked === true, ownerCat);

  console.log("\nSettings");
  const settings = {
    subscription_expiry: "hide_coupons",
    founders_rule: originalSettings.founders_rule,
    founders_full: originalSettings.founders_full_early_access ? "early_access" : "wait",
    publishing_opens_on: "2026-10-01",
  };
  const save = await act(boss, "admin/settings/actions.ts", "updateSettings", settings);
  check("save settings", save.ok === true, save);
  const sneaky = await act(boss, "admin/settings/actions.ts", "updateSettings", { ...settings, consumer_login: "login_required" });
  const stored = must(await admin.from("platform_settings").select("*").eq("singleton", true).single(), "settings");
  check("settings not shown in the UI cannot be changed through the action", sneaky.ok === true && stored.consumer_login === originalSettings.consumer_login, stored);
  check("the publishing date is saved as midnight Pacific", new Date(stored.publishing_opens_at).toISOString() === "2026-10-01T07:00:00.000Z", stored.publishing_opens_at);
  const invalid = await act(boss, "admin/settings/actions.ts", "updateSettings", { ...settings, founders_rule: "anyone" });
  check("an unknown value is refused", invalid.ok === false, invalid);
  const ownerSettings = await callAction(base, owner.cookie, A("admin/settings/actions.ts"), "updateSettings", [settings]);
  check("merchant cannot change settings", ownerSettings.blocked === true, ownerSettings);

  console.log("\nStats");
  const statsRes = must(await boss.client.rpc("admin_platform_stats"), "stats");
  check("admin stats load", typeof statsRes.live_coupons === "number" && Array.isArray(statsRes.top_coupons), statsRes);
  const statsOwner = await owner.client.rpc("admin_platform_stats");
  check("non-admins cannot read platform stats", Boolean(statsOwner.error));

  console.log("\nAdmin pages");
  const page = async (path, who) => {
    const res = await fetch(`${base}${path}`, { redirect: "manual", headers: who ? { cookie: who.cookie } : {} });
    return { status: res.status, location: res.headers.get("location") ?? "", body: res.status === 200 ? (await res.text()).replaceAll("<!-- -->", "") : "" };
  };
  for (const [path, text] of [
    ["/admin", "Town hall"],
    ["/admin/merchants", `Admin test shop ${run}`],
    [`/admin/merchants/${shop.id}`, "Suspend business"],
    ["/admin/coupons", "All coupons"],
    [`/admin/coupons?business=${shop.id}`, `Admin test coupon ${run}`],
    ["/admin/subscriptions", `No plan shop ${run}`],
    ["/admin/categories", "Main Street order"],
    ["/admin/settings", "When a plan ends"],
    ["/admin/offers", "Founding Merchant"],
  ]) {
    const r = await page(path, boss);
    check(`admin ${path}`, r.status === 200 && r.body.includes(text), `${r.status} ${r.location}`);
  }
  const settingsPage = await page("/admin/settings", boss);
  check("settings page leaves out the settings not built yet", !/Redemption method|Coupon moderation|Shopper sign-in|Region restriction|One annual plan/.test(settingsPage.body));
  check("settings page has the Founders settings and the publishing date", /Founding Merchant qualifies/.test(settingsPage.body) && /Publishing opens on/.test(settingsPage.body));
  const merchantAdmin = await page("/admin/merchants", owner);
  check("merchant is sent away from /admin", merchantAdmin.status === 307 && merchantAdmin.location.includes("/merchant"), merchantAdmin.location);

  console.log("\nPhase 4 actions, through the app");
  const startOk = await callAction(base, shopper.cookie, A("redeem/actions.ts"), "startRedemption", [coupon.id]);
  check("Redeem now opens the redeem screen", /^\/redeem\/[0-9a-f-]{36}$/.test(startOk.redirect ?? ""), startOk);
  const tokenId = startOk.redirect?.split("/").pop();
  const { data: tok } = await admin.from("redemption_tokens").select("short_code, token").eq("id", tokenId).single();
  const inviteRes = await callAction(base, owner.cookie, A("merchant/staff/actions.ts"), "inviteStaff", [{ email: staff.email.toUpperCase() }]);
  check("owner creates a staff invite and it is emailed", inviteRes.value?.ok === true && /emailed/.test(inviteRes.value.message), inviteRes);
  const dupInvite = await callAction(base, owner.cookie, A("merchant/staff/actions.ts"), "inviteStaff", [{ email: staff.email }]);
  check("a second invite for the same email is refused", dupInvite.value?.ok === false, dupInvite);
  const { data: inv } = await admin.from("staff_invites").select("token").eq("business_id", shop.id).single();
  const wrongJoin = await callAction(base, shopper.cookie, A("join/actions.ts"), "acceptInvite", [inv.token]);
  check("someone else cannot use the invite", wrongJoin.value?.ok === false && /different email/.test(wrongJoin.value.error), wrongJoin);
  const join = await callAction(base, staff.cookie, A("join/actions.ts"), "acceptInvite", [inv.token]);
  check("invited staff join and land on the scanner", join.redirect === "/merchant/scan", join);
  const preview = await callAction(base, staff.cookie, A("merchant/scan/actions.ts"), "previewRedemption", [`${tok.short_code.slice(0, 3)} ${tok.short_code.slice(3)}`, store.id]);
  check("staff preview by code (with a space) shows the offer", preview.value?.ok && preview.value.response.result === "ok" && preview.value.response.offer.title === coupon.title, preview);
  check("preview recorded nothing", (await admin.from("redemptions").select("id").eq("token_id", tokenId)).data.length === 0);
  const confirm = await callAction(base, staff.cookie, A("merchant/scan/actions.ts"), "confirmRedemption", [tok.token, store.id]);
  check("staff confirm redeems", confirm.value?.response?.result === "ok", confirm);
  const confirmAgain = await callAction(base, staff.cookie, A("merchant/scan/actions.ts"), "confirmRedemption", [tok.token, store.id]);
  check("confirming again says already used", confirmAgain.value?.response?.result === "already_used", confirmAgain);
  const shopperScan = await callAction(base, shopper.cookie, A("merchant/scan/actions.ts"), "confirmRedemption", [tok.token, store.id]);
  check("a shopper cannot redeem", shopperScan.blocked === true, shopperScan);
  const startAgain = await callAction(base, shopper.cookie, A("redeem/actions.ts"), "startRedemption", [coupon.id]);
  check("Redeem now after using it says the limit is reached", startAgain.value?.ok === false && /already used/.test(startAgain.value.error), startAgain);
  const { data: member } = await admin.from("business_members").select("id").eq("business_id", shop.id).eq("user_id", staff.id).single();
  const remove = await callAction(base, owner.cookie, A("merchant/staff/actions.ts"), "removeStaff", [member.id]);
  check("owner removes staff", remove.value?.ok === true, remove);
  const { data: ownerRow } = await admin.from("business_members").select("id").eq("business_id", shop.id).eq("user_id", owner.id).single();
  const removeOwner = await callAction(base, owner.cookie, A("merchant/staff/actions.ts"), "removeStaff", [ownerRow.id]);
  check("the owner row cannot be removed", removeOwner.value?.ok === false, removeOwner);

  await deleteBusinessChecks(boss, categoryId);
}

// A 1x1 PNG, for images the deletion must remove.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function uploaded(businessId) {
  let n = 0;
  for (const bucket of ["logos", "coupon-images"]) n += ((await admin.storage.from(bucket).list(businessId)).data ?? []).length;
  return n;
}

// A business with details, a store with a phone, two coupons with images, a staff invite and a logo.
async function shopWithEverything(label, categoryId) {
  const owner = await user(label, "merchant");
  const b = await business(owner, `Delete ${label} ${run}`, null);
  must(
    await admin
      .from("businesses")
      .update({ description: "About us", contact_email: `cpv-test-${run}-${label}-contact@example.com`, contact_phone: "555-0101", website_url: "https://example.com", logo_path: `${b.id}/logo.png` })
      .eq("id", b.id),
    "details",
  );
  const store = must(await admin.from("locations").insert({ business_id: b.id, store_name: "Main", address_line1: "1 Main St", city: "Coupersville", phone: "555-0102" }).select().single(), "store");
  const coupon = (title) =>
    admin
      .from("coupons")
      .insert({
        business_id: b.id,
        category_id: categoryId,
        title: `${title} ${run}`,
        discount_type: "percent",
        discount_value: 10,
        starts_at: new Date(Date.now() - 86_400_000).toISOString(),
        expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        status: "published",
        image_path: `${b.id}/coupon.png`,
      })
      .select()
      .single();
  const redeemed = must(await coupon("Redeemed"), "coupon a");
  const unredeemed = must(await coupon("Unredeemed"), "coupon b");
  must(await admin.from("staff_invites").insert({ business_id: b.id, email: `cpv-test-${run}-${label}-staff@example.com`, invited_by: owner.id }), "invite");
  must(await admin.storage.from("logos").upload(`${b.id}/logo.png`, PNG, { contentType: "image/png" }), "logo");
  must(await admin.storage.from("coupon-images").upload(`${b.id}/coupon.png`, PNG, { contentType: "image/png" }), "coupon image");
  return { owner, b, store, redeemed, unredeemed };
}

async function deleteBusinessChecks(boss, categoryId) {
  console.log("\nAdmin deletes a business");
  const clean = await shopWithEverything("clean", categoryId);
  const page = await fetch(`${base}/admin/merchants/${clean.b.id}`, { headers: { cookie: boss.cookie } }).then((r) => r.text());
  check("the business page offers Delete business and says everything goes", page.includes("Delete business") && page.includes("Everything is deleted"));
  const notAdmin = await act(clean.owner, "admin/merchants/actions.ts", "deleteBusinessAction", clean.b.id, clean.b.name);
  check("only an admin can delete a business", notAdmin?.ok === false || notAdmin?.blocked === true, notAdmin);
  const wrongName = await act(boss, "admin/merchants/actions.ts", "deleteBusinessAction", clean.b.id, "delete");
  check("the business name must be typed to confirm", wrongName?.ok === false && /Type the business name/.test(wrongName.error), wrongName);
  check("nothing is removed before that", Boolean((await admin.from("businesses").select("id").eq("id", clean.b.id).maybeSingle()).data) && (await uploaded(clean.b.id)) === 2);
  const full = await act(boss, "admin/merchants/actions.ts", "deleteBusinessAction", clean.b.id, clean.b.name);
  check("no payments, redemptions or seat: deleted completely", full?.redirect === "/admin/merchants?deleted=1" && !(await admin.from("businesses").select("id").eq("id", clean.b.id).maybeSingle()).data, full);
  check(
    "with its stores, coupons and invites",
    (await admin.from("locations").select("id").eq("business_id", clean.b.id)).data.length === 0 &&
      (await admin.from("coupons").select("id").eq("business_id", clean.b.id)).data.length === 0 &&
      (await admin.from("staff_invites").select("id").eq("business_id", clean.b.id)).data.length === 0,
  );
  check("and its images", (await uploaded(clean.b.id)) === 0);

  const used = await shopWithEverything("used", categoryId);
  const shopper = await user("delshopper", "consumer");
  must(await admin.from("redemptions").insert({ coupon_id: used.redeemed.id, user_id: shopper.id, business_id: used.b.id, location_id: used.store.id, method: "code" }), "redemption");
  must(await admin.from("subscriptions").insert({ business_id: used.b.id, source: "complimentary", status: "active", current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString() }), "plan");
  const usedPage = await fetch(`${base}/admin/merchants/${used.b.id}`, { headers: { cookie: boss.cookie } }).then((r) => r.text());
  check("with a redemption, the page says which records are kept", usedPage.includes("It has 1 redemption") && usedPage.includes("are kept"));
  const kept = await act(boss, "admin/merchants/actions.ts", "deleteBusinessAction", used.b.id, used.b.name);
  check("deleting it keeps only the records", kept?.ok === true && /are kept/.test(kept.message), kept);
  const bAfter = must(await admin.from("businesses").select("*").eq("id", used.b.id).single(), "kept business");
  check("kept: the name, suspended, with no owner", bAfter.name === used.b.name && bAfter.status === "suspended" && bAfter.owner_id === null, bAfter);
  check("removed: description, contact email, phone, website and logo", [bAfter.description, bAfter.contact_email, bAfter.contact_phone, bAfter.website_url, bAfter.logo_path].every((v) => v === null), bAfter);
  const storeAfter = must(await admin.from("locations").select("*").eq("id", used.store.id).single(), "kept store");
  check("kept: the store address; removed: its phone", storeAfter.address_line1 === "1 Main St" && storeAfter.phone === null && storeAfter.active === false, storeAfter);
  const couponsAfter = must(await admin.from("coupons").select("id, status, image_path").eq("business_id", used.b.id), "kept coupons");
  check(
    "kept: the redeemed coupon (paused, no image); removed: the one nobody redeemed",
    couponsAfter.length === 1 && couponsAfter[0].id === used.redeemed.id && couponsAfter[0].status === "paused" && couponsAfter[0].image_path === null,
    couponsAfter,
  );
  check("the redemption count is unchanged", (await admin.from("redemptions").select("id").eq("business_id", used.b.id)).data.length === 1);
  check(
    "removed: the team, staff invites and images",
    (await admin.from("business_members").select("id").eq("business_id", used.b.id)).data.length === 0 &&
      (await admin.from("staff_invites").select("id").eq("business_id", used.b.id)).data.length === 0 &&
      (await uploaded(used.b.id)) === 0,
  );
  const planAfter = must(await admin.from("subscriptions").select("cancel_at_period_end").eq("business_id", used.b.id).single(), "kept plan");
  check("kept: the plan record, which no longer renews", planAfter.cancel_at_period_end === true, planAfter);
}

async function cleanup() {
  for (const id of created.businesses) await admin.from("businesses").delete().eq("id", id);
  for (const id of created.categories) await admin.from("categories").delete().eq("id", id);
  for (const c of originalOrder) await admin.from("categories").update({ sort_order: c.sort_order }).eq("id", c.id);
  if (originalSettings) {
    const { redemption_method, coupon_moderation, subscription_expiry, consumer_login, plans, region_restriction, publishing_opens_at, founders_rule, founders_full_early_access } =
      originalSettings;
    await admin
      .from("platform_settings")
      .update({ redemption_method, coupon_moderation, subscription_expiry, consumer_login, plans, region_restriction, publishing_opens_at, founders_rule, founders_full_early_access })
      .eq("singleton", true);
  }
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
}

try {
  await main();
} catch (error) {
  failed += 1;
  console.error("\nStopped early:", error.message);
} finally {
  await cleanup();
  console.log(`\n${passed} passed, ${failed} failed. Test data removed, category order and settings restored.`);
  process.exit(failed ? 1 : 0);
}
