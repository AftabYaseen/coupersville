import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: supabaseUrl ? [new URL(`${supabaseUrl}/storage/v1/object/public/**`)] : [],
  },
  partialPrefetching: true,
  // How it works became How to save (client copy deck, 2026-11-10). Old links keep working.
  async redirects() {
    return [
      { source: "/how-it-works", destination: "/how-to-save", permanent: true },
      // coupersville.com/join is printed on the client's QR code, so this address must never change
      // or be removed. Temporary (307) on purpose: browsers do not cache it, so the destination can
      // move later without breaking printed codes. Matches /join exactly; staff invites at
      // /join/[token] are a different path and are not affected.
      { source: "/join", destination: "/signup?type=merchant", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
