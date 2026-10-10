import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { requireManagedBusiness } from "@/lib/merchant";
import { COUPON_VIEWS, COUPON_VIEW_LABELS, couponView, type CouponView } from "@/lib/coupons";
import { formatDay } from "@/lib/dates";
import { parseStats } from "@/lib/redemption-stats";
import { formatOffer } from "@/components/ticket";
import { PageLoading } from "@/components/page-loading";

export const metadata: Metadata = { title: "Coupons" };

const EMPTY: Record<CouponView, string> = {
  live: "Nothing is live right now. Publish a coupon to put it in front of shoppers.",
  scheduled: "No coupons are waiting to start.",
  draft: "No drafts. Start a coupon and save it as a draft to finish later.",
  paused: "No paused coupons.",
  expired: "No coupons have ended yet.",
};

const TINT_BG = {
  mint: "bg-stock-mint",
  pink: "bg-stock-pink",
  sky: "bg-stock-sky",
  butter: "bg-stock-butter",
} as const;

export default function CouponsPage({ searchParams }: PageProps<"/merchant/coupons">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <CouponsContent searchParams={searchParams} />
    </Suspense>
  );
}

function redeemedLabel(count: number, totalLimit: number | null) {
  if (totalLimit) return `${count} of ${totalLimit} redeemed`;
  return `${count} redeemed`;
}

function withViews<T extends Parameters<typeof couponView>[0]>(coupons: T[]) {
  const now = Date.now();
  return coupons.map((c) => ({ ...c, view: couponView(c, now) }));
}

async function CouponsContent({ searchParams }: { searchParams: PageProps<"/merchant/coupons">["searchParams"] }) {
  const { view: viewParam } = await searchParams;
  const { business, supabase } = await requireManagedBusiness("/merchant/coupons");
  const [{ data: coupons }, { data: rawStats }] = await Promise.all([
    supabase
      .from("coupons")
      .select("id, title, status, discount_type, discount_value, starts_at, expires_at, total_limit, categories(name, stock_tint)")
      .eq("business_id", business.id)
      .order("updated_at", { ascending: false }),
    supabase.rpc("business_redemption_stats", { p_business_id: business.id }),
  ]);
  const redeemed = parseStats(rawStats).byCoupon;

  const rows = withViews(coupons ?? []);
  const counts = Object.fromEntries(COUPON_VIEWS.map((v) => [v, rows.filter((r) => r.view === v).length]));
  const view: CouponView = COUPON_VIEWS.includes(viewParam as CouponView)
    ? (viewParam as CouponView)
    : counts.live > 0 || rows.length === 0
      ? "live"
      : (COUPON_VIEWS.find((v) => counts[v] > 0) ?? "live");
  const visible = rows.filter((r) => r.view === view);
  const tz = business.timezone;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="wordmark text-4xl text-ink">Coupons</h1>
        <Link href="/merchant/coupons/new" className="btn">
          <Plus aria-hidden size={18} strokeWidth={1.5} />
          Create coupon
        </Link>
      </div>

      <nav aria-label="Coupon status" className="mt-6 overflow-x-auto">
        <ul className="flex gap-2">
          {COUPON_VIEWS.map((v) => (
            <li key={v}>
              <Link
                href={`/merchant/coupons?view=${v}`}
                aria-current={v === view ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-sm border-[1.5px] border-ink px-3 font-medium whitespace-nowrap ${
                  v === view ? "bg-ink text-white" : "bg-white text-ink"
                }`}
              >
                {COUPON_VIEW_LABELS[v]}
                <span className="tabular">{counts[v]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {visible.length === 0 ? (
        <div className="panel mt-6 p-5">
          <p>{EMPTY[view]}</p>
          {(view === "live" || view === "draft") && (
            <Link href="/merchant/coupons/new" className="btn mt-4">
              Create coupon
            </Link>
          )}
        </div>
      ) : (
        <ul className="mt-6 grid gap-3">
          {visible.map((c) => (
            <li key={c.id}>
              <Link href={`/merchant/coupons/${c.id}`} className="panel flex items-stretch overflow-hidden">
                <span
                  aria-hidden
                  className={`w-3 shrink-0 border-r-[1.5px] border-dashed border-ink ${TINT_BG[c.categories?.stock_tint ?? "sky"]}`}
                />
                <span className="flex flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4">
                  <span>
                    <span className="block font-semibold">{c.title}</span>
                    <span className="block text-sm tabular">
                      {formatDay(c.starts_at, tz)} to {formatDay(c.expires_at, tz)}
                      {c.categories?.name ? `, ${c.categories.name}` : ""}
                    </span>
                    {c.status !== "draft" && (
                      <span className="block text-sm tabular">
                        {redeemedLabel(redeemed[c.id] ?? 0, c.total_limit)}
                      </span>
                    )}
                  </span>
                  <span className="offer-text bg-marigold px-2 pt-1 pb-0.5 text-2xl tabular">
                    {formatOffer(c.discount_type, Number(c.discount_value))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
