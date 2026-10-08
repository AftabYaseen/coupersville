import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
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
    if (memberships.length === 0 && user.role === "merchant") redirect("/merchant/onboarding");
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="wordmark text-4xl text-ink">Merchant portal</h1>
        <p className="panel mt-6 p-5">
          {memberships.length > 0
            ? "You are on the team for " + memberships[0].businessName + ". The store scanner will open here soon."
            : "You do not manage a business on Coupersville."}
        </p>
      </div>
    );
  }
  if (managed.businessStatus === "draft") redirect("/merchant/onboarding");

  const supabase = await createClient();
  const [{ data: business }, { data: subscription }, { data: coupons }, { count: storeCount }] = await Promise.all([
    supabase.from("businesses").select("name, status, timezone").eq("id", managed.businessId).single(),
    supabase.from("subscriptions").select("*").eq("business_id", managed.businessId).maybeSingle(),
    supabase.from("coupons").select("status, starts_at, expires_at").eq("business_id", managed.businessId),
    supabase
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("business_id", managed.businessId)
      .eq("active", true),
  ]);
  if (!business) redirect("/merchant/onboarding");

  const { counts, planActive } = summarise(coupons ?? [], subscription);

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
