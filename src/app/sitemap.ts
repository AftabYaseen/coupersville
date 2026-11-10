import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { absoluteUrl } from "@/lib/site";
import type { Database } from "@/lib/supabase/database.types";

// Public pages, every active category, and every live coupon. Read at request time so expired
// coupons drop out straight away. Uses the public key: it lists only what any visitor can see.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: categories }, { data: coupons }] = await Promise.all([
    supabase.from("categories").select("slug, updated_at").eq("active", true).order("sort_order"),
    supabase.from("live_coupons").select("id, updated_at").order("updated_at", { ascending: false }).limit(5000),
  ]);

  const pages = ["/", "/search", "/explore", "/how-to-save", "/for-businesses", "/business-membership", "/about", "/contact", "/privacy", "/terms"].map((path) => ({
    url: absoluteUrl(path),
    changeFrequency: path === "/" || path === "/search" ? ("daily" as const) : ("monthly" as const),
  }));

  return [
    ...pages,
    ...(categories ?? []).map((c) => ({ url: absoluteUrl(`/c/${c.slug}`), lastModified: c.updated_at, changeFrequency: "daily" as const })),
    ...(coupons ?? []).map((c) => ({ url: absoluteUrl(`/coupon/${c.id}`), lastModified: c.updated_at ?? undefined })),
  ];
}
