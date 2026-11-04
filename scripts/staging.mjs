// Builds or starts the app against the staging Supabase project, for the test scripts.
//
//   npm run staging:build     next build with .env.staging.local
//   npm run staging:start     next start -p 3100 with .env.staging.local
//
// Next.js also reads .env.local (production) for any variable not already set, so every variable
// the app uses must be set in .env.staging.local; this refuses to run otherwise, or if any value
// points at the production project.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const PRODUCTION_REF = "aidfrqepbtspddgwjpfw";
const REQUIRED = [
  "STAGING_SUPABASE_REF",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "CRON_SECRET",
  "AUTHORIZE_NET_API_LOGIN_ID",
  "AUTHORIZE_NET_TRANSACTION_KEY",
  "AUTHORIZE_NET_SIGNATURE_KEY",
  "AUTHORIZE_NET_ENV",
];

const command = process.argv[2];
if (command !== "build" && command !== "start") {
  console.error("Usage: node scripts/staging.mjs build|start");
  process.exit(1);
}

let staging;
try {
  staging = parseEnv(readFileSync(new URL("../.env.staging.local", import.meta.url), "utf8"));
} catch {
  console.error("Missing .env.staging.local. See .env.staging.example.");
  process.exit(1);
}
const missing = REQUIRED.filter((k) => !staging[k]);
if (missing.length) {
  console.error(`.env.staging.local must set: ${missing.join(", ")}`);
  process.exit(1);
}
if (Object.values(staging).some((v) => v.includes(PRODUCTION_REF)) || staging.STAGING_SUPABASE_REF === PRODUCTION_REF) {
  console.error(".env.staging.local points at the production Supabase project. Refusing to run.");
  process.exit(1);
}
if (!staging.NEXT_PUBLIC_SUPABASE_URL.includes(`${staging.STAGING_SUPABASE_REF}.supabase.co`)) {
  console.error("NEXT_PUBLIC_SUPABASE_URL does not match STAGING_SUPABASE_REF. Refusing to run.");
  process.exit(1);
}
if (staging.AUTHORIZE_NET_ENV !== "sandbox") {
  console.error("AUTHORIZE_NET_ENV must be sandbox for staging. Refusing to run.");
  process.exit(1);
}

const args = command === "build" ? ["build"] : ["start", "-p", "3100"];
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", ...args], {
  stdio: "inherit",
  env: { ...process.env, ...staging },
});
process.exit(result.status ?? 1);
