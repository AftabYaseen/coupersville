import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/admin";
import { platformStatsSchema } from "@/lib/admin-stats";
import { PageLoading } from "@/components/page-loading";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <AdminHome />
    </Suspense>
  );
}

function Tile({ label, value, href, note }: { label: string; value: number; href?: string; note?: string }) {
  const body = (
    <>
      <span className="block font-medium">{label}</span>
      <span className="block text-3xl font-semibold tabular">{value}</span>
      {note && <span className="block text-sm tabular">{note}</span>}
    </>
  );
  return href ? (
    <Link href={href} className="panel block p-4">
      {body}
    </Link>
  ) : (
    <div className="panel p-4">{body}</div>
  );
}

async function AdminHome() {
  const { user, supabase } = await requireAdminPage("/admin");
  const { data } = await supabase.rpc("admin_platform_stats");
  const parsed = platformStatsSchema.safeParse(data);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink">Town hall</h1>
      <p className="mt-2">Signed in as {user.fullName ?? user.email}.</p>

      {!parsed.success ? (
        <p className="panel mt-8 p-5">The numbers could not load right now. Refresh the page to try again.</p>
      ) : (
        <>
          <section className="mt-8" aria-labelledby="town-heading">
            <h2 id="town-heading" className="text-xl font-semibold">
              Around town
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile
                label="Active businesses"
                value={parsed.data.businesses_active}
                href="/admin/merchants?status=active"
                note={`${parsed.data.businesses_suspended} suspended, ${parsed.data.businesses_draft} setting up`}
              />
              <Tile label="Live coupons" value={parsed.data.live_coupons} href="/admin/coupons?view=live" />
              <Tile label="Shoppers" value={parsed.data.shoppers} />
            </div>
          </section>

          <section className="mt-8" aria-labelledby="redemptions-heading">
            <h2 id="redemptions-heading" className="text-xl font-semibold">
              Redemptions
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Tile label="Last 7 days" value={parsed.data.redemptions_7d} />
              <Tile label="Last 30 days" value={parsed.data.redemptions_30d} />
              <Tile label="All time" value={parsed.data.redemptions_total} />
            </div>
          </section>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <TopList
              id="top-coupons"
              title="Top coupons, last 30 days"
              empty="No coupons redeemed in the last 30 days."
              rows={parsed.data.top_coupons.map((c) => ({
                key: c.id,
                href: `/admin/coupons?q=${encodeURIComponent(c.title)}`,
                primary: c.title,
                secondary: c.business_name,
                count: c.redemptions,
              }))}
            />
            <TopList
              id="top-businesses"
              title="Top businesses, last 30 days"
              empty="No businesses had redemptions in the last 30 days."
              rows={parsed.data.top_businesses.map((b) => ({
                key: b.id,
                href: `/admin/merchants/${b.id}`,
                primary: b.name,
                count: b.redemptions,
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}

function TopList({
  id,
  title,
  empty,
  rows,
}: {
  id: string;
  title: string;
  empty: string;
  rows: { key: string; href: string; primary: string; secondary?: string; count: number }[];
}) {
  return (
    <section className="panel p-5" aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2">{empty}</p>
      ) : (
        <ol className="mt-3 grid gap-2">
          {rows.map((r) => (
            <li key={r.key} className="flex items-baseline justify-between gap-3">
              <Link href={r.href} className="min-w-0 font-medium text-ink underline underline-offset-4">
                {r.primary}
                {r.secondary && <span className="block text-sm font-normal text-ink-deep no-underline">{r.secondary}</span>}
              </Link>
              <span className="tabular">{r.count}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
