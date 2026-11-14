import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { MapPin, Search } from "lucide-react";
import { listShops, searchLiveCoupons } from "@/lib/consumer";
import { foundingCallout } from "@/lib/founding-callout";
import { ENDING_SOON_HREF, JOIN_HREF, SITE_DESCRIPTION } from "@/lib/site-copy";
import { CouponGrid, EmptyState } from "@/components/consumer/coupon-ticket";
import { NearMeButton } from "@/components/consumer/near-me-button";
import { ShopCard } from "@/components/consumer/shop-card";
import { TicketGridSkeleton } from "@/components/consumer/ticket-skeleton";
import { MainStreetArt } from "@/components/main-street-art";

export const metadata: Metadata = {
  title: { absolute: "Coupersville | Discover deals from businesses near you and beyond" },
  description: SITE_DESCRIPTION,
};

const ROW_SIZE = 6;

export default function Home() {
  return (
    <div>
      {/* Hero: the marketplace line and headline beside the illustrated Main Street, then the search
          bar across the hero. The town sign photo now lives on the About page. */}
      <section
        aria-labelledby="welcome-heading"
        className="bg-[radial-gradient(1200px_500px_at_85%_-10%,rgba(242,179,61,0.22),transparent_60%),radial-gradient(900px_500px_at_-10%_110%,rgba(31,77,63,0.10),transparent_60%)]"
      >
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-4 pt-10 pb-12 sm:pt-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12">
          <div>
            <p className="text-lg font-semibold text-primary">Local offers. Local shoppers. One simple marketplace.</p>
            <p className="mt-2 max-w-xl text-stone-600">
              Coupersville is a digital coupon marketplace that connects local businesses with shoppers ready to discover them.
            </p>
            <p className="mt-6 text-lg font-medium">Come see what&apos;s happening in Coupersville.</p>
            <h1 id="welcome-heading" className="wordmark mt-1 text-[clamp(2.5rem,1.6rem+3.6vw,4.5rem)] text-evergreen-900">
              Where good deals{" "}
              <span className="bg-[linear-gradient(transparent_62%,rgba(242,179,61,0.55)_62%_92%,transparent_92%)] text-primary">
                live.
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-stone-600">
              Discover savings from restaurants, shops, services and businesses near you and beyond. Find an offer you love, get
              your digital coupon and enjoy the savings.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/search" className="btn">
                Find a deal
              </Link>
              <Link href="/explore" className="btn btn-secondary">
                Explore Coupersville
              </Link>
            </div>
            <p className="mt-4 font-semibold">No clipping. No printing. Just find it, scan it and save.</p>
          </div>
          <MainStreetArt className="mx-auto h-auto w-full max-w-[520px] drop-shadow-[0_30px_40px_rgba(20,35,30,0.12)]" />

          <section aria-labelledby="search-heading" className="lg:col-span-2">
            <h2 id="search-heading" className="wordmark text-2xl text-evergreen-900 sm:text-3xl">
              What kind of deal are you looking for?
            </h2>
            <div className="hero-search mt-4 grid gap-4 p-3 sm:p-4">
              <Form action="/search" className="grid gap-3 md:grid-cols-[1.1fr_1fr_auto] md:items-end">
                <div>
                  <label htmlFor="home-q" className="field-label">
                    Search
                  </label>
                  <div className="relative">
                    <Search
                      aria-hidden
                      size={20}
                      strokeWidth={1.8}
                      className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-600"
                    />
                    <input
                      id="home-q"
                      name="q"
                      type="search"
                      placeholder="Search businesses, products, restaurants or deals"
                      className="field-input min-h-14 pl-11"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="home-place" className="field-label">
                    Near
                  </label>
                  <div className="relative">
                    <MapPin
                      aria-hidden
                      size={20}
                      strokeWidth={1.8}
                      className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-stone-600"
                    />
                    <input
                      id="home-place"
                      name="place"
                      placeholder="City or ZIP code"
                      autoComplete="postal-code"
                      className="field-input min-h-14 pl-11"
                    />
                  </div>
                </div>
                <button type="submit" className="btn btn-accent min-h-14 px-6">
                  <Search aria-hidden size={18} strokeWidth={1.8} />
                  Find my deals
                </button>
              </Form>
              <NearMeButton placeInputId="home-place" />
            </div>
          </section>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4">
        <Suspense fallback={null}>
          <FeaturedRow />
        </Suspense>

        <Suspense fallback={<RowSkeleton title="New around town" />}>
          <NewRow />
        </Suspense>

        <section id="categories" className="mt-16 scroll-mt-6" aria-labelledby="categories-heading">
          <h2 id="categories-heading" className="wordmark text-3xl text-evergreen-900 sm:text-4xl">
            Stroll through Coupersville
          </h2>
          <p className="mt-2 text-stone-600">
            What are you shopping for today? Explore food, fashion, beauty and grooming, essentials and more.
          </p>
          <Suspense fallback={<ShopGridSkeleton />}>
            <ShopGrid />
          </Suspense>
          <Link href="/explore" className="btn btn-secondary mt-6">
            Explore all categories
          </Link>
        </section>
      </div>

      <div className="mt-16 bg-[linear-gradient(180deg,var(--cv-brick-100),var(--cv-cream-50))] pt-2 pb-4">
        <div className="mx-auto max-w-5xl px-4">
          <Suspense fallback={<RowSkeleton title="Catch these before they're gone" />}>
            <EndingSoonRow />
          </Suspense>
        </div>
      </div>

      <section className="mt-12 bg-evergreen-900 text-[#c9d6cf]" aria-labelledby="business-heading">
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-4 py-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div>
            <h2 id="business-heading" className="wordmark text-3xl text-white sm:text-4xl">
              Have a business? Open your door in Coupersville.
            </h2>
            <p className="mt-4 max-w-2xl text-lg">
              Create your own offers, reach new customers and give people another reason to walk through your door. A Coupersville
              membership gives you the tools to create, publish and manage your coupons.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/for-businesses" className="btn btn-on-dark">
                Learn about Coupersville for business
              </Link>
              <Link href={JOIN_HREF} className="btn btn-accent">
                Join Coupersville
              </Link>
            </div>
          </div>
          <Suspense fallback={null}>
            <FoundingLine />
          </Suspense>
        </div>
      </section>
    </div>
  );
}

