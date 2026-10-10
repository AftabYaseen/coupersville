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
  check("Stripe plans are left alone", stripe.ok === false && /Stripe/.test(stripe.error), stripe);
  const stripeRevoke = await act(boss, "admin/subscriptions/actions.ts", "revokeComplimentaryPlan", paid.id);
  check("Stripe plans cannot be revoked here", stripeRevoke.ok === false && /Stripe/.test(stripeRevoke.error), stripeRevoke);
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
    perUserLimit: 1,
    totalLimit: "",
  };
  const publishEdit = await merchantSays("saveCoupon", coupon.id, editInput, "publish");
  check("saving with Publish is refused", publishEdit.ok === false && /removed this coupon/.test(publishEdit.error), publishEdit);
  const saveEdit = await merchantSays("saveCoupon", coupon.id, editInput, "save");
  check("merchant can still edit it", Boolean(saveEdit.redirect), saveEdit);
  const edited = must(await admin.from("coupons").select("description, admin_hold, status").eq("id", coupon.id).single(), "edited");
  check("the edit saved and the hold stayed", edited.description === "Edited while removed" && edited.admin_hold && edited.status === "paused", edited);

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
  const settings = { subscription_expiry: "hide_coupons", plans: "single_annual" };
  const save = await act(boss, "admin/settings/actions.ts", "updateSettings", settings);
  check("save settings", save.ok === true, save);
  const sneaky = await act(boss, "admin/settings/actions.ts", "updateSettings", { ...settings, consumer_login: "login_required" });
  const stored = must(await admin.from("platform_settings").select("*").eq("singleton", true).single(), "settings");
  check("settings not shown in the UI cannot be changed through the action", sneaky.ok === true && stored.consumer_login === originalSettings.consumer_login, stored);
  const invalid = await act(boss, "admin/settings/actions.ts", "updateSettings", { ...settings, plans: "monthly" });
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
  ]) {
    const r = await page(path, boss);
    check(`admin ${path}`, r.status === 200 && r.body.includes(text), `${r.status} ${r.location}`);
  }
  const settingsPage = await page("/admin/settings", boss);
  check("settings page leaves out the settings not built yet", !/Redemption method|Coupon moderation|Shopper sign-in|Region restriction/.test(settingsPage.body));
  const merchantAdmin = await page("/admin/merchants", owner);
  check("merchant is sent away from /admin", merchantAdmin.status === 307 && merchantAdmin.location.includes("/merchant"), merchantAdmin.location);

  console.log("\nPhase 4 actions, through the app");
  const startOk = await callAction(base, shopper.cookie, A("redeem/actions.ts"), "startRedemption", [coupon.id]);
  check("Redeem now opens the redeem screen", /^\/redeem\/[0-9a-f-]{36}$/.test(startOk.redirect ?? ""), startOk);
  const tokenId = startOk.redirect?.split("/").pop();
  const { data: tok } = await admin.from("redemption_tokens").select("short_code, token").eq("id", tokenId).single();
  const inviteRes = await callAction(base, owner.cookie, A("merchant/staff/actions.ts"), "inviteStaff", [{ email: staff.email.toUpperCase() }]);
  check("owner creates a staff invite", inviteRes.value?.ok === true, inviteRes);
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
}

async function cleanup() {
  for (const id of created.businesses) await admin.from("businesses").delete().eq("id", id);
  for (const id of created.categories) await admin.from("categories").delete().eq("id", id);
  for (const c of originalOrder) await admin.from("categories").update({ sort_order: c.sort_order }).eq("id", c.id);
  if (originalSettings) {
    const { redemption_method, coupon_moderation, subscription_expiry, consumer_login, plans, region_restriction } = originalSettings;
    await admin
      .from("platform_settings")
      .update({ redemption_method, coupon_moderation, subscription_expiry, consumer_login, plans, region_restriction })
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
