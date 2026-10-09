import Link from "next/link";

export default function CouponNotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="wordmark text-3xl text-ink">This coupon is not available</h1>
      <p className="mt-2">It may have ended, or the shop may have taken it down. There are plenty more on Main Street.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/search" className="btn">
          Search coupons
        </Link>
        <Link href="/#main-street" className="btn btn-secondary">
          Browse Main Street
        </Link>
      </div>
    </div>
  );
}
