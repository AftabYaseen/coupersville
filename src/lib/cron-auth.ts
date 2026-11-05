import "server-only";
import { timingSafeEqual } from "node:crypto";

// Scheduled callers (Vercel Cron, the database's pg_cron) send "Authorization: Bearer <CRON_SECRET>".
export function cronAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
