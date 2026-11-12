import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireManagedBusiness } from "@/lib/merchant";
import { loadCouponBuilderData } from "@/lib/merchant-coupons";
import { COUPON_VIEW_STATUS, REMOVED_LABEL, couponView } from "@/lib/coupons";
import { dayInZone, formatDay } from "@/lib/dates";
import { couponRuleDefaults } from "@/lib/validation/merchant";
import { PageLoading } from "@/components/page-loading";
import { CouponForm } from "@/components/merchant/coupon-form";
import { CouponStatusActions } from "@/components/merchant/coupon-status-actions";
import { CampaignUsage } from "@/components/merchant/usage";
import { CopyLink } from "@/components/merchant/copy-link";
import { FormMessage } from "@/components/field";
import { LockKeyhole } from "lucide-react";
import { PRIVATE_OFFER_LABEL, privateOfferPath } from "@/lib/just-for-you";
import { absoluteUrl } from "@/lib/site";
import { parseStats } from "@/lib/redemption-stats";

export const metadata: Metadata = { title: "Edit coupon" };

export default function EditCouponPage({ params, searchParams }: PageProps<"/merchant/coupons/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditCouponContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function currentView(coupon: Parameters<typeof couponView>[0]) {
  return couponView(coupon, Date.now());
}

async function EditCouponContent({
  params,
  searchParams,
}: {
  params: PageProps<"/merchant/coupons/[id]">["params"];
  searchParams: PageProps<"/merchant/coupons/[id]">["searchParams"];
}) {
  const [{ id }, { published }] = await Promise.all([params, searchParams]);
  const ctx = await requireManagedBusiness(`/merchant/coupons/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const { business, supabase } = ctx;

  const [{ data: coupon }, { data: chosen }, data, { data: stats }] = await Promise.all([
    supabase.from("coupons").select("*").eq("id", id).eq("business_id", business.id).maybeSingle(),
    supabase.from("coupon_locations").select("location_id").eq("coupon_id", id),
    loadCouponBuilderData(ctx),
    supabase.rpc("business_redemption_stats", { p_business_id: business.id }),
  ]);
  if (!coupon) notFound();
  const redeemedCount = parseStats(stats).byCoupon[coupon.id] ?? 0;

  const tz = business.timezone;
  const view = currentView(coupon);
  const num = (v: number | null) => (v === null ? "" : v);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="wordmark text-4xl text-ink">Edit coupon</h1>
          <p className="mt-1 font-medium">Status: {COUPON_VIEW_STATUS[view]}</p>
          {view === "paused" && <p className="mt-1">This coupon is paused and is not visible to shoppers.</p>}
          {view === "expired" && (
            <p className="mt-1">This coupon ended on {formatDay(coupon.expires_at, tz)} and can no longer be redeemed.</p>
          )}
          <CampaignUsage usage={data.usage} className="mt-2" />
        </div>
        <CouponStatusActions
          couponId={coupon.id}
          status={coupon.status}
          ended={view === "expired"}
          held={coupon.admin_hold}
        />
      </div>
      {coupon.visibility === "private" && (
        <section className="panel mb-8 grid gap-3 p-5" aria-labelledby="private-link-heading">
          {published === "1" && <FormMessage tone="success">Your {PRIVATE_OFFER_LABEL} is published.</FormMessage>}
          <h2 id="private-link-heading" className="flex items-center gap-2 text-xl font-semibold">
            <LockKeyhole aria-hidden size={20} strokeWidth={1.5} className="text-ink" />
            {PRIVATE_OFFER_LABEL}
          </h2>
          {coupon.status === "draft" || !coupon.private_key ? (
            <p>The private link appears here after you publish. This offer never appears on Coupersville.</p>
          ) : (
            <>
              <p>
                Send this link to your customer yourself; Coupersville sends no email. Anyone with the link can open the offer, and
                it can be redeemed once in total. {redeemedCount > 0 ? "It has been redeemed, so the link now says it has been used." : ""}
              </p>
              <CopyLink url={absoluteUrl(privateOfferPath(coupon.private_key))} />
            </>
          )}
        </section>
      )}
      {coupon.admin_hold && (
        <div role="note" className="mb-8 rounded-sm border-[1.5px] border-signal bg-white p-4">
          <p className="font-semibold text-signal">{REMOVED_LABEL}</p>
          <p className="mt-1">{coupon.hold_reason ? `Reason: ${coupon.hold_reason}` : "No reason was given."}</p>
          <p className="mt-2 text-sm">
            Shoppers cannot see or redeem this coupon, and it cannot be published again. You can still edit or delete
            it. Contact Coupersville support if you think this is a mistake.
          </p>
        </div>
      )}
      <CouponForm
        couponId={coupon.id}
        status={coupon.status}
        businessId={business.id}
        businessName={business.name}
        timeZone={tz}
        today={data.today}
        planActive={data.planActive}
        held={coupon.admin_hold}
        categories={data.categories}
        locations={data.locations}
        defaults={{
          title: coupon.title,
          description: coupon.description ?? "",
          categoryId: coupon.category_id,
          discountType: coupon.discount_type,
          discountValue: coupon.discount_value === null ? "" : Number(coupon.discount_value),
          includedProducts: coupon.included_products ?? "",
          limitsText: coupon.limits_text ?? "",
          exclusions: coupon.exclusions ?? "",
          minSpend: coupon.min_spend === null ? "" : Number(coupon.min_spend),
          minQty: num(coupon.min_qty),
          maxPeople: num(coupon.max_people),
          startsOn: dayInZone(coupon.starts_at, tz),
          expiresOn: dayInZone(coupon.expires_at, tz),
          imagePath: coupon.image_path,
          allLocations: coupon.all_locations,
          locationIds: (chosen ?? []).map((c) => c.location_id),
          totalLimit: num(coupon.total_limit),
          visibility: coupon.visibility,
          ...couponRuleDefaults(coupon),
        }}
        visibilityLocked={coupon.status !== "draft"}
      />
    </div>
  );
}