async function FoundingLine() {
  const f = await foundingCallout();
  if (!f) return null;
  return (
    <div className="ticket" data-tint="butter">
      <div className="ticket-main p-6">
        <p className="text-lg text-evergreen-900">
          <span className="font-semibold">{f.name} offer:</span> The first {f.freeSeats} qualifying merchants who join between{" "}
          {f.from} and {f.to} receive one complimentary year.
        </p>
      </div>
      <div className="ticket-stub p-6">
        <Link href="/pioneer-circle" className="font-semibold text-primary underline underline-offset-4">
          About the {f.name}
        </Link>
      </div>
    </div>
  );
}

function RowSkeleton({ title }: { title: string }) {
  return (
    <section className="mt-16">
      <h2 className="wordmark text-3xl text-evergreen-900 sm:text-4xl">{title}</h2>
      <div className="mt-6">
        <TicketGridSkeleton count={3} />
      </div>
    </section>
  );
}

function ShopGridSkeleton() {
  return (
    <div role="status" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only">Loading categories</span>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} aria-hidden className="h-[96px] rounded-md border border-line bg-white" />
      ))}
    </div>
  );
}

function RowHeader({ id, title, link, copy }: { id: string; title: string; link: { href: string; label: string } | null; copy: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={id} className="wordmark text-3xl text-evergreen-900 sm:text-4xl">
          {title}
        </h2>
        {link && (
          <Link href={link.href} className="btn btn-secondary">
            {link.label}
          </Link>
        )}
      </div>
      <p className="mt-2 text-stone-600">{copy}</p>
    </div>
  );
}

// Coupons an admin has featured. Hidden when there are none.
async function FeaturedRow() {
  const { coupons } = await searchLiveCoupons({ featuredOnly: true, sort: "newest", limit: ROW_SIZE });
  if (coupons.length === 0) return null;
  return (
    <section className="mt-16" aria-labelledby="featured-heading">
      <RowHeader id="featured-heading" title="Featured deals" link={null} copy="Hand-picked offers from around Coupersville." />
      <div className="mt-6">
        <CouponGrid coupons={coupons} />
      </div>
    </section>
  );
}

async function NewRow() {
  const { coupons } = await searchLiveCoupons({ sort: "newest", limit: ROW_SIZE });
  return (
    <section className="mt-16" aria-labelledby="new-heading">
      <RowHeader
        id="new-heading"
        title="New around town"
        link={coupons.length > 0 ? { href: "/search?sort=newest", label: "See all new deals" } : null}
        copy="Fresh offers have just arrived in Coupersville. Take a look and find something worth trying."
      />
      <div className="mt-6">
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
      <div className="mt-6">
        <EmptyState title="Categories are on their way.">
          <p>They will appear here soon. In the meantime, try a search.</p>
        </EmptyState>
      </div>
    );
  }
  return (
    <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
    <section className="mt-16" aria-labelledby="ending-heading">
      <RowHeader
        id="ending-heading"
        title="Catch these before they're gone"
        link={coupons.length > 0 ? { href: ENDING_SOON_HREF, label: "See ending-soon deals" } : null}
        copy="These Coupersville deals are ending soon. Grab the ones you want before time runs out."
      />
      <div className="mt-6">
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
