import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skips static files: images, the service worker and offline page, the manifest, robots and sitemap.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\.js|offline\.html|manifest\.webmanifest|robots\.txt|sitemap\.xml|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
