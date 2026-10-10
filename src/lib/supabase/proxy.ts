import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { homePathFor } from "@/lib/roles";

const SIGNED_IN_ONLY = ["/saved", "/history", "/account", "/redeem", "/merchant", "/admin"];
const AUTH_PAGES = ["/login", "/signup"];

function under(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Validates the JWT and refreshes the session cookie when needed.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const path = request.nextUrl.pathname;

  const redirectTo = (pathname: string, search = "") => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = search;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "cache-control") redirect.headers.set(key, value);
    });
    return redirect;
  };

  if (!userId) {
    if (SIGNED_IN_ONLY.some((prefix) => under(path, prefix))) {
      return redirectTo("/login", `?next=${encodeURIComponent(path + request.nextUrl.search)}`);
    }
    return response;
  }

  const isAuthPage = AUTH_PAGES.some((prefix) => under(path, prefix));
  const isAdminArea = under(path, "/admin");
  const isMerchantArea = under(path, "/merchant");
  if (!isAuthPage && !isAdminArea && !isMerchantArea) {
    return response;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", userId)
    .maybeSingle();
  const role = profile?.status === "active" ? profile.role : null;

  if (isAuthPage) {
    return role ? redirectTo(homePathFor(role)) : response;
  }

  if (isAdminArea && role !== "admin") {
    return redirectTo(role ? homePathFor(role) : "/");
  }

  if (isMerchantArea && role !== "admin") {
    if (!role) return redirectTo("/");
    const { data: rows } = await supabase.from("business_members").select("role").eq("user_id", userId);
    const memberRoles = (rows ?? []).map((r) => r.role);
    const manages = memberRoles.some((r) => r === "owner" || r === "manager");

    if (!manages) {
      // Staff can open the scanner and nothing else in the portal. A merchant who is only staff
      // somewhere can still set up their own business.
      if (memberRoles.length === 0) {
        if (role !== "merchant") return redirectTo(homePathFor(role));
      } else if (!under(path, "/merchant/scan") && !(role === "merchant" && under(path, "/merchant/onboarding"))) {
        return redirectTo("/merchant/scan");
      }
    }
  }

  return response;
}
