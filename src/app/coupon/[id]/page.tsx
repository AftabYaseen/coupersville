import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronRight, Globe, MapPin, Phone } from "lucide-react";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getCouponMeta, getEndedCoupon, getLiveCouponDetail, isSaved } from "@/lib/consumer";
import { goodToKnow } from "@/lib/good-to-know";
import { storeAddress } from "@/lib/address";
import { ACCOUNT_LINE } from "@/lib/site-copy";
import { COUPON_IMAGE_BUCKET, LOGO_BUCKET, publicImageUrl } from "@/lib/storage";
import { Ticket, describeOffer, formatOffer } from "@/components/ticket";
import { TicketSkeleton } from "@/components/consumer/ticket-skeleton";
import { SaveButton } from "@/components/consumer/save-button";
import { RedeemButton } from "@/components/consumer/redeem-button";
import { DirectionsLink } from "@/components/consumer/directions-link";
import type { Enums } from "@/lib/supabase/database.types";

export async function generateMetadata({ params }: PageProps<"/coupon/[id]">): Promise<Metadata> {
  const { id } = await params;
  const meta = z.uuid().safeParse(id).success ? await getCouponMeta(id) : null;
  if (!meta) return { title: "Deal not available" };
  const offer = formatOffer(meta.discount_type!, meta.discount_value).toLowerCase();
  const at = meta.businessName ? ` from ${meta.businessName}` : "";
  return {
    title: `${meta.title}, ${offer}${at}`,
    description: meta.description?.slice(0, 200) || `${offer} ${meta.title}${at}. Get your one-time Coupersville coupon when you are ready to redeem.`,
  };
}

