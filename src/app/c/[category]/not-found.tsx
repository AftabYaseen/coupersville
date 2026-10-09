import Link from "next/link";

export default function ShopNotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="wordmark text-3xl text-ink">That shop is not on Main Street</h1>
      <p className="mt-2">It may have moved or closed. Every open shop is listed on the home page.</p>
      <Link href="/#main-street" className="btn mt-6">
        Browse Main Street
      </Link>
    </div>
  );
}
