import { NextResponse } from "next/server";
import { runPlanNotices } from "@/lib/email/notices";
import { runRenewalReminders, runRenewals, sweepCheckouts, testClockAllowed } from "@/lib/paid-billing";
import { anetConfigured } from "@/lib/authorize-net";
import { cronAuthorised } from "@/lib/cron-auth";

// Vercel Cron calls this once a day (vercel.json) with "Authorization: Bearer <CRON_SECRET>".
// Every email it sends is claimed in email_notices first, and every renewal charge is claimed in
// renewal_attempts first, so a second run sends and charges nothing new.
//
// Tests only (never on Vercel, sandbox only): ?now=<ISO time> runs the job as of that moment, and
// ?only=<business id>,<business id> limits it to those businesses.

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("cron daily: CRON_SECRET is not set");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (!cronAuthorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  let now = Date.now();
  let only: string[] | undefined;
  if (params.has("now") || params.has("only")) {
    if (!testClockAllowed()) return NextResponse.json({ error: "The test clock is off here" }, { status: 400 });
    const parsed = Date.parse(params.get("now") ?? "");
    if (params.has("now") && Number.isNaN(parsed)) return NextResponse.json({ error: "Bad now" }, { status: 400 });
    if (params.has("now")) now = parsed;
    only = params.get("only")?.split(",").filter((id) => /^[0-9a-f-]{36}$/.test(id));
    // A test clock must never touch real merchants.
    if (!only?.length) return NextResponse.json({ error: "The test clock needs ?only=" }, { status: 400 });
  }

  const report: Record<string, unknown> = {};
  let failed = false;
  const step = async (name: string, run: () => Promise<unknown>) => {
    try {
      report[name] = await run();
    } catch (error) {
      failed = true;
      report[name] = "failed";
      console.error(`cron daily ${name}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  };

  // Payments first, so the emails below see the plans as they now stand.
  if (anetConfigured()) {
    await step("checkouts", () => sweepCheckouts(now, only));
    await step("renewals", () => runRenewals(now, only));
    await step("reminders", () => runRenewalReminders(now, only));
  }
  if (!only) await step("plan_notices", () => runPlanNotices(now));

  console.info(`cron daily: ${JSON.stringify(report)}`);
  return NextResponse.json({ ok: !failed, report }, { status: failed ? 500 : 200 });
}
