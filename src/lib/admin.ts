import "server-only";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/validation/auth";

export const NOT_ADMIN: ActionResult = { ok: false, error: "Only Coupersville admins can do that. Sign in with an admin account." };

// Pages: redirects anyone who is not an admin.
export async function requireAdminPage(nextPath: string) {
  const user = await requireAdmin(nextPath);
  const supabase = await createClient();
  return { user, supabase };
}

// Actions: asks the database's is_admin() for the signed-in session, so a stale or forged role in the app
// cannot get through. Returns null when the caller is not an active admin.
export async function requireAdminAction() {
  const user = await getSessionUser();
  if (!user || user.status !== "active") return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error || data !== true) return null;
  return { user, supabase };
}
