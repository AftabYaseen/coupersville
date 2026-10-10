import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatOffer } from "@/components/ticket";
import { EmptyState } from "@/components/consumer/coupon-ticket";
import { TINT_BG } from "@/components/consumer/shop-card";
import { PageLoading } from "@/components/page-loading";

export const metadata: Metadata = { title: "Redemption history" };

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <h1 className="wordmark text-4xl text-ink">Your history</h1>
      <Suspense fallback={<PageLoading />}>
        <HistoryContent />
      </Suspense>
    </div>
  );
}

function formatWhen(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

async function HistoryContent() {
  await requireUser("/history");
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_redemptions");
  const rows = data ?? [];

  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState title="No redemptions yet.">
          <p>When a shop scans one of your coupons, it shows up here with the date and store.</p>
          <Link href="/search" className="btn justify-self-start">
            Find coupons
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <>
      <p className="mt-2 tabular">
        {rows.length} {rows.length === 1 ? "coupon" : "coupons"} redeemed
      </p>
      <ul className="mt-6 grid gap-3">
        {rows.map((r) => {
          const store = r.store_name
            ? `${r.store_name}${r.store_number ? ` #${r.store_number}` : ""}${r.store_city ? `, ${r.store_city}` : ""}`
            : "Store no longer listed";
          const body = (
            <>
              <span aria-hidden className={`w-3 shrink-0 border-r-[1.5px] border-dashed border-ink ${TINT_BG[r.stock_tint]}`} />
              <span className="grid min-w-0 flex-1 gap-1 p-4">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold">{r.business_name}</span>
                  <time dateTime={r.redeemed_at} className="text-sm tabular">
                    {formatWhen(r.redeemed_at, r.business_timezone)}
                  </time>
                </span>
                <span>
                  <span className="font-semibold tabular">{formatOffer(r.discount_type, Number(r.discount_value))}</span>, {r.title}
                </span>
                <span className="flex items-start gap-1.5 text-sm">
                  <MapPin aria-hidden size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink" />
                  {store}
                </span>
              </span>
            </>
          );
          return (
            <li key={r.redemption_id}>
              {r.coupon_is_live ? (
                <Link href={`/coupon/${r.coupon_id}`} className="panel flex items-stretch overflow-hidden">
                  {body}
                </Link>
              ) : (
                <div className="panel flex items-stretch overflow-hidden">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
