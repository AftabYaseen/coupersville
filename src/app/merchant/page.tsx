import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Plus, ScanLine } from "lucide-react";
import { parseStats } from "@/lib/redemption-stats";
import { requireMerchantAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { subscriptionIsActive } from "@/lib/merchant";
import { COUPON_VIEWS, COUPON_VIEW_LABELS, couponView } from "@/lib/coupons";
import { formatDay } from "@/lib/dates";
import { PageLoading } from "@/components/page-loading";

export const metadata: Metadata = { title: "Merchant portal" };

export default function MerchantPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <MerchantHome />
    </Suspense>
  );
}

function summarise(
  coupons: Parameters<typeof couponView>[0][],
  subscription: Parameters<typeof subscriptionIsActive>[0],
) {
  const now = Date.now();
  const counts = Object.fromEntries(COUPON_VIEWS.map((v) => [v, 0])) as Record<(typeof COUPON_VIEWS)[number], number>;
  for (const c of coupons) counts[couponView(c, now)] += 1;
  return { counts, planActive: subscriptionIsActive(subscription, now) };
}

async function MerchantHome() {
  const { user, memberships } = await requireMerchantAccess("/merchant");
  const managed = memberships.find((m) => m.role === "owner" || m.role === "manager");

  if (!managed) {
    if (memberships.length > 0) redirect("/merchant/scan");
    if (user.role === "merchant") redirect("/merchant/onboarding");
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="wordmark text-4xl text-ink">Merchant portal</h1>
        <p className="panel mt-6 p-5">You do not manage a business on Coupersville.</p>
      </div>
    );
  }
  if (managed.businessStatus === "draft") redirect("/merchant/onboarding");

  const supabase = await createClient();
  const [{ data: business }, { data: subscription }, { data: coupons }, { count: storeCount }, { data: rawStats }] =
    await Promise.all([
      supabase.from("businesses").select("name, status, timezone").eq("id", managed.businessId).single(),
      supabase.from("subscriptions").select("*").eq("business_id", managed.businessId).maybeSingle(),
      supabase
        .from("coupons")
        .select("id, title, status, starts_at, expires_at, total_limit")
        .eq("business_id", managed.businessId),
      supabase
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("business_id", managed.businessId)
        .eq("active", true),
      supabase.rpc("business_redemption_stats", { p_business_id: managed.businessId }),
    ]);
  if (!business) redirect("/merchant/onboarding");

  const { counts, planActive } = summarise(coupons ?? [], subscription);
  const stats = parseStats(rawStats);
  const byCoupon = (coupons ?? [])
    .map((c) => ({ ...c, redeemed: stats.byCoupon[c.id] ?? 0 }))
    .filter((c) => c.redeemed > 0)
    .sort((a, b) => b.redeemed - a.redeemed);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="wordmark text-4xl text-ink">{business.name}</h1>
          <p className="mt-1">Signed in as {user.fullName ?? user.email}.</p>
        </div>
        <Link href="/merchant/coupons/new" className="btn">
          <Plus aria-hidden size={18} strokeWidth={1.5} />
          Create coupon
        </Link>
      </div>

      {business.status === "suspended" && (
        <p className="mt-6 rounded-sm border-[1.5px] border-signal bg-white p-4 text-signal">
          Your business is suspended, so shoppers cannot see your coupons. Contact Coupersville support to sort it out.
        </p>
      )}

      <section className="panel mt-6 p-5" aria-labelledby="plan-heading">
        <h2 id="plan-heading" className="text-xl font-semibold">
          Your plan
        </h2>
        {planActive && subscription ? (
          <p className="mt-2">
            {subscription.source === "complimentary" ? "Complimentary plan" : "Annual plan"}, active
            {subscription.current_period_end
              ? ` until ${formatDay(subscription.current_period_end, business.timezone)}.`
              : " with no end date."}
          </p>
        ) : (
          <p className="mt-2">
            Your plan is not active yet. You can build coupons and save them as drafts. Publishing opens once
            Coupersville activates your plan.
          </p>
        )}
      </section>

      <section className="mt-6" aria-labelledby="redemptions-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="redemptions-heading" className="text-xl font-semibold">
            Redemptions
          </h2>
          <Link href="/merchant/scan" className="btn btn-secondary">
            <ScanLine aria-hidden size={18} strokeWidth={1.5} />
            Open scanner
          </Link>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-3">
          {[
            { label: "Today", value: stats.today },
            { label: "This week", value: stats.week },
            { label: "All time", value: stats.total },
          ].map((s) => (
            <div key={s.label} className="panel p-4">
              <dt className="font-medium">{s.label}</dt>
              <dd className="text-3xl font-semibold tabular">{s.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-sm">Today and this week follow your business timezone. Weeks start on Monday.</p>
        {byCoupon.length > 0 ? (
          <div className="panel mt-3 overflow-x-auto">
            <table className="w-full text-left">
              <caption className="sr-only">Redemptions by coupon</caption>
              <thead>
                <tr className="border-b-[1.5px] border-ink">
                  <th scope="col" className="p-3 font-semibold">
                    Coupon
                  </th>
                  <th scope="col" className="p-3 text-right font-semibold">
                    Redeemed
                  </th>
                </tr>
              </thead>
              <tbody>
                {byCoupon.map((c) => (
                  <tr key={c.id} className="border-b border-ink/20 last:border-0">
                    <td className="p-3">
                      <Link href={`/merchant/coupons/${c.id}`} className="font-medium text-ink underline underline-offset-4">
                        {c.title}
                      </Link>
                    </td>
                    <td className="p-3 text-right tabular">
                      {c.redeemed}
                      {c.total_limit ? ` of ${c.total_limit}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="panel mt-3 p-4">No coupons redeemed yet. When staff confirm one in the scanner, it is counted here.</p>
        )}
      </section>

      <section className="mt-6" aria-labelledby="coupons-heading">
        <h2 id="coupons-heading" className="text-xl font-semibold">
          Coupons
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {COUPON_VIEWS.map((view) => (
            <li key={view}>
              <Link href={`/merchant/coupons?view=${view}`} className="panel block p-4">
                <span className="block text-3xl font-semibold tabular">{counts[view]}</span>
                <span className="block font-medium">{COUPON_VIEW_LABELS[view]}</span>
              </Link>
            </li>
          ))}
        </ul>
        {counts.live > 0 && !planActive && (
          <p className="mt-3 text-sm text-signal">Live coupons stay hidden from shoppers until your plan is active.</p>
        )}
      </section>

      <section className="panel mt-6 flex flex-wrap items-center justify-between gap-3 p-5" aria-labelledby="stores-heading">
        <div>
          <h2 id="stores-heading" className="text-xl font-semibold">
            Stores
          </h2>
          <p className="mt-1 tabular">
            {storeCount ?? 0} active {storeCount === 1 ? "store" : "stores"}
          </p>
        </div>
        <Link href="/merchant/locations" className="btn btn-secondary">
          Manage stores
        </Link>
      </section>
    </div>
  );
}
