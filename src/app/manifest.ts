import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Coupersville",
    short_name: "Coupersville",
    description: "Discover digital coupons from businesses near you and beyond. Find a deal, get your one-time QR coupon and enjoy the savings.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F2F4F8",
    theme_color: "#1B2A8F",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
