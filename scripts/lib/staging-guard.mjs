// Test scripts run only against the staging Supabase project, never production. Import this first
// in every test script: it exits before anything else runs unless all of these hold.
//
//   1. NEXT_PUBLIC_SUPABASE_URL is a Supabase project, not production, and matches STAGING_SUPABASE_REF.
//   2. SUPABASE_SECRET_KEY opens that staging project (a production key is refused there).
//   3. BASE_URL is a local build.
//   4. That local build (.next) was made for staging: it names the staging project and never production.
//
// Run tests with the staging env file:  node --env-file=.env.staging.local scripts/test-....mjs
// and the app built and started for staging:  npm run staging:build && npm run staging:start
//
// One exception, decided 2026-11-04 for billing Part B only: with ALLOW_PRODUCTION_TESTS=1, the
// scripts in PRODUCTION_ALLOWED may run against production, and only with the Authorize.net sandbox
// and a local build. They then run in PRODUCTION_MODE: they never change platform settings, the
// publishing date, offers or categories, never claim a Pioneer Circle seat, never run the daily job for
// real businesses, and delete everything they create. Take a snapshot before and after
// (scripts/production-snapshot.mjs) and check it matches.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCTION_REF = "aidfrqepbtspddgwjpfw";
const PRODUCTION_ALLOWED = new Set(["test-anet.mjs", "test-pages.mjs", "test-admin-actions.mjs", "test-finish.mjs", "test-limits.mjs"]);

function refuse(reason) {
  console.error(`\nRefusing to run: ${reason}\nTests run only against the staging project. See scripts/lib/staging-guard.mjs.\n`);
  process.exit(1);
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const stagingRef = (process.env.STAGING_SUPABASE_REF ?? "").trim();
const secret = process.env.SUPABASE_SECRET_KEY ?? "";
const base = process.env.BASE_URL ?? "http://localhost:3100";
const script = basename(process.argv[1] ?? "");

const ref = url.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/)?.[1];
if (!ref) refuse("NEXT_PUBLIC_SUPABASE_URL is not set to a Supabase project. Run with --env-file=.env.staging.local.");
if (!secret) refuse("SUPABASE_SECRET_KEY is not set.");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(base)) refuse("BASE_URL must be a local build (http://localhost:port).");

export const PRODUCTION_MODE = ref === PRODUCTION_REF;

if (PRODUCTION_MODE) {
  if (process.env.ALLOW_PRODUCTION_TESTS !== "1") refuse("this is the production database. Tests run only against staging (--env-file=.env.staging.local).");
  if (!PRODUCTION_ALLOWED.has(script)) refuse(`${script} may not run against production, even with ALLOW_PRODUCTION_TESTS.`);
  if (process.env.AUTHORIZE_NET_ENV !== "sandbox") refuse("AUTHORIZE_NET_ENV must be sandbox.");
} else {
  if (Object.values(process.env).some((v) => typeof v === "string" && v.includes(PRODUCTION_REF))) {
    refuse("an environment variable points at the production Supabase project.");
  }
  if (!stagingRef || stagingRef === PRODUCTION_REF) refuse("STAGING_SUPABASE_REF must name the staging project.");
  if (ref !== stagingRef) refuse("NEXT_PUBLIC_SUPABASE_URL does not match STAGING_SUPABASE_REF.");
}

// 2. The key must open the project itself.
const probe = await fetch(`${url.replace(/\/$/, "")}/rest/v1/platform_settings?select=singleton&limit=1`, {
  headers: { apikey: secret, Authorization: `Bearer ${secret}` },
}).catch(() => null);
if (!probe?.ok) refuse("SUPABASE_SECRET_KEY does not open the target project.");

// 4. The Supabase URL is built into the app, so a staging run needs a build that names staging and
// never production.
if (!PRODUCTION_MODE) {
  const nextDir = fileURLToPath(new URL("../../.next", import.meta.url));
  let namesStaging = false;
  const scan = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      refuse("there is no local build. Run npm run staging:build first.");
    }
    for (const name of entries) {
      if (name === "cache") continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) scan(path);
      else if (/\.(js|json|html|rsc|body)$/.test(name)) {
        const text = readFileSync(path, "utf8");
        if (text.includes(PRODUCTION_REF)) refuse(`the local build points at production (${path}). Run npm run staging:build.`);
        if (!namesStaging && text.includes(stagingRef)) namesStaging = true;
      }
    }
  };
  scan(join(nextDir, "static"));
  scan(join(nextDir, "server"));
  if (!namesStaging) refuse("the local build was not made for the staging project. Run npm run staging:build.");
}

console.log(
  PRODUCTION_MODE
    ? `PRODUCTION MODE (ALLOW_PRODUCTION_TESTS=1): ${script} against production, Authorize.net sandbox, app at ${base}. Settings, offers, categories and seats are not touched.`
    : `Staging check passed: Supabase project ${stagingRef}, app at ${base}.`,
);
