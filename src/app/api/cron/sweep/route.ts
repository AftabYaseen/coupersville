import { NextResponse } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { sweepCheckouts } from "@/lib/paid-billing";
import { anetConfigured } from "@/lib/authorize-net";

// Confirms paid checkouts nobody came back for, every 5 minutes (a pg_cron job in the database
// calls it with "Authorization: Bearer <CRON_SECRET>"). Without webhooks this is how a payment is
// confirmed when the merchant closes Authorize.net's page instead of returning. Only the sweep runs
// here: no renewals, reminders or emails to merchants. With no open checkouts it is one query.

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  if (!cronAuthorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!anetConfigured()) return NextResponse.json({ ok: true, report: { skipped: "authorize_net_not_configured" } });
  try {
    const report = await sweepCheckouts(Date.now());
    if (Object.keys(report).length) console.info(`cron sweep: ${JSON.stringify(report)}`);
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    console.error(`cron sweep: ${error instanceof Error ? error.message : "unknown error"}`);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
