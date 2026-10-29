// Demo businesses and coupons, for showing Coupersville to people and for trying it out.
//
//   node --env-file=.env.local scripts/seed-demo.mjs            add the demo data
//   node --env-file=.env.local scripts/seed-demo.mjs --remove   remove it again
//
// It refuses to run against the production project unless you also pass --production, because
// demo shops would be visible to real shoppers there. Demo owners use @demo.coupersville.test
// addresses, which can never receive email, and that is how --remove finds everything it made.
// Running it twice does not duplicate anything: an existing demo business is left as it is.

import { createClient } from "@supabase/supabase-js";

const PRODUCTION_REFS = ["aidfrqepbtspddgwjpfw"];
const DOMAIN = "demo.coupersville.test";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Run with --env-file=.env.local");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const isProduction = PRODUCTION_REFS.some((ref) => url.includes(ref));
if (isProduction && !args.has("--production")) {
  console.error(
    "This is the production Supabase project. Demo shops would be visible to real shoppers.\n" +
      "If you really mean it, run again with --production. Remove them later with --remove --production.",
  );
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

const DAY = 86_400_000;
const isoIn = (days) => new Date(Date.now() + days * DAY).toISOString();

// Spread around one small town. Coordinates are approximate and only used for "near me".
const TOWN = { city: "Coupersville", state: "WA", postal: "98239", lat: 48.2198, lng: -122.6863 };

const SHOPS = [
  {
    key: "bakery",
    name: "Rise and Shine Bakery",
    category: "bakeries",
    description: "Sourdough, cinnamon rolls and celebration cakes, baked every morning on Main Street.",
    store: { name: "Main Street", line1: "12 Main Street", dLat: 0.001, dLng: 0.001 },
    coupons: [
      { title: "Any celebration cake", type: "percent", value: 20, limits: "Order 48 hours ahead.", days: 30 },
      { title: "Regular coffee", type: "fixed_price", value: 1, perUser: null, frequency: "day", scheduleDays: [1, 2, 3, 4, 5], start: "07:00", end: "10:00", days: 60 },
      { title: "Cinnamon roll with any loaf", type: "free", value: null, days: 5 },
    ],
  },
  {
    key: "grocer",
    name: "Harbor Fresh Market",
    category: "grocery",
    description: "Local produce, a full deli counter and everyday groceries.",
    store: { name: "Harbor Road", line1: "88 Harbor Road", dLat: -0.004, dLng: 0.006 },
    coupons: [
      { title: "Your shop of $50 or more", type: "amount", value: 5, minSpend: 50, days: 21 },
      { title: "Any bunch of flowers", type: "percent", value: 15, days: 14 },
    ],
  },
  {
    key: "shoes",
    name: "Footloose Shoe Co.",
    category: "shoes",
    description: "Walking shoes, work boots and kids' sizes, fitted by people who know feet.",
    store: { name: "Pioneer Way", line1: "201 Pioneer Way", dLat: 0.003, dLng: -0.005 },
    coupons: [
      { title: "Any pair of boots", type: "amount", value: 20, minSpend: 80, days: 45, featured: true },
      { title: "Shoe care kit with any pair", type: "free", value: null, days: 30 },
    ],
  },
  {
    key: "toys",
    name: "The Toy Chest",
    category: "toys",
    description: "Board games, puzzles and wooden toys for every age.",
    store: { name: "Front Street", line1: "5 Front Street", dLat: -0.002, dLng: -0.002 },
    coupons: [
      { title: "Any board game", type: "percent", value: 25, total: 50, days: 20, featured: true },
      { title: "Puzzles, Saturdays only", type: "percent", value: 10, perUser: null, frequency: "week", scheduleDays: [6], days: 60 },
    ],
  },
  {
    key: "pharmacy",
    name: "Island Drug & Gift",
    category: "pharmacy",
    description: "Prescriptions, everyday health and a gift corner.",
    store: { name: "Center", line1: "40 Center Street", dLat: 0.005, dLng: 0.002 },
    coupons: [{ title: "Vitamins and supplements", type: "percent", value: 15, perUser: 3, days: 40 }],
  },
  {
    key: "diner",
    name: "Main Street Diner",
    category: "restaurants",
    description: "All-day breakfast, burgers and pie. Booths by the window.",
    store: { name: "Main Street", line1: "30 Main Street", dLat: 0.0015, dLng: 0.0005 },
    coupons: [
      { title: "Slice of pie with any meal", type: "free", value: null, perUser: null, frequency: "week", days: 90, featured: true },
      { title: "Breakfast for two", type: "fixed_price", value: 18, scheduleDays: [1, 2, 3, 4, 5], start: "06:00", end: "11:00", days: 30 },
    ],
  },
];

async function demoUsers() {
  const found = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`list users: ${error.message}`);
    found.push(...data.users.filter((u) => u.email?.endsWith(`@${DOMAIN}`)));
    if (data.users.length < 1000) return found;
  }
}

