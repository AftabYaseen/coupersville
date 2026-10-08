import type { Metadata } from "next";
import { Suspense } from "react";
import { requireManagedBusiness } from "@/lib/merchant";
import { loadCouponBuilderData } from "@/lib/merchant-coupons";
import { PageLoading } from "@/components/page-loading";
import { CouponForm } from "@/components/merchant/coupon-form";

export const metadata: Metadata = { title: "Create coupon" };

export default function NewCouponPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewCouponContent />
    </Suspense>
  );
}

async function NewCouponContent() {
  const ctx = await requireManagedBusiness("/merchant/coupons/new");
  const { business } = ctx;
  const data = await loadCouponBuilderData(ctx);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="wordmark mb-8 text-4xl text-ink">Create a coupon</h1>
      <CouponForm
        couponId={null}
        status={null}
        businessId={business.id}
        businessName={business.name}
        timeZone={business.timezone}
        today={data.today}
        planActive={data.planActive}
        categories={data.categories}
        locations={data.locations}
        defaults={{
          title: "",
          description: "",
          categoryId: business.primary_category_id ?? "",
          discountType: "percent",
          discountValue: "",
          includedProducts: "",
          limitsText: "",
          minSpend: "",
          minQty: "",
          maxPeople: "",
          startsOn: data.today,
          expiresOn: "",
          imagePath: null,
          allLocations: true,
          locationIds: [],
          perUserLimit: 1,
          totalLimit: "",
        }}
      />
    </div>
  );
}
