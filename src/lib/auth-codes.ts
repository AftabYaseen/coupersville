import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Rate limits for email sign-in codes and Contact page messages. Emails and IP addresses are never stored: only keyed
// hashes, so the table cannot be turned back into a list of addresses.

function keyedHash(kind: string, value: string): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createHmac("sha256", key).update(`${kind}:${value}`).digest("hex");
}

// The visitor's address as Vercel reports it. Used only for the per-IP limit.
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || null;
}

export type CodeLimit = "ok" | "email_limited" | "ip_limited";

// Counts the request and says whether it is within the limits (see register_auth_code_request).
export async function registerCodeRequest(kind: "send" | "verify" | "contact", email: string): Promise<CodeLimit> {
  const ip = await clientIp();
  const { data, error } = await createAdminClient().rpc("register_auth_code_request", {
    p_kind: kind,
    p_email_hash: keyedHash("email", email.trim().toLowerCase()),
    // No address means no per-IP limit; the function accepts null even though the generated type does not say so.
    p_ip_hash: (ip ? keyedHash("ip", ip) : null) as string,
  });
  if (error) throw new Error("Could not check the sign-in limit");
  return data === "email_limited" || data === "ip_limited" ? data : "ok";
}

// Merchants and admins sign in with their password. Shoppers, and new emails, may use a code.
export async function roleForEmail(email: string) {
  const { data, error } = await createAdminClient().rpc("account_role_for_email", { p_email: email });
  if (error) throw new Error("Could not look up the account");
  return data ?? null;
}