async function remove() {
  const users = await demoUsers();
  const ids = users.map((u) => u.id);
  if (ids.length) {
    // Businesses first: removing them removes their stores, coupons, plans and demo redemptions.
    const gone = must(await admin.from("businesses").delete().in("owner_id", ids).select("id"), "remove businesses");
    console.log(`Removed ${gone.length} demo businesses.`);
  }
  for (const id of ids) must(await admin.auth.admin.deleteUser(id), "remove user");
  console.log(`Removed ${ids.length} demo owners.`);
}

async function seed() {
  const categories = must(await admin.from("categories").select("id, slug"), "categories");
  const categoryId = (slug) => {
    const c = categories.find((row) => row.slug === slug);
    if (!c) throw new Error(`category ${slug} is missing`);
    return c.id;
  };
  const existing = new Map((await demoUsers()).map((u) => [u.email, u]));

  for (const shop of SHOPS) {
    const email = `owner-${shop.key}@${DOMAIN}`;
    if (existing.has(email)) {
      console.log(`${shop.name}: already there, left as it is.`);
      continue;
    }

    const owner = must(
      await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { role: "merchant", full_name: `${shop.name} owner` } }),
      `owner for ${shop.name}`,
    ).user;

    const business = must(
      await admin
        .from("businesses")
        .insert({
          owner_id: owner.id,
          name: shop.name,
          description: shop.description,
          primary_category_id: categoryId(shop.category),
          contact_email: email,
          timezone: "America/Los_Angeles",
          status: "active",
        })
        .select("id")
        .single(),
      `business ${shop.name}`,
    );

    const store = must(
      await admin
        .from("locations")
        .insert({
          business_id: business.id,
          store_name: shop.store.name,
          address_line1: shop.store.line1,
          city: TOWN.city,
          state: TOWN.state,
          postal_code: TOWN.postal,
          geo: `SRID=4326;POINT(${TOWN.lng + shop.store.dLng} ${TOWN.lat + shop.store.dLat})`,
        })
        .select("id")
        .single(),
      `store for ${shop.name}`,
    );

    must(
      await admin.from("subscriptions").insert({ business_id: business.id, source: "complimentary", status: "active", current_period_end: isoIn(365) }),
      `plan for ${shop.name}`,
    );

    for (const c of shop.coupons) {
      must(
        await admin.from("coupons").insert({
          business_id: business.id,
          category_id: categoryId(shop.category),
          title: c.title,
          description: c.description ?? null,
          discount_type: c.type,
          discount_value: c.value,
          limits_text: c.limits ?? null,
          min_spend: c.minSpend ?? null,
          starts_at: isoIn(-1),
          expires_at: isoIn(c.days),
          status: "published",
          all_locations: true,
          per_user_limit: c.perUser === undefined ? 1 : c.perUser,
          redeem_frequency: c.frequency ?? null,
          schedule_days: c.scheduleDays ?? null,
          schedule_start: c.start ?? null,
          schedule_end: c.end ?? null,
          total_limit: c.total ?? null,
          featured: Boolean(c.featured),
          created_by: owner.id,
        }),
        `coupon ${c.title}`,
      );
    }
    console.log(`${shop.name}: added with ${shop.coupons.length} coupons at ${store ? shop.store.line1 : "no store"}.`);
  }
}

try {
  if (args.has("--remove")) await remove();
  else await seed();
} catch (error) {
  console.error(`Stopped: ${error.message}`);
  process.exit(1);
}
