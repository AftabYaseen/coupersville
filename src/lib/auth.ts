import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homePathFor, type UserRole } from "@/lib/roles";
import type { Enums } from "@/lib/supabase/database.types";

export type SessionUser = {
  id: string;
  email: string | null;
  role: UserRole;
  status: Enums<"account_status">;
  fullName: string | null;
};

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status, full_name")
    .eq("id", claims.sub)
    .maybeSingle();
  if (!profile) return null;

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    role: profile.role,
    status: profile.status,
    fullName: profile.full_name,
  };
});

export async function requireUser(nextPath: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (user.status !== "active") redirect("/login?error=suspended");
  return user;
}

export async function requireAdmin(nextPath = "/admin"): Promise<SessionUser> {
  const user = await requireUser(nextPath);
  if (user.role !== "admin") redirect(homePathFor(user.role));
  return user;
}

export type Membership = {
  businessId: string;
  role: Enums<"member_role">;
  businessName: string;
  businessStatus: Enums<"business_status">;
};

// Merchants, admins, and staff members of a business may enter /merchant.
export async function requireMerchantAccess(nextPath = "/merchant") {
  const user = await requireUser(nextPath);
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_members")
    .select("business_id, role, businesses(name, status)")
    .eq("user_id", user.id);

  const memberships: Membership[] = (data ?? []).flatMap((row) =>
    row.businesses
      ? [{ businessId: row.business_id, role: row.role, businessName: row.businesses.name, businessStatus: row.businesses.status }]
      : [],
  );

  if (user.role !== "merchant" && user.role !== "admin" && memberships.length === 0) {
    redirect(homePathFor(user.role));
  }
  return { user, memberships };
}
