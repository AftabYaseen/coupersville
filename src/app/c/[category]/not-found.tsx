import Link from "next/link";

export default function CategoryNotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="wordmark text-3xl text-primary">That category is not in Coupersville</h1>
      <p className="mt-2">It may have moved or closed. Every category is listed on the Explore page.</p>
      <Link href="/explore" className="btn mt-6">
        Browse categories
      </Link>
    </div>
  );
}
