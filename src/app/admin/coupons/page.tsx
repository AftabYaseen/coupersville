import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Search, Star } from "lucide-react";
import { z } from "zod";
import { requireAdminPage } from "@/lib/admin";
import { subscriptionIsActive } from "@/lib/merchant";
import { COUPON_VIEWS, COUPON_VIEW_STATUS, couponView, type CouponView } from "@/lib/coupons";
import { formatDay } from "@/lib/dates";
import { formatOffer } from "@/components/ticket";
import { PageLoading } from "@/components/page-loading";
import { ActionButton } from "@/components/admin/action-button";
import { releaseCouponHold, setCouponFeatured } from "@/app/admin/coupons/actions";
import { HoldCouponButton } from "@/components/admin/hold-coupon-button";

export const metadata: Metadata = { title: "All coupons" };

const PAGE_SIZE = 50;

const querySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  business: z.uuid().optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
  view: z.enum(COUPON_VIEWS).optional().catch(undefined),
  featured: z.literal("1").optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

const VIEW_LABELS: Record<CouponView, string> = { ...COUPON_VIEW_STATUS };

export default function AdminCouponsPage({ searchParams }: PageProps<"/admin/coupons">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <CouponsContent searchParams={searchParams} />
    </Suspense>
  );
}

function clockNow() {
  return Date.now();
}

