import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { NEAR_COOKIE, parseNearCookie } from "@/lib/near-me";
import { listShops, searchLiveCoupons, searchOptionsFrom } from "@/lib/consumer";
import { PAGE_SIZE, searchParamsSchema, type SearchQuery } from "@/lib/validation/search";
import { CouponGrid, EmptyState } from "@/components/consumer/coupon-ticket";
import { SearchForm } from "@/components/consumer/search-form";
import { TicketGridSkeleton } from "@/components/consumer/ticket-skeleton";

export const metadata: Metadata = {
  title: "Find coupons and local deals",
  description: "Search Coupersville by business, product, category or location, or find the deals closest to you.",
};

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="wordmark text-4xl text-ink">Find a deal worth leaving home for.</h1>
      <p className="mt-3 max-w-2xl text-lg">
        Search Coupersville by business, product, category or location. Whether you know exactly what you want or simply feel like
        exploring, a good deal may be waiting nearby.
      </p>
      <Suspense fallback={<SearchSkeleton />}>
        <SearchContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="mt-6 grid gap-8">
      <div className="panel h-72" aria-hidden />
      <TicketGridSkeleton count={3} />
    </div>
  );
}

function pageHref(query: SearchQuery, page: number) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...query, page })) {
    if (v !== undefined && v !== "" && !(k === "page" && v === 1) && !(k === "sort" && v === "newest")) params.set(k, String(v));
  }
  return `/search?${params.toString()}`;
}

async function SearchContent({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const query = searchParamsSchema.parse(await searchParams);
  const near = parseNearCookie((await cookies()).get(NEAR_COOKIE)?.value);
  const options = searchOptionsFrom(query, near);
  const [shops, { coupons, total }] = await Promise.all([listShops(), searchLiveCoupons(options)]);
  const shown = (query.page - 1) * PAGE_SIZE + coupons.length;

  const notes: string[] = [];
  if (options.usingLocation) notes.push("Showing deals within 25 miles of you.");
  if (query.near === "1" && !query.place && !near) notes.push("Your location has expired. Tap Use my location again to see what is close by.");
  if (query.sort === "nearest" && !options.usingLocation) {
    notes.push("Sorting by nearest needs your location. Tap Use my location, or these are sorted newest first.");
  }
  const where = query.place ? ` near ${query.place}` : options.usingLocation ? " near you" : "";

  return (
    <div className="mt-6 grid gap-8">
      <SearchForm query={query} shops={shops} usingLocation={options.usingLocation} />

      <section aria-labelledby="results-heading" className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="results-heading" className="text-xl font-semibold tabular">
            {total === 1 ? "1 deal found" : `${total} deals found`}
            {where}
          </h2>
          {(options.usingLocation || query.place) && (
            <Link href="/search" className="font-medium text-ink underline underline-offset-4">
              Clear location
            </Link>
          )}
        </div>
        {notes.map((n) => (
          <p key={n} className="text-sm">
            {n}
          </p>
        ))}

        {coupons.length === 0 ? (
          <EmptyState title="No deals matched that search just yet.">
            <p>Try a nearby ZIP code, choose a different category or explore all of Coupersville. New offers are added regularly.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/search" className="btn btn-secondary">
                Clear filters
              </Link>
              <Link href="/explore" className="btn btn-secondary">
                Explore all deals
              </Link>
            </div>
          </EmptyState>
        ) : (
          <>
            <CouponGrid coupons={coupons} />
            {(query.page > 1 || shown < total) && (
              <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-3">
                {query.page > 1 && (
                  <Link href={pageHref(query, query.page - 1)} className="btn btn-secondary">
                    Previous page
                  </Link>
                )}
                <span className="tabular">Page {query.page}</span>
                {shown < total && (
                  <Link href={pageHref(query, query.page + 1)} className="btn btn-secondary">
                    Next page
                  </Link>
                )}
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}
