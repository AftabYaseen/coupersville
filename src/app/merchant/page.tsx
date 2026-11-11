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
import { planState } from "@/lib/billing";
import { FOUNDING_OFFER } from "@/lib/offers";
import { PageLoading } from "@/components/page-loading";
import { PlanPanel } from "@/components/merchant/plan-panel";
import { CampaignUsage } from "@/components/merchant/usage";
import { loadUsage, locationsText } from "@/lib/limits";

export const metadata: Metadata = { title: "Merchant portal" };

export default function MerchantPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <MerchantHome />
    </Suspense>
  );
}

function clockNow() {
  return Date.now();
}

function summarise(
  coupons: Parameters<typeof couponView>[0][],
  subscription: Parameters<typeof subscriptionIsActive>[0],
) {
  const now = Date.now();
  const counts = Object.fromEntries(COUPON_VIEWS.map((v) => [v, 0])) as Record<(typeof COUPON_VIEWS)[number], number>;
  for (const c of coupons) counts[couponView(c, now)] += 1;
  return { counts, planActive: subscriptionIsActive(subscription, now), plan: planState(subscription, now) };
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
  const [{ data: business }, { data: subscription }, { data: coupons }, { count: storeCount }, { data: rawStats }, usage] =
    await Promise.all([
      supabase.from("businesses").select("name, status, timezone").eq("id", managed.businessId).single(),
      supabase.from("subscriptions").select("*").eq("business_id", managed.businessId).maybeSingle(),
      supabase
        .from("coupons")
        .select("id, title, status, starts_at, expires_at, total_limit, admin_hold")
        .eq("business_id", managed.businessId),
      supabase
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("business_id", managed.businessId)
        .eq("active", true),
      supabase.rpc("business_redemption_stats", { p_business_id: managed.businessId }),
      loadUsage(supabase, managed.businessId),
    ]);
  if (!business) redirect("/merchant/onboarding");

  const { counts, planActive, plan } = summarise(coupons ?? [], subscription);
  const now = clockNow();
  const stats = parseStats(rawStats);
  const byCoupon = (coupons ?? [])
    .map((c) => ({ ...c, redeemed: stats.byCoupon[c.id] ?? 0 }))
    .filter((c) => c.redeemed > 0)
    .sort((a, b) => b.redeemed - a.redeemed);

  const endingSoon = (coupons ?? []).filter(
    (c) => couponView(c, now) === "live" && new Date(c.expires_at).getTime() - now <= 7 * 86_400_000,
  ).length;
  const summary = [
    { label: "Active coupons", value: counts.live, href: "/merchant/coupons?view=live" },
    { label: "Draft coupons", value: counts.draft, href: "/merchant/coupons?view=draft" },
    { label: "Ending soon", value: endingSoon, href: "/merchant/coupons?view=live" },
    { label: "Total redemptions", value: stats.total, href: null },
    { label: "Redemptions this month", value: stats.thisMonth, href: null },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="grid gap-4">
        <div>
          <h1 className="wordmark text-4xl text-ink">Welcome back, {business.name}.</h1>
          <p className="mt-2">Manage your offers, locations and Coupersville membership from one place.</p>
          <p className="mt-1 text-sm">Signed in as {user.fullName ?? user.email}.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/merchant/coupons/new" className="btn">
            <Plus aria-hidden size={18} strokeWidth={1.5} />
            Create a coupon
          </Link>
          <Link href="/merchant/scan" className="btn btn-secondary">
            <ScanLine aria-hidden size={18} strokeWidth={1.5} />
            Scan a coupon
          </Link>
        </div>
      </div>

      {(coupons ?? []).length === 0 ? (
        <div className="panel mt-6 grid gap-4 p-5">
          <p>Your counter is ready, but there are no offers on display yet. Create your first coupon and invite customers in.</p>
          <Link href="/merchant/coupons/new" className="btn justify-self-start">
            Create my first coupon
          </Link>
        </div>
      ) : (
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {summary.map((s) => (
            <div key={s.label} className="panel p-4">
              <dt className="font-medium">{s.href ? <Link href={s.href} className="text-ink underline-offset-4 hover:underline">{s.label}</Link> : s.label}</dt>
              <dd className="text-3xl font-semibold tabular">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {business.status === "suspended" && (
        <p className="mt-6 rounded-sm border-[1.5px] border-signal bg-white p-4 text-signal">
          Your business is suspended, so shoppers cannot see your coupons. Contact Coupersville support to sort it out.
        </p>
      )}

      {/* The plan comes first: a failed payment or a missing plan is the thing to fix. */}
      <div className="mt-6" role={plan.kind === "past_due" || plan.kind === "expired" ? "alert" : undefined}>
        <PlanPanel
          state={plan}
          timeZone={business.timezone}
          foundingSeat={subscription?.offer_code === FOUNDING_OFFER && subscription.source === "complimentary"}
          billingLink
        />
      </div>

      <section className="mt-6" aria-labelledby="redemptions-heading">
        <h2 id="redemptions-heading" className="text-xl font-semibold">
          Redemptions
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Today", value: stats.today },
            { label: "Last 7 days", value: stats.last7Days },
            { label: "This month", value: stats.thisMonth },
            { label: "All time", value: stats.total },
          ].map((s) => (
            <div key={s.label} className="panel p-4">
              <dt className="font-medium">{s.label}</dt>
              <dd className="text-3xl font-semibold tabular">{s.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-sm">Today and this month follow your business timezone. The month starts on the 1st.</p>
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
        <CampaignUsage usage={usage} className="mt-2" />
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {COUPON_VIEWS.filter((view) => view !== "removed" || counts.removed > 0).map((view) => (
            <li key={view}>
              <Link href={`/merchant/coupons?view=${view}`} className="panel block p-4">
                <span className="block text-3xl font-semibold tabular">{counts[view]}</span>
                <span className="block font-medium">{COUPON_VIEW_LABELS[view]}</span>
              </Link>
            </li>
          ))}
        </ul>
        {counts.live > 0 && !planActive && (
          <p className="mt-3 text-sm text-signal">Active coupons stay hidden from shoppers until your membership is active.</p>
        )}
      </section>

      <section className="panel mt-6 flex flex-wrap items-center justify-between gap-3 p-5" aria-labelledby="stores-heading">
        <div>
          <h2 id="stores-heading" className="text-xl font-semibold">
            Stores
          </h2>
          <p className="mt-1 tabular">
            {usage ? locationsText(usage) : `${storeCount ?? 0} active ${storeCount === 1 ? "store" : "stores"}`}
          </p>
        </div>
        <Link href="/merchant/locations" className="btn btn-secondary">
          Manage stores
        </Link>
      </section>
    </div>
  );
}
