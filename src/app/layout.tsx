import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ServiceWorker } from "@/components/service-worker";
import { siteUrl } from "@/lib/site";
import { SITE_DESCRIPTION } from "@/lib/site-copy";
import "./globals.css";

// Both fonts are downloaded at build time and served from this site (next/font); no request goes
// to Google when a page loads. Fraunces for headings and deal values, DM Sans for everything else.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  // Any absolute URL in page metadata (canonical links, Open Graph images) resolves against the live domain.
  metadataBase: new URL(siteUrl()),
  title: { default: "Coupersville", template: "%s | Coupersville" },
  description: SITE_DESCRIPTION,
  applicationName: "Coupersville",
  appleWebApp: { title: "Coupersville", capable: true, statusBarStyle: "default" },
  openGraph: { siteName: "Coupersville", type: "website", locale: "en_US" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#1F4D3F",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
        <ServiceWorker />
      </body>
    </html>
  );
}
