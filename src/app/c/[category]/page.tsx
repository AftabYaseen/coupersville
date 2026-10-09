import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getShop, searchLiveCoupons } from "@/lib/consumer";
import { PAGE_SIZE } from "@/lib/validation/search";
import { CouponGrid, EmptyState } from "@/components/consumer/coupon-ticket";
import { TicketGridSkeleton } from "@/components/consumer/ticket-skeleton";
import { TINT_BG } from "@/components/consumer/shop-card";

export const metadata: Metadata = { title: "Shop" };

export default function ShopPage({ params }: PageProps<"/c/[category]">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <Suspense
        fallback={
          <div className="grid gap-8">
            <div className="h-28 rounded-sm border-[1.5px] border-ink bg-white" aria-hidden />
            <TicketGridSkeleton count={3} />
          </div>
        }
      >
        <ShopContent params={params} />
      </Suspense>
    </div>
  );
}

async function ShopContent({ params }: { params: PageProps<"/c/[category]">["params"] }) {
  const { category } = await params;
  if (!/^[a-z0-9-]{1,60}$/.test(category)) notFound();
  const shop = await getShop(category);
  if (!shop) notFound();
  const { coupons, total } = await searchLiveCoupons({ category: shop.slug, sort: "newest", limit: PAGE_SIZE });

  return (
    <div className="grid gap-8">
      <header className="overflow-hidden rounded-sm border-[1.5px] border-ink bg-white">
        <span aria-hidden className="flex h-4 border-b-[1.5px] border-ink">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className={`flex-1 ${i % 2 === 0 ? "bg-ink" : TINT_BG[shop.stock_tint]}`} />
          ))}
        </span>
        <div className={`p-5 sm:p-6 ${TINT_BG[shop.stock_tint]}`}>
          <h1 className="wordmark text-4xl text-ink">{shop.shop_label}</h1>
          <p className="mt-1">
            {shop.name} coupons on Main Street.{" "}
            <span className="tabular">{total === 1 ? "1 coupon" : `${total} coupons`} today.</span>
          </p>
        </div>
      </header>

      {coupons.length === 0 ? (
        <EmptyState title={`${shop.shop_label} has no coupons right now.`}>
          <p>New coupons go up all the time. Have a look in the other shops on Main Street.</p>
          <Link href="/#main-street" className="btn btn-secondary justify-self-start">
            Browse Main Street
          </Link>
        </EmptyState>
      ) : (
        <>
          <CouponGrid coupons={coupons} />
          {total > coupons.length && (
            <Link href={`/search?category=${shop.slug}&page=2`} className="btn btn-secondary justify-self-center">
              See more from {shop.shop_label.replace(/^The /, "the ")}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
