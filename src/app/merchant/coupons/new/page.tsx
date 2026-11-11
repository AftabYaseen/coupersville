import type { Metadata } from "next";
import { Suspense } from "react";
import { requireManagedBusiness } from "@/lib/merchant";
import { loadCouponBuilderData } from "@/lib/merchant-coupons";
import { PageLoading } from "@/components/page-loading";
import { CouponForm } from "@/components/merchant/coupon-form";
import { CampaignUsage } from "@/components/merchant/usage";

export const metadata: Metadata = { title: "Create a new offer" };

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
      <h1 className="wordmark text-4xl text-ink">Create a new offer</h1>
      <p className="mt-2 max-w-2xl">Build a clear, compelling coupon that customers can understand and your staff can apply consistently.</p>
      <CampaignUsage usage={data.usage} className="mt-2 mb-8" />
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
          exclusions: "",
          minSpend: "",
          minQty: "",
          maxPeople: "",
          startsOn: data.today,
          expiresOn: "",
          imagePath: null,
          allLocations: true,
          locationIds: [],
          totalLimit: "",
          perUserMode: "once",
          perUserLimit: "",
          redeemFrequency: "none",
          scheduleOn: false,
          scheduleDays: [1, 2, 3, 4, 5, 6, 7],
          scheduleStart: "",
          scheduleEnd: "",
        }}
      />
    </div>
  );
}
