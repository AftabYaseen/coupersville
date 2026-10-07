import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { PageLoading } from "@/components/page-loading";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AdminHome />
    </Suspense>
  );
}

async function AdminHome() {
  const user = await requireAdmin("/admin");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink">Town hall</h1>
      <p className="mt-2">Signed in as {user.fullName ?? user.email}.</p>
      <section className="panel mt-8 p-5">
        <h2 className="text-xl font-semibold">Platform admin</h2>
        <p className="mt-2">Merchants, coupons, categories, subscriptions, and stats open in a later build phase.</p>
      </section>
    </div>
  );
}
