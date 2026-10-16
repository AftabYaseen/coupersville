import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  // Any absolute URL in page metadata (canonical links, Open Graph images) resolves against the live domain.
  metadataBase: new URL(siteUrl()),
  title: { default: "Coupersville", template: "%s | Coupersville" },
  description: "Coupons from the shops in your town. Save them, then redeem them in store.",
};

export const viewport: Viewport = {
  themeColor: "#1B2A8F",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
