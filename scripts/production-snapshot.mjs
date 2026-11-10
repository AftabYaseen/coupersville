// Read-only snapshot of shared production data, taken before and after a production test run
// (billing Part B, 2026-11-04). Nothing here writes to the database.
//
//   node --env-file=.env.local scripts/production-snapshot.mjs save before.json
//   node --env-file=.env.local scripts/production-snapshot.mjs compare before.json after.json
//
// compare prints both snapshots side by side where they differ and exits 1 unless they match exactly.

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const COUNTED = [
  "businesses", "coupons", "subscriptions", "offer_seat_claims", "locations", "business_members", "staff_invites",
  "favorites", "redemptions", "redemption_tokens", "checkouts", "payments", "renewal_attempts", "renewal_consents",
  "anet_events", "email_notices", "coupon_campaigns", "business_limit_overrides",
];

async function count(table, filter = (q) => q) {
  const { count: n, error } = await filter(admin.from(table).select("*", { count: "exact", head: true }));
  if (error) throw new Error(`${table}: ${error.message}`);
  return n;
}

async function users() {
  let total = 0;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`users: ${error.message}`);
    total += data.users.length;
    if (data.users.length < 1000) return total;
  }
}

async function storageObjects(bucket) {
  const { data, error } = await admin.storage.from(bucket).list("", { limit: 1000 });
  if (error) throw new Error(`storage ${bucket}: ${error.message}`);
  return data.length;
}

async function snapshot() {
  const rows = async (table, order) => {
    const { data, error } = await admin.from(table).select("*").order(order);
    if (error) throw new Error(`${table}: ${error.message}`);
    return data;
  };
  const counts = { users: await users() };
  for (const t of COUNTED) counts[t] = await count(t);
  const seats = {
    founding_free_claims: await count("offer_seat_claims", (q) => q.eq("offer_code", "founding_merchant").eq("free", true)),
    founding_paid_claims: await count("offer_seat_claims", (q) => q.eq("offer_code", "founding_merchant").eq("free", false)),
    founding_seats_in_use: (await admin.rpc("offer_seats_in_use", { p_offer_code: "founding_merchant" })).data,
  };
  return {
    taken_at: new Date().toISOString(),
    counts,
    seats,
    storage: { logos: await storageObjects("logos"), "coupon-images": await storageObjects("coupon-images") },
    platform_settings: await rows("platform_settings", "id"),
    offers: await rows("offers", "code"),
    categories: await rows("categories", "id"),
  };
}

function diff(a, b, path = "") {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object") {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => diff(a[k], b[k], path ? `${path}.${k}` : k));
  }
  return [{ path, before: a, after: b }];
}

const [mode, ...files] = process.argv.slice(2);
if (mode === "save" && files[0]) {
  const snap = await snapshot();
  writeFileSync(files[0], JSON.stringify(snap, null, 2));
  console.log(JSON.stringify({ counts: snap.counts, seats: snap.seats, storage: snap.storage }, null, 2));
} else if (mode === "compare" && files[1]) {
  const [before, after] = files.map((f) => JSON.parse(readFileSync(f, "utf8")));
  const changes = diff({ ...before, taken_at: 0 }, { ...after, taken_at: 0 });
  if (!changes.length) {
    console.log(`Snapshots match exactly (${before.taken_at} and ${after.taken_at}).`);
  } else {
    console.log(`Snapshots DIFFER (${before.taken_at} and ${after.taken_at}):`);
    for (const c of changes) console.log(`  ${c.path}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`);
    process.exit(1);
  }
} else {
  console.error("Usage: production-snapshot.mjs save <file> | compare <before> <after>");
  process.exit(1);
}