function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function CouponsContent({ searchParams }: { searchParams: PageProps<"/admin/coupons">["searchParams"] }) {
  const { supabase } = await requireAdminPage("/admin/coupons");
  const raw = await searchParams;
  const one = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);
  const f = querySchema.parse({
    q: one(raw.q),
    business: one(raw.business),
    category: one(raw.category),
    view: one(raw.view),
    featured: one(raw.featured),
    page: one(raw.page) ?? 1,
  });

  const now = clockNow();
  const nowIso = new Date(now).toISOString();
  let query = supabase
    .from("coupons")
    .select(
      "id, title, status, starts_at, expires_at, discount_type, discount_value, featured, total_limit, admin_hold, hold_reason, held_at, business_id, businesses(name, status, timezone, subscriptions(status, current_period_end, source)), categories(name, active)",
      { count: "exact" },
    );
  if (f.q) query = query.ilike("title", `%${escapeLike(f.q)}%`);
  if (f.business) query = query.eq("business_id", f.business);
  if (f.category) query = query.eq("category_id", f.category);
  if (f.featured) query = query.eq("featured", true);
  // The same rules as couponView, written as filters so paging stays correct. A hold outranks the rest.
  if (f.view === "removed") query = query.eq("admin_hold", true);
  else if (f.view) query = query.eq("admin_hold", false);
  if (f.view === "draft") query = query.eq("status", "draft");
  if (f.view === "expired") query = query.neq("status", "draft").lte("expires_at", nowIso);
  if (f.view === "paused") query = query.eq("status", "paused").gt("expires_at", nowIso);
  if (f.view === "scheduled") query = query.eq("status", "published").gt("starts_at", nowIso).gt("expires_at", nowIso);
  if (f.view === "live") query = query.eq("status", "published").lte("starts_at", nowIso).gt("expires_at", nowIso);

  const from = (f.page - 1) * PAGE_SIZE;
  const [{ data: coupons, count }, { data: businesses }, { data: categories }] = await Promise.all([
    query.order("updated_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
    supabase.from("businesses").select("id, name").order("name"),
    supabase.from("categories").select("id, name, active").order("sort_order"),
  ]);
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (page: number) => {
    const p = new URLSearchParams();
    for (const key of ["q", "business", "category", "view", "featured"] as const) if (f[key]) p.set(key, String(f[key]));
    if (page > 1) p.set("page", String(page));
    return `/admin/coupons?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink">All coupons</h1>

      <form action="/admin/coupons" className="panel mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3" role="search">
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="coupon-q" className="field-label">
            Title
          </label>
          <input id="coupon-q" name="q" defaultValue={f.q} className="field-input" />
        </div>
        <div>
          <label htmlFor="coupon-business" className="field-label">
            Business
          </label>
          <select id="coupon-business" name="business" defaultValue={f.business ?? ""} className="field-input">
            <option value="">All businesses</option>
            {(businesses ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="coupon-category" className="field-label">
            Category
          </label>
          <select id="coupon-category" name="category" defaultValue={f.category ?? ""} className="field-input">
            <option value="">All categories</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="coupon-view" className="field-label">
            Status
          </label>
          <select id="coupon-view" name="view" defaultValue={f.view ?? ""} className="field-input">
            <option value="">Any status</option>
            {COUPON_VIEWS.map((v) => (
              <option key={v} value={v}>
                {VIEW_LABELS[v]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-11 items-center gap-2 font-medium">
          <input type="checkbox" name="featured" value="1" defaultChecked={Boolean(f.featured)} className="size-5 accent-ink" />
          Featured only
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-2 lg:justify-end">
          <Link href="/admin/coupons" className="btn btn-secondary">
            Clear filters
          </Link>
          <button type="submit" className="btn">
            <Search aria-hidden size={18} strokeWidth={1.5} />
            Show coupons
          </button>
        </div>
      </form>

      <p className="mt-4 text-sm tabular" role="status">
        {total} {total === 1 ? "coupon" : "coupons"}
        {pages > 1 ? `, page ${f.page} of ${pages}` : ""}
      </p>

      {!coupons?.length ? (
        <p className="panel mt-3 p-5">No coupons match these filters.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {coupons.map((c) => {
            const view = couponView(c, now);
            const biz = c.businesses;
            const plan = biz?.subscriptions ?? null;
            const hidden =
              view !== "live"
                ? null
                : biz?.status !== "active"
                  ? "Hidden: business suspended"
                  : !subscriptionIsActive(plan as Parameters<typeof subscriptionIsActive>[0], now)
                    ? "Hidden: no active plan"
                    : c.categories && !c.categories.active
                      ? "Hidden: category inactive"
                      : null;
            const tz = biz?.timezone ?? "UTC";
            return (
              <li key={c.id} className="panel grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-start">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="offer-text bg-marigold px-1.5 pt-1 pb-0.5 text-xl tabular">
                      {formatOffer(c.discount_type, Number(c.discount_value))}
                    </span>
                    <span className="font-semibold">{c.title}</span>
                    {c.featured && (
                      <span className="inline-flex items-center gap-1 text-sm font-medium">
                        <Star aria-hidden size={16} strokeWidth={1.5} className="text-ink" />
                        Featured
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm">
                    <Link href={`/admin/merchants/${c.business_id}`} className="font-medium text-ink underline underline-offset-4">
                      {biz?.name ?? "Unknown business"}
                    </Link>
                    {c.categories ? `, ${c.categories.name}` : ""}
                  </p>
                  <p className="text-sm tabular">
                    {COUPON_VIEW_STATUS[view]}, {formatDay(c.starts_at, tz)} to {formatDay(c.expires_at, tz)}
                  </p>
                  {hidden && <p className="text-sm font-semibold text-signal">{hidden}</p>}
                  {c.admin_hold && (
                    <p className="text-sm text-signal">
                      <span className="font-semibold">Unpublished by Coupersville</span>
                      {c.held_at ? ` on ${formatDay(c.held_at, tz)}` : ""}
                      {c.hold_reason ? `: ${c.hold_reason}` : ", no reason given"}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {c.admin_hold ? (
                    <ActionButton
                      action={releaseCouponHold.bind(null, c.id)}
                      confirm={{
                        question: "Release this coupon? The merchant gets control of it back.",
                        yes: "Yes, release",
                        no: "Keep unpublished",
                      }}
                    >
                      Release hold
                    </ActionButton>
                  ) : (
                    c.status !== "draft" && view !== "expired" && <HoldCouponButton couponId={c.id} />
                  )}
                  <ActionButton action={setCouponFeatured.bind(null, c.id, !c.featured)} showSuccess={false}>
                    {c.featured ? "Remove from featured" : "Feature"}
                  </ActionButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-6 flex justify-between gap-3">
          {f.page > 1 ? (
            <Link href={pageHref(f.page - 1)} className="btn btn-secondary">
              Previous page
            </Link>
          ) : (
            <span />
          )}
          {f.page < pages && (
            <Link href={pageHref(f.page + 1)} className="btn btn-secondary">
              Next page
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
