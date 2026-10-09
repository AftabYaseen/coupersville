import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { listSaved } from "@/lib/consumer";
import { formatDay } from "@/lib/dates";
import { Ticket, formatOffer } from "@/components/ticket";
import { EmptyState } from "@/components/consumer/coupon-ticket";
import { TicketGridSkeleton } from "@/components/consumer/ticket-skeleton";
import { RemoveSavedButton } from "@/components/consumer/remove-saved-button";
import { TINT_BG } from "@/components/consumer/shop-card";

export const metadata: Metadata = { title: "Saved coupons" };

export default function SavedPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="wordmark text-4xl text-ink">Saved coupons</h1>
      <Suspense
        fallback={
          <div className="mt-6">
            <TicketGridSkeleton count={3} />
          </div>
        }
      >
        <SavedContent />
      </Suspense>
    </div>
  );
}

async function SavedContent() {
  await requireUser("/saved");
  const saved = await listSaved();
  const live = saved.filter((s) => s.is_live);
  const gone = saved.filter((s) => !s.is_live);

  if (saved.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState title="Nothing saved yet.">
          <p>Find a coupon you like and tap Save coupon. It will wait for you here.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/#main-street" className="btn">
              Browse Main Street
            </Link>
            <Link href="/search" className="btn btn-secondary">
              Search coupons
            </Link>
          </div>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-10">
      {live.length > 0 ? (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((s) => (
            <li key={s.coupon_id} className="grid gap-3">
              <Link href={`/coupon/${s.coupon_id}`} className="block rounded-md">
                <Ticket
                  tint={s.stock_tint}
                  merchant={s.business_name}
                  offer={formatOffer(s.discount_type, s.discount_value)}
                  title={s.title}
                  expiresAt={s.expires_at}
                  expiringSoon={s.expiringSoon}
                  timeZone={s.business_timezone}
                />
              </Link>
              <RemoveSavedButton couponId={s.coupon_id} title={s.title} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="None of your saved coupons are live right now.">
          <Link href="/search" className="btn justify-self-start">
            Find new coupons
          </Link>
        </EmptyState>
      )}

      {gone.length > 0 && (
        <section aria-labelledby="gone-heading">
          <h2 id="gone-heading" className="text-xl font-semibold">
            No longer available
          </h2>
          <p className="mt-1 text-sm">These ended or were taken down after you saved them.</p>
          <ul className="mt-4 grid gap-3">
            {gone.map((s) => (
              <li key={s.coupon_id} className="panel flex flex-col overflow-hidden p-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 items-stretch">
                  <span aria-hidden className={`w-3 shrink-0 border-r-[1.5px] border-dashed border-ink ${TINT_BG[s.stock_tint]}`} />
                  <div className="min-w-0 p-4">
                    <p className="text-sm font-semibold text-signal">
                      {s.ended ? `Ended ${formatDay(s.expires_at, s.business_timezone)}` : "No longer available"}
                    </p>
                    <p className="font-semibold">
                      {formatOffer(s.discount_type, s.discount_value)}, {s.title}
                    </p>
                    <p className="text-sm">{s.business_name}</p>
                  </div>
                </div>
                <div className="px-4 pb-4 pl-7 sm:p-4">
                  <RemoveSavedButton couponId={s.coupon_id} title={s.title} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
