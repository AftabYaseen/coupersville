import type { Metadata } from "next";
import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Search } from "lucide-react";
import { listShops, searchLiveCoupons } from "@/lib/consumer";
import { foundingCallout } from "@/lib/founding-callout";
import { ENDING_SOON_HREF, JOIN_HREF, SITE_DESCRIPTION } from "@/lib/site-copy";
import { CouponGrid, EmptyState } from "@/components/consumer/coupon-ticket";
import { NearMeButton } from "@/components/consumer/near-me-button";
import { ShopCard } from "@/components/consumer/shop-card";
import { TicketGridSkeleton } from "@/components/consumer/ticket-skeleton";
import welcomeSign from "../../public/town-sign.jpg";

export const metadata: Metadata = {
  title: { absolute: "Coupersville | Discover deals from businesses near you and beyond" },
  description: SITE_DESCRIPTION,
};

const ROW_SIZE = 6;

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      {/* The hero: the marketplace line on top, then the welcome sign as a postcard beside the
          headline (above it on a phone). The sign is contained, never a full-width background. */}
      <section aria-labelledby="welcome-heading">
        <p className="wordmark text-2xl text-ink sm:text-3xl">Local offers. Local shoppers. One simple marketplace.</p>
        <p className="mt-2 max-w-2xl text-lg">
          Coupersville is a digital coupon marketplace that connects local businesses with shoppers ready to discover them.
        </p>

        <div className="mt-6 grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
          <figure className="mx-auto w-full max-w-[560px] rounded-sm border-[1.5px] border-ink bg-white p-2 sm:p-3 lg:order-2">
            <Image
              src={welcomeSign}
              alt="A wooden sign reading Welcome to Coupersville, Find Your Joy, Population: Growing Every Day, beside a tree-lined main street of shops."
              sizes="(max-width: 1023px) min(calc(100vw - 3.5rem), 536px), 456px"
              className="h-auto w-full"
              preload
            />
          </figure>

          <div className="lg:order-1">
            <p className="text-lg font-medium">Come see what&apos;s happening in Coupersville.</p>
            <h1 id="welcome-heading" className="wordmark mt-1 text-4xl text-ink sm:text-5xl">
              Where good deals live.
            </h1>
            <p className="mt-3 max-w-2xl text-lg">
              Discover savings from restaurants, shops, services and businesses near you and beyond. Find an offer you love, get
              your digital coupon and enjoy the savings.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/search" className="btn">
                Find a deal
              </Link>
              <Link href="/explore" className="btn btn-secondary">
                Explore Coupersville
              </Link>
            </div>
            <p className="mt-4 font-medium">No clipping. No printing. Just find it, scan it and save.</p>
          </div>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="search-heading">
        <h2 id="search-heading" className="wordmark text-3xl text-ink">
          What kind of deal are you looking for?
        </h2>
        <div className="panel mt-4 grid gap-4 p-5">
          <Form action="/search" className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="home-q" className="field-label">
                Search
              </label>
              <input id="home-q" name="q" type="search" placeholder="Search businesses, products, restaurants or deals" className="field-input" />
            </div>
            <div>
              <label htmlFor="home-place" className="field-label">
                Near
              </label>
              <input id="home-place" name="place" placeholder="City or ZIP code" autoComplete="postal-code" className="field-input" />
            </div>
            <button type="submit" className="btn">
              <Search aria-hidden size={18} strokeWidth={1.5} />
              Find my deals
            </button>
          </Form>
          <NearMeButton placeInputId="home-place" />
        </div>
      </section>

      <Suspense fallback={null}>
        <FeaturedRow />
      </Suspense>

      <Suspense fallback={<RowSkeleton title="New around town" />}>
        <NewRow />
      </Suspense>

      <section id="categories" className="mt-12 scroll-mt-6" aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="wordmark text-3xl text-ink">
          Stroll through Coupersville
        </h2>
        <p className="mt-1">What are you shopping for today? Explore food, fashion, beauty and grooming, essentials and more.</p>
        <Suspense fallback={<ShopGridSkeleton />}>
          <ShopGrid />
        </Suspense>
        <Link href="/explore" className="btn btn-secondary mt-4">
          Explore all categories
        </Link>
      </section>

      <Suspense fallback={<RowSkeleton title="Catch these before they're gone" />}>
        <EndingSoonRow />
      </Suspense>

      <section className="panel mt-12 grid gap-4 p-5 sm:p-6" aria-labelledby="business-heading">
        <h2 id="business-heading" className="wordmark text-3xl text-ink">
          Have a business? Open your door in Coupersville.
        </h2>
        <p className="max-w-2xl">
          Create your own offers, reach new customers and give people another reason to walk through your door. A Coupersville
          membership gives you the tools to create, publish and manage your coupons.
        </p>
        <Suspense fallback={null}>
          <FoundingLine />
        </Suspense>
        <div className="flex flex-wrap gap-3">
          <Link href="/for-businesses" className="btn btn-secondary">
            Learn about Coupersville for business
          </Link>
          <Link href={JOIN_HREF} className="btn">
            Join Coupersville
          </Link>
        </div>
      </section>
    </div>
  );
}

