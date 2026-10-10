import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Globe, MapPin, Phone } from "lucide-react";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getLiveCouponDetail, isSaved } from "@/lib/consumer";
import { COUPON_IMAGE_BUCKET, LOGO_BUCKET, publicImageUrl } from "@/lib/storage";
import { Ticket, formatOffer } from "@/components/ticket";
import { TicketSkeleton } from "@/components/consumer/ticket-skeleton";
import { SaveButton } from "@/components/consumer/save-button";
import { RedeemButton } from "@/components/consumer/redeem-button";

export const metadata: Metadata = { title: "Coupon" };

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
  if (!detail) notFound();
  const { coupon, business, shop, stores, expiringSoon, limits } = detail;
  const signedIn = Boolean(user && user.status === "active");
  const saved = signedIn && user ? await isSaved(user.id, id) : false;

  const storeText = stores.length === 1 ? stores[0].store_name : `${stores.length} stores`;

  return (
    <div className="grid gap-8">
      <Link href={`/c/${shop.slug}`} className="inline-flex min-h-11 items-center gap-2 justify-self-start font-medium text-ink">
        <ArrowLeft aria-hidden size={18} strokeWidth={1.5} />
        Back to {shop.shop_label.replace(/^The /, "the ")}
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start">
        <Ticket
          tint={shop.stock_tint}
          merchant={business.name}
          offer={formatOffer(coupon.discount_type!, Number(coupon.discount_value))}
          title={coupon.title!}
          description={coupon.description ?? undefined}
          expiresAt={coupon.expires_at!}
          expiringSoon={expiringSoon}
          timeZone={business.timezone}
          limits={limits || undefined}
          store={storeText}
          stubActions={
            <div className="grid gap-3">
              <RedeemButton couponId={id} signedIn={signedIn} />
              <SaveButton couponId={id} saved={saved} signedIn={signedIn} saveOnArrival={sp.save === "1"} />
            </div>
          }
        >
          {coupon.included_products && <p className="mt-2 text-sm">Applies to: {coupon.included_products}</p>}
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

          <section className="panel p-5" aria-labelledby="stores-heading">
            <h2 id="stores-heading" className="text-xl font-semibold">
              Where to use it
            </h2>
            {stores.length === 0 ? (
              <p className="mt-2">This shop has no open stores listed right now. Check back soon.</p>
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
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
