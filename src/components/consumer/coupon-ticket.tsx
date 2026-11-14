import Link from "next/link";
import type { ReactNode } from "react";
import { Ticket, formatOffer } from "@/components/ticket";
import type { LiveCoupon } from "@/lib/consumer";

export function CouponTicketLink({ coupon }: { coupon: LiveCoupon }) {
  return (
    <Link href={`/coupon/${coupon.id}`} className="card-lift block rounded-lg" aria-label={`${coupon.title} from ${coupon.businessName}`}>
      <Ticket
        tint={coupon.tint}
        merchant={`From ${coupon.businessName}`}
        offer={formatOffer(coupon.discountType, coupon.discountValue)}
        title={coupon.title}
        expiresAt={coupon.expiresAt}
        expiringSoon={coupon.expiringSoon}
        timeZone={coupon.timeZone}
        limits={coupon.limits || undefined}
        store={coupon.storeText}
        stubActions={<span className="font-semibold text-primary underline underline-offset-4">View deal</span>}
      />
    </Link>
  );
}

export function CouponGrid({ coupons }: { coupons: LiveCoupon[] }) {
  return (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {coupons.map((c) => (
        <li key={c.id}>
          <CouponTicketLink coupon={c} />
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel p-5 sm:p-6">
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 grid gap-4">{children}</div>}
    </div>
  );
}