async function FoundingLine() {
  const f = await foundingCallout();
  if (!f) return null;
  return (
    <p className="rounded-sm border-[1.5px] border-ink bg-stock-butter p-4">
      <span className="font-semibold">{f.name} offer:</span> The first {f.freeSeats} qualifying merchants who join between{" "}
      {f.from} and {f.to} receive one complimentary year.
    </p>
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
      <span className="sr-only">Loading categories</span>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} aria-hidden className="h-[112px] rounded-sm border-[1.5px] border-ink bg-white" />
      ))}
    </div>
  );
}

function RowHeader({ id, title, link, copy }: { id: string; title: string; link: { href: string; label: string } | null; copy: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="wordmark text-3xl text-ink">
          {title}
        </h2>
        {link && (
          <Link href={link.href} className="font-medium text-ink underline underline-offset-4">
            {link.label}
          </Link>
        )}
      </div>
      <p className="mt-1">{copy}</p>
    </div>
  );
}

// Coupons an admin has featured. Hidden when there are none.
async function FeaturedRow() {
  const { coupons } = await searchLiveCoupons({ featuredOnly: true, sort: "newest", limit: ROW_SIZE });
  if (coupons.length === 0) return null;
  return (
    <section className="mt-12" aria-labelledby="featured-heading">
      <RowHeader id="featured-heading" title="Featured deals" link={null} copy="Hand-picked offers from around Coupersville." />
      <div className="mt-4">
        <CouponGrid coupons={coupons} />
      </div>
    </section>
  );
}

async function NewRow() {
  const { coupons } = await searchLiveCoupons({ sort: "newest", limit: ROW_SIZE });
  return (
    <section className="mt-12" aria-labelledby="new-heading">
      <RowHeader
        id="new-heading"
        title="New around town"
        link={coupons.length > 0 ? { href: "/search?sort=newest", label: "See all new deals" } : null}
        copy="Fresh offers have just arrived in Coupersville. Take a look and find something worth trying."
      />
      <div className="mt-4">
        {coupons.length > 0 ? (
          <CouponGrid coupons={coupons} />
        ) : (
          <EmptyState title="New offers are on their way.">
            <p>No deals are live yet. Have a business? Be one of the first to open your door in Coupersville.</p>
            <Link href={JOIN_HREF} className="btn btn-secondary justify-self-start">
              Join Coupersville
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
        <EmptyState title="Categories are on their way.">
          <p>They will appear here soon. In the meantime, try a search.</p>
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
      <RowHeader
        id="ending-heading"
        title="Catch these before they're gone"
        link={coupons.length > 0 ? { href: ENDING_SOON_HREF, label: "See ending-soon deals" } : null}
        copy="These Coupersville deals are ending soon. Grab the ones you want before time runs out."
      />
      <div className="mt-4">
        {coupons.length > 0 ? (
          <CouponGrid coupons={coupons} />
        ) : (
          <EmptyState title="Nothing is ending this week.">
            <p>Every deal has more than 7 days left. Have a browse while you have time.</p>
            <Link href="/search" className="btn btn-secondary justify-self-start">
              Find a deal
            </Link>
          </EmptyState>
        )}
      </div>
    </section>
  );
}
