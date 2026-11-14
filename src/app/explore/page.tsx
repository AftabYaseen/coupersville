import type { Metadata } from "next";
import { Suspense } from "react";
import { listShops } from "@/lib/consumer";
import { EmptyState } from "@/components/consumer/coupon-ticket";
import { ShopCard } from "@/components/consumer/shop-card";

export const metadata: Metadata = {
  title: "Explore coupon categories",
  description:
    "Browse by category and discover offers from businesses that help you eat well, look good, shop smarter and enjoy more for less.",
};

export default function ExplorePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="wordmark text-4xl text-primary sm:text-5xl">There&apos;s always something to discover in Coupersville.</h1>
      <p className="mt-3 max-w-2xl text-lg">
        Browse by category and discover offers from businesses that help you eat well, look good, shop smarter and enjoy more for
        less.
      </p>
      <Suspense
        fallback={
          <div role="status" className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <span className="sr-only">Loading categories</span>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} aria-hidden className="h-[112px] rounded-sm border border-line bg-white" />
            ))}
          </div>
        }
      >
        <Categories />
      </Suspense>
    </div>
  );
}

async function Categories() {
  const shops = await listShops();
  if (shops.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState title="Categories are on their way.">
          <p>They will appear here soon. In the meantime, try a search.</p>
        </EmptyState>
      </div>
    );
  }
  return (
    <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {shops.map((shop) => (
        <li key={shop.id}>
          <ShopCard shop={shop} />
        </li>
      ))}
    </ul>
  );
}