export default function CouponPage({ params, searchParams }: PageProps<"/coupon/[id]">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <Suspense
        fallback={
          <div className="max-w-md">
            <TicketSkeleton />
          </div>
        }
      >
        <CouponContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// "Enjoy 20% off on all bread. Review the details below, ..." in words that fit each kind of offer.
function introText(type: Enums<"discount_type">, value: number | null, title: string, included: string | null) {
  const offer = describeOffer(type, value);
  const first =
    type === "free"
      ? "Enjoy this free offer."
      : type === "fixed_price"
        ? `Pay ${offer} for ${included || title}.`
        : `Enjoy ${offer}${included ? ` on ${included}` : ""}.`;
  return `${first} Review the details below, then get your one-time Coupersville coupon when you are ready to redeem.`;
}

async function CouponContent({
  params,
  searchParams,
}: {
  params: PageProps<"/coupon/[id]">["params"];
  searchParams: PageProps<"/coupon/[id]">["searchParams"];
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();

  const [detail, user] = await Promise.all([getLiveCouponDetail(id), getSessionUser()]);
  if (!detail) {
    const ended = await getEndedCoupon(id);
    if (!ended) notFound();
    return (
      <div className="panel mx-auto grid max-w-xl gap-4 p-5 sm:p-6">
        <p className="text-sm font-medium">{ended.businessName}</p>
        <h1 className="wordmark text-3xl text-ink">This deal has ended.</h1>
        <p>
          <span className="font-semibold">{ended.title}</span> is no longer available. Explore Coupersville to find another offer from
          this business or discover something new.
        </p>
        <Link href="/search" className="btn justify-self-start">
          Find another deal
        </Link>
      </div>
    );
  }
  const { coupon, business, shop, stores, expiringSoon, limits } = detail;
  const signedIn = Boolean(user && user.status === "active");
  const saved = signedIn && user ? await isSaved(user.id, id) : false;
  const storeText = coupon.all_locations
    ? stores.length === 1
      ? stores[0].store_name
      : "All participating locations"
    : stores.length === 1
      ? stores[0].store_name
      : `${stores.length} selected locations`;

  const facts = goodToKnow(
    {
      min_spend: coupon.min_spend,
      min_qty: coupon.min_qty,
      max_people: coupon.max_people,
      per_user_limit: coupon.per_user_limit ?? null,
      redeem_frequency: coupon.redeem_frequency,
      schedule_days: coupon.schedule_days,
      schedule_start: coupon.schedule_start,
      schedule_end: coupon.schedule_end,
      total_limit: coupon.total_limit,
      limits_text: coupon.limits_text,
      exclusions: coupon.exclusions,
      expires_at: coupon.expires_at,
    },
    business.timezone,
  );
  // One store: Get directions sits with Get my coupon. Several: each store has its own link below.
  const onlyStore = stores.length === 1 ? stores[0] : null;

  return (
    <div className="grid gap-8">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-x-1 text-sm">
          <li className="flex items-center gap-1">
            <Link href="/" className="inline-flex min-h-11 items-center font-medium text-ink underline-offset-4 hover:underline">
              Coupersville
            </Link>
            <ChevronRight aria-hidden size={16} strokeWidth={1.5} className="text-ink" />
          </li>
          <li className="flex items-center gap-1">
            <Link
              href={`/c/${shop.slug}`}
              className="inline-flex min-h-11 items-center font-medium text-ink underline-offset-4 hover:underline"
            >
              {shop.name}
            </Link>
            <ChevronRight aria-hidden size={16} strokeWidth={1.5} className="text-ink" />
          </li>
          <li aria-current="page" className="inline-flex min-h-11 items-center">
            {business.name}
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start">
        <Ticket
          tint={shop.stock_tint}
          merchant={business.name}
          offer={formatOffer(coupon.discount_type!, coupon.discount_value)}
          title={coupon.title!}
          expiresAt={coupon.expires_at!}
          expiringSoon={expiringSoon}
          timeZone={business.timezone}
          limits={limits || undefined}
          store={storeText}
          stubActions={
            <div className="grid gap-3">
              <p className="text-sm">
                Ready to use this offer? Generate your one-time QR coupon only when you are at the participating business and ready to
                present it.
              </p>
              <RedeemButton couponId={id} signedIn={signedIn} label="Get my coupon" unavailable={detail.availability} />
              <SaveButton couponId={id} saved={saved} signedIn={signedIn} saveOnArrival={sp.save === "1"} />
              {onlyStore && <DirectionsLink address={storeAddress(onlyStore)} variant="button" />}
              {!signedIn && <p className="text-sm">{ACCOUNT_LINE}</p>}
            </div>
          }
        >
          {coupon.image_path && (
            <div className="relative mt-4 aspect-[16/9] overflow-hidden rounded-sm border-[1.5px] border-ink">
              <Image
                src={publicImageUrl(COUPON_IMAGE_BUCKET, coupon.image_path)}
                alt=""
                fill
                sizes="(max-width: 640px) 90vw, 400px"
                className="object-cover"
              />
            </div>
          )}
        </Ticket>

        <div className="grid gap-6">
          <section className="panel p-5" aria-labelledby="deal-heading">
            <p>{introText(coupon.discount_type!, coupon.discount_value, coupon.title!, coupon.included_products)}</p>
            <h2 id="deal-heading" className="mt-4 text-xl font-semibold">
              Your deal
            </h2>
            {coupon.description && <p className="mt-2">{coupon.description}</p>}
            {coupon.included_products && (
              <p className="mt-2">
                <span className="font-semibold">Includes:</span> {coupon.included_products}
              </p>
            )}
            {!coupon.description && !coupon.included_products && <p className="mt-2">{coupon.title}</p>}

            <h2 className="mt-5 text-xl font-semibold">Good to know</h2>
            <dl className="mt-2 grid gap-2">
              {facts.map(([label, value]) => (
                <div key={label} className="grid gap-x-3 sm:grid-cols-[10rem_1fr]">
                  <dt className="font-semibold">{label}</dt>
                  <dd className="tabular">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="panel p-5" aria-labelledby="stores-heading">
            <h2 id="stores-heading" className="text-xl font-semibold">
              Where to use it
            </h2>
            {stores.length === 0 ? (
              <p className="mt-2">This business has no open locations listed right now. Check back soon.</p>
            ) : (
              <>
                <p className="mt-2">{coupon.all_locations ? "Valid at all participating locations." : "Valid at selected locations."}</p>
                <ul className="mt-3 grid gap-4">
                  {stores.map((s) => (
                    <li key={s.id} className="flex gap-3">
                      <MapPin aria-hidden size={18} strokeWidth={1.5} className="mt-1 shrink-0 text-ink" />
                      <div>
                        <p className="font-semibold">
                          {s.store_name}
                          {s.store_number && <span className="font-normal tabular"> #{s.store_number}</span>}
                        </p>
                        <p>
                          {[s.address_line1, s.address_line2].filter(Boolean).join(", ")}
                          <br />
                          {[s.city, s.state, s.postal_code].filter(Boolean).join(", ")}
                          {s.country && (
                            <>
                              <br />
                              {s.country}
                            </>
                          )}
                        </p>
                        {s.phone && <p className="tabular">{s.phone}</p>}
                        {!onlyStore && <DirectionsLink address={storeAddress(s)} />}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="panel p-5" aria-labelledby="business-heading">
            <div className="flex items-center gap-4">
              {business.logo_path && (
                <Image
                  src={publicImageUrl(LOGO_BUCKET, business.logo_path)}
                  alt=""
                  width={56}
                  height={56}
                  className="size-14 rounded-sm border-[1.5px] border-ink object-cover"
                />
              )}
              <h2 id="business-heading" className="text-xl font-semibold">
                {business.name}
              </h2>
            </div>
            {business.description && <p className="mt-3">{business.description}</p>}
            <ul className="mt-3 grid gap-2">
              {business.website_url && /^https?:\/\//i.test(business.website_url) && (
                <li>
                  <a
                    href={business.website_url}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="inline-flex min-h-11 items-center gap-2 font-medium text-ink underline underline-offset-4"
                  >
                    <Globe aria-hidden size={18} strokeWidth={1.5} />
                    Visit website
                  </a>
                </li>
              )}
              {business.contact_phone && (
                <li>
                  <a href={`tel:${business.contact_phone}`} className="inline-flex min-h-11 items-center gap-2 font-medium text-ink">
                    <Phone aria-hidden size={18} strokeWidth={1.5} />
                    {business.contact_phone}
                  </a>
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
