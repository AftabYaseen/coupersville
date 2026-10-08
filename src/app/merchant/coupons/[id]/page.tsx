import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireManagedBusiness } from "@/lib/merchant";
import { loadCouponBuilderData } from "@/lib/merchant-coupons";
import { COUPON_VIEW_STATUS, couponView } from "@/lib/coupons";
import { dayInZone } from "@/lib/dates";
import { PageLoading } from "@/components/page-loading";
import { CouponForm } from "@/components/merchant/coupon-form";
import { CouponStatusActions } from "@/components/merchant/coupon-status-actions";

export const metadata: Metadata = { title: "Edit coupon" };

export default function EditCouponPage({ params }: PageProps<"/merchant/coupons/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditCouponContent params={params} />
    </Suspense>
  );
}

function currentView(coupon: Parameters<typeof couponView>[0]) {
  return couponView(coupon, Date.now());
}

async function EditCouponContent({ params }: { params: PageProps<"/merchant/coupons/[id]">["params"] }) {
  const { id } = await params;
  const ctx = await requireManagedBusiness(`/merchant/coupons/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const { business, supabase } = ctx;

  const [{ data: coupon }, { data: chosen }, data] = await Promise.all([
    supabase.from("coupons").select("*").eq("id", id).eq("business_id", business.id).maybeSingle(),
    supabase.from("coupon_locations").select("location_id").eq("coupon_id", id),
    loadCouponBuilderData(ctx),
  ]);
  if (!coupon) notFound();

  const tz = business.timezone;
  const view = currentView(coupon);
  const num = (v: number | null) => (v === null ? "" : v);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="wordmark text-4xl text-ink">Edit coupon</h1>
          <p className="mt-1 font-medium">Status: {COUPON_VIEW_STATUS[view]}</p>
        </div>
        <CouponStatusActions couponId={coupon.id} status={coupon.status} ended={view === "expired"} />
      </div>
      <CouponForm
        couponId={coupon.id}
        status={coupon.status}
        businessId={business.id}
        businessName={business.name}
        timeZone={tz}
        today={data.today}
        planActive={data.planActive}
        categories={data.categories}
        locations={data.locations}
        defaults={{
          title: coupon.title,
          description: coupon.description ?? "",
          categoryId: coupon.category_id,
          discountType: coupon.discount_type,
          discountValue: Number(coupon.discount_value),
          includedProducts: coupon.included_products ?? "",
          limitsText: coupon.limits_text ?? "",
          minSpend: coupon.min_spend === null ? "" : Number(coupon.min_spend),
          minQty: num(coupon.min_qty),
          maxPeople: num(coupon.max_people),
          startsOn: dayInZone(coupon.starts_at, tz),
          expiresOn: dayInZone(coupon.expires_at, tz),
          imagePath: coupon.image_path,
          allLocations: coupon.all_locations,
          locationIds: (chosen ?? []).map((c) => c.location_id),
          perUserLimit: coupon.per_user_limit,
          totalLimit: num(coupon.total_limit),
        }}
      />
    </div>
  );
}
