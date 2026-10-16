// The site's public address, for every absolute link the app sends out: auth emails, Stripe
// return URLs and staff invite links. Set NEXT_PUBLIC_SITE_URL (https://www.coupersville.com in
// production). Links are never built from request headers, which a proxy or a redirect can change.

const FALLBACK = "http://localhost:3000";

export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      console.error("NEXT_PUBLIC_SITE_URL is not set; links fall back to localhost");
    }
    return FALLBACK;
  }
  return raw.replace(/\/+$/, "");
}

// An absolute URL on this site, for a path such as "/merchant/billing".
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
