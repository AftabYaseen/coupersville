import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runPlanNotices } from "@/lib/email/notices";

// Vercel Cron calls this once a day (vercel.json) with "Authorization: Bearer <CRON_SECRET>".
// Every email it sends is claimed in email_notices first, so a second run sends nothing new.

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("cron daily: CRON_SECRET is not set");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const report = await runPlanNotices();
    console.info(`cron daily: ${JSON.stringify(report)}`);
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    console.error(`cron daily: failed (${error instanceof Error ? error.message : "unknown error"})`);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
