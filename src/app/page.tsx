import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Search } from "lucide-react";
import { listShops, searchLiveCoupons } from "@/lib/consumer";
import { CouponGrid, EmptyState } from "@/components/consumer/coupon-ticket";
import { NearMeButton } from "@/components/consumer/near-me-button";
import { ShopCard } from "@/components/consumer/shop-card";
import { TicketGridSkeleton } from "@/components/consumer/ticket-skeleton";
import welcomeSign from "../../public/Img-1.jpeg";

const ROW_SIZE = 6;

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <figure className="mx-auto w-full max-w-[827px] rounded-sm border-[1.5px] border-ink bg-white p-2 sm:p-3">
        <Image
          src={welcomeSign}
          alt="A wooden sign reading Welcome to Coupersville, Find Your Joy, Population: Growing Every Day, beside a tree-lined main street of shops."
          sizes="(max-width: 859px) calc(100vw - 3.5rem), 800px"
          className="h-auto w-full max-w-[800px]"
          preload
        />
      </figure>

      <section className="mt-10" aria-labelledby="welcome-heading">
        <h1 id="welcome-heading" className="wordmark text-4xl text-ink sm:text-5xl">
          Welcome to Coupersville
        </h1>
        <p className="mt-3 max-w-xl text-lg">
          Coupons from the shops in your town. Save the ones you like, then show them at the counter.
        </p>
        <div className="panel mt-6 grid gap-4 p-5">
          <Form action="/search" className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="home-q" className="field-label">
                Search
              </label>
              <input id="home-q" name="q" type="search" placeholder="Coupon, shop, or product" className="field-input" />
            </div>
            <div>
              <label htmlFor="home-place" className="field-label">
                City or ZIP
              </label>
              <input id="home-place" name="place" autoComplete="postal-code" className="field-input" />
            </div>
            <button type="submit" className="btn">
              <Search aria-hidden size={18} strokeWidth={1.5} />
              Search coupons
            </button>
          </Form>
          <NearMeButton placeInputId="home-place" />
        </div>
      </section>

      <Suspense fallback={<RowSkeleton title="Featured" />}>
        <FeaturedRow />
      </Suspense>

      <section id="main-street" className="mt-12 scroll-mt-6" aria-labelledby="main-street-heading">
        <h2 id="main-street-heading" className="wordmark text-3xl text-ink">
          Main Street
        </h2>
        <p className="mt-1">Step into a shop to see its coupons.</p>
        <Suspense fallback={<ShopGridSkeleton />}>
          <ShopGrid />
        </Suspense>
      </section>

      <Suspense fallback={<RowSkeleton title="Ending soon" />}>
        <EndingSoonRow />
      </Suspense>
    </div>
  );
}

function RowSkeleton({ title }: { title: string }) {
  return (
    <section className="mt-12">
      <h2 className="wordmark text-3xl text-ink">{title}</h2>
      <div className="mt-4">
        <TicketGridSkeleton count={3} />
      </div>
    </section>
  );
}

function ShopGridSkeleton() {
  return (
    <div role="status" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only">Loading shops</span>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} aria-hidden className="h-[84px] rounded-sm border-[1.5px] border-ink bg-white" />
      ))}
    </div>
  );
}

async function FeaturedRow() {
  const featured = await searchLiveCoupons({ featuredOnly: true, sort: "newest", limit: ROW_SIZE });
  const showingFeatured = featured.coupons.length > 0;
  const { coupons } = showingFeatured ? featured : await searchLiveCoupons({ sort: "newest", limit: ROW_SIZE });

  return (
    <section className="mt-12" aria-labelledby="featured-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="featured-heading" className="wordmark text-3xl text-ink">
          {showingFeatured ? "Featured" : "New on Main Street"}
        </h2>
        {coupons.length > 0 && (
          <Link href="/search" className="font-medium text-ink underline underline-offset-4">
            See all coupons
          </Link>
        )}
      </div>
      <div className="mt-4">
        {coupons.length > 0 ? (
          <CouponGrid coupons={coupons} />
        ) : (
          <EmptyState title="The shops are just opening up.">
            <p>No coupons are live yet. Run a shop in town? Put the first one up.</p>
            <Link href="/signup?type=merchant" className="btn btn-secondary justify-self-start">
              Create a business account
            </Link>
          </EmptyState>
        )}
      </div>
    </section>
  );
}

async function ShopGrid() {
  const shops = await listShops();
  if (shops.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState title="Main Street is being set up.">
          <p>Shops will appear here soon. In the meantime, try a search.</p>
        </EmptyState>
      </div>
    );
  }
  return (
    <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {shops.map((shop) => (
        <li key={shop.id}>
          <ShopCard shop={shop} />
        </li>
      ))}
    </ul>
  );
}

async function EndingSoonRow() {
  const { coupons } = await searchLiveCoupons({ endingWithinDays: 7, sort: "ending_soon", limit: ROW_SIZE });
  return (
    <section className="mt-12" aria-labelledby="ending-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ending-heading" className="wordmark text-3xl text-ink">
          Ending soon
        </h2>
        {coupons.length > 0 && (
          <Link href="/search?ending=1&sort=ending_soon" className="font-medium text-ink underline underline-offset-4">
            See all ending soon
          </Link>
        )}
      </div>
      <div className="mt-4">
        {coupons.length > 0 ? (
          <CouponGrid coupons={coupons} />
        ) : (
          <EmptyState title="Nothing is ending this week.">
            <p>Every coupon in town has more than 7 days left. Have a browse while you have time.</p>
            <Link href="/search" className="btn btn-secondary justify-self-start">
              Search coupons
            </Link>
          </EmptyState>
        )}
      </div>
    </section>
  );
}
