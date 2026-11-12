import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Gift, Globe, MapPin, Phone } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getPrivateOffer } from "@/lib/consumer";
import { goodToKnow } from "@/lib/good-to-know";
import { storeAddress } from "@/lib/address";
import { formatDay } from "@/lib/dates";
import { PRIVATE_KEY_PATTERN, SHOPPER_LABEL } from "@/lib/just-for-you";
import { ACCOUNT_LINE } from "@/lib/site-copy";
import { COUPON_IMAGE_BUCKET, LOGO_BUCKET, publicImageUrl } from "@/lib/storage";
import { Ticket, formatOffer } from "@/components/ticket";
import { TicketSkeleton } from "@/components/consumer/ticket-skeleton";
import { RedeemButton } from "@/components/consumer/redeem-button";
import { DirectionsLink } from "@/components/consumer/directions-link";

// A Just for You offer, opened by its private link. Never indexed, and the link is never sent on
// as a referrer when a visitor follows a link from here (a website, directions).
export const metadata: Metadata = {
  title: SHOPPER_LABEL,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function JustForYouPage({ params }: PageProps<"/just-for-you/[key]">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <Suspense
        fallback={
          <div className="max-w-md">
            <TicketSkeleton />
          </div>
        }
      >
        <JustForYouContent params={params} />
      </Suspense>
    </div>
  );
}

function Notice({ business, title, heading, body }: { business: string; title: string; heading: string; body: string }) {
  return (
    <div className="panel mx-auto grid max-w-xl gap-4 p-5 sm:p-6">
      <p className="text-sm font-medium">
        {SHOPPER_LABEL} from {business}
      </p>
      <h1 className="wordmark text-3xl text-ink">{heading}</h1>
      <p>
        <span className="font-semibold">{title}</span>. {body}
      </p>
      <Link href="/search" className="btn justify-self-start">
        Find another deal
      </Link>
    </div>
  );
}

async function JustForYouContent({ params }: { params: PageProps<"/just-for-you/[key]">["params"] }) {
  const { key } = await params;
  if (!PRIVATE_KEY_PATTERN.test(key)) notFound();
  const [offer, user] = await Promise.all([getPrivateOffer(key), getSessionUser()]);
  if (!offer) notFound();

  if (offer.state === "used") {
    return <Notice business={offer.business_name} title={offer.title} heading="This offer has been used." body="It could be redeemed once, and it has been." />;
  }
  if (offer.state === "ended") {
    return <Notice business={offer.business_name} title={offer.title} heading="This offer has ended." body="It can no longer be redeemed." />;
  }
  const d = offer.details;
  if (offer.state === "unavailable" || !d) {
    return (
      <Notice
        business={offer.business_name}
        title={offer.title}
        heading="This offer is not available right now."
        body="Check with the business, or try this link again later."
      />
    );
  }

  const signedIn = Boolean(user && user.status === "active");
  const stores = d.stores;
  const onlyStore = stores.length === 1 ? stores[0] : null;
  const storeText = onlyStore ? onlyStore.store_name : d.all_locations ? "All participating locations" : `${stores.length} selected locations`;
  const unavailable =
    offer.state === "scheduled" ? `Available from ${formatDay(offer.starts_at, offer.timezone)}` : offer.availability;
  const facts = goodToKnow(
    {
      min_spend: d.min_spend,
      min_qty: d.min_qty,
      max_people: d.max_people,
      per_user_limit: d.per_user_limit,
      redeem_frequency: d.redeem_frequency,
      schedule_days: d.schedule_days,
      schedule_start: d.schedule_start,
      schedule_end: d.schedule_end,
      total_limit: d.total_limit,
      limits_text: d.limits_text,
      exclusions: d.exclusions,
      expires_at: d.expires_at,
    },
    offer.timezone,
  );

  return (
    <div className="grid gap-8">
      <div>
        <p className="inline-flex items-center gap-2 rounded-sm border-[1.5px] border-ink bg-white px-3 py-1 font-semibold text-ink">
          <Gift aria-hidden size={18} strokeWidth={1.5} />
          {SHOPPER_LABEL}
        </p>
        <h1 className="wordmark mt-3 text-4xl text-ink">An offer from {d.business.name}, just for you</h1>
        <p className="mt-2 max-w-2xl">This offer is private: it is not listed on Coupersville, and it can be redeemed once.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start">
        <Ticket
          tint={d.category.stock_tint}
          merchant={d.business.name}
          offer={formatOffer(d.discount_type, d.discount_value)}
          title={offer.title}
          expiresAt={d.expires_at}
          expiringSoon={offer.expiringSoon}
          timeZone={offer.timezone}
          limits={offer.limits || undefined}
          store={storeText}
          stubActions={
            <div className="grid gap-3">
              <p className="text-sm">
                Generate your one-time QR coupon only when you are at the business and ready to present it.
              </p>
              <RedeemButton couponId={d.coupon_id} privateKey={key} signedIn={signedIn} label="Get my coupon" unavailable={unavailable} />
              {onlyStore && <DirectionsLink address={storeAddress(onlyStore)} variant="button" />}
              {!signedIn && <p className="text-sm">{ACCOUNT_LINE}</p>}
            </div>
          }
        >
          {d.image_path && (
            <div className="relative mt-4 aspect-[16/9] overflow-hidden rounded-sm border-[1.5px] border-ink">
              <Image
                src={publicImageUrl(COUPON_IMAGE_BUCKET, d.image_path)}
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
            <h2 id="deal-heading" className="text-xl font-semibold">
              Your deal
            </h2>
            {d.description && <p className="mt-2">{d.description}</p>}
            {d.included_products && (
              <p className="mt-2">
                <span className="font-semibold">Includes:</span> {d.included_products}
              </p>
            )}
            {!d.description && !d.included_products && <p className="mt-2">{offer.title}</p>}

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
                      </p>
                      {s.phone && <p className="tabular">{s.phone}</p>}
                      {!onlyStore && <DirectionsLink address={storeAddress(s)} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel p-5" aria-labelledby="business-heading">
            <div className="flex items-center gap-4">
              {d.business.logo_path && (
                <Image
                  src={publicImageUrl(LOGO_BUCKET, d.business.logo_path)}
                  alt=""
                  width={56}
                  height={56}
                  className="size-14 rounded-sm border-[1.5px] border-ink object-cover"
                />
              )}
              <h2 id="business-heading" className="text-xl font-semibold">
                {d.business.name}
              </h2>
            </div>
            {d.business.description && <p className="mt-3">{d.business.description}</p>}
            <ul className="mt-3 grid gap-2">
              {d.business.website_url && /^https?:\/\//i.test(d.business.website_url) && (
                <li>
                  <a
                    href={d.business.website_url}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="inline-flex min-h-11 items-center gap-2 font-medium text-ink underline underline-offset-4"
                  >
                    <Globe aria-hidden size={18} strokeWidth={1.5} />
                    Visit website
                  </a>
                </li>
              )}
              {d.business.contact_phone && (
                <li>
                  <a href={`tel:${d.business.contact_phone}`} className="inline-flex min-h-11 items-center gap-2 font-medium text-ink">
                    <Phone aria-hidden size={18} strokeWidth={1.5} />
                    {d.business.contact_phone}
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
