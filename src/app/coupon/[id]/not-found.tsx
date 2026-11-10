import Link from "next/link";

export default function CouponNotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="wordmark text-3xl text-ink">This deal is not available</h1>
      <p className="mt-2">The business may have paused it or taken it down. Explore Coupersville to discover something new.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/search" className="btn">
          Find another deal
        </Link>
        <Link href="/explore" className="btn btn-secondary">
          Browse categories
        </Link>
      </div>
    </div>
  );
}
