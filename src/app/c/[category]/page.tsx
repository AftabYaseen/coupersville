import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getShop, searchLiveCoupons } from "@/lib/consumer";
import { PAGE_SIZE } from "@/lib/validation/search";
import { CouponGrid, EmptyState } from "@/components/consumer/coupon-ticket";
import { TicketGridSkeleton } from "@/components/consumer/ticket-skeleton";
import { TINT_BG, dealCount } from "@/components/consumer/shop-card";

export async function generateMetadata({ params }: PageProps<"/c/[category]">): Promise<Metadata> {
  const { category } = await params;
  const shop = /^[a-z0-9-]{1,60}$/.test(category) ? await getShop(category) : null;
  if (!shop) return { title: "Category not found" };
  return {
    title: `${shop.name} deals`,
    description: shop.description ?? `Explore current offers from ${shop.name} businesses in Coupersville.`,
  };
}

export default function CategoryPage({ params }: PageProps<"/c/[category]">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <Suspense
        fallback={
          <div className="grid gap-8">
            <div className="h-28 rounded-sm border border-line bg-white" aria-hidden />
            <TicketGridSkeleton count={3} />
          </div>
        }
      >
        <CategoryContent params={params} />
      </Suspense>
    </div>
  );
}

async function CategoryContent({ params }: { params: PageProps<"/c/[category]">["params"] }) {
  const { category } = await params;
  if (!/^[a-z0-9-]{1,60}$/.test(category)) notFound();
  const shop = await getShop(category);
  if (!shop) notFound();
  const { coupons, total } = await searchLiveCoupons({ category: shop.slug, sort: "newest", limit: PAGE_SIZE });

  return (
    <div className="grid gap-8">
      <header className="overflow-hidden rounded-sm border border-line bg-white">
        <span aria-hidden className="flex h-4 border-b border-line">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className={`flex-1 ${i % 2 === 0 ? "bg-primary" : TINT_BG[shop.stock_tint]}`} />
          ))}
        </span>
        <div className={`p-5 sm:p-6 ${TINT_BG[shop.stock_tint]}`}>
          <h1 className="wordmark text-4xl text-primary">{shop.name} deals</h1>
          <p className="mt-2 max-w-2xl">
            Explore current offers from {shop.name} businesses in Coupersville. Check each coupon for participating locations, limits
            and expiration details.
          </p>
          <p className="mt-2 font-medium tabular">{dealCount(total)}</p>
        </div>
      </header>

      {coupons.length === 0 ? (
        <EmptyState title="Nothing on the shelf just yet.">
          <p>There are no active {shop.name} deals at the moment, but new offers are always arriving in Coupersville.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/explore" className="btn btn-secondary">
              Browse other categories
            </Link>
            <Link href="/search" className="btn btn-secondary">
              See all deals
            </Link>
          </div>
        </EmptyState>
      ) : (
        <>
          <CouponGrid coupons={coupons} />
          {total > coupons.length && (
            <Link href={`/search?category=${shop.slug}&page=2`} className="btn btn-secondary justify-self-center">
              See more {shop.name} deals
            </Link>
          )}
        </>
      )}
    </div>
  );
}
