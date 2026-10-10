import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Search } from "lucide-react";
import { z } from "zod";
import { requireAdminPage } from "@/lib/admin";
import { formatDay } from "@/lib/dates";
import { PageLoading } from "@/components/page-loading";
import { PlanBadge, StatusBadge } from "@/components/admin/badges";

export const metadata: Metadata = { title: "Merchants" };

const STATUSES = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "draft", label: "Setting up" },
] as const;

const querySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(["active", "suspended", "draft"]).optional().catch(undefined),
});

export default function MerchantsPage({ searchParams }: PageProps<"/admin/merchants">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <MerchantsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MerchantsContent({ searchParams }: { searchParams: PageProps<"/admin/merchants">["searchParams"] }) {
  const { supabase } = await requireAdminPage("/admin/merchants");
  const raw = await searchParams;
  const { q, status } = querySchema.parse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
  });
  const { data } = await supabase.rpc("admin_list_businesses", { p_query: q || undefined, p_status: status });
  const rows = data ?? [];

  const href = (s: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (s) p.set("status", s);
    const qs = p.toString();
    return `/admin/merchants${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink">Merchants</h1>

      <form action="/admin/merchants" className="mt-6 flex gap-2" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <label htmlFor="merchant-q" className="sr-only">
          Search by business name or owner email
        </label>
        <input
          id="merchant-q"
          name="q"
          defaultValue={q}
          placeholder="Business name or owner email"
          className="field-input flex-1"
        />
        <button type="submit" className="btn">
          <Search aria-hidden size={18} strokeWidth={1.5} />
          Search
        </button>
      </form>

      <nav aria-label="Business status" className="mt-4 overflow-x-auto">
        <ul className="flex gap-2">
          {STATUSES.map((s) => {
            const current = (status ?? "") === s.value;
            return (
              <li key={s.value}>
                <Link
                  href={href(s.value)}
                  aria-current={current ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-sm border-[1.5px] border-ink px-3 font-medium whitespace-nowrap ${
                    current ? "bg-ink text-white" : "bg-white text-ink"
                  }`}
                >
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="mt-4 text-sm tabular" role="status">
        {rows.length === 200 ? "Showing the newest 200. Search to narrow it down." : `${rows.length} ${rows.length === 1 ? "business" : "businesses"}`}
      </p>

      {rows.length === 0 ? (
        <p className="panel mt-3 p-5">{q ? `No businesses match "${q}".` : "No businesses here yet."}</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {rows.map((b) => (
            <li key={b.id}>
              <Link href={`/admin/merchants/${b.id}`} className="panel grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{b.name}</span>
                    <StatusBadge status={b.status} />
                    <PlanBadge source={b.plan_source} active={b.plan_active} />
                  </span>
                  <span className="block text-sm break-all">
                    {b.owner_name ? `${b.owner_name}, ` : ""}
                    {b.owner_email}
                  </span>
                  <span className="block text-sm tabular">
                    Joined {formatDay(b.created_at, b.timezone)}
                    {b.category_name ? `, ${b.category_name}` : ""}
                  </span>
                </span>
                <span className="text-sm tabular sm:text-right">
                  {Number(b.live_coupon_count)} live of {Number(b.coupon_count)} coupons
                  <br />
                  {Number(b.store_count)} {Number(b.store_count) === 1 ? "store" : "stores"}, {Number(b.redemptions_30d)} redeemed in 30 days
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
