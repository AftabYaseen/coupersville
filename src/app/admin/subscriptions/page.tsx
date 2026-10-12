import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdminPage } from "@/lib/admin";
import { dayInZone, dayOneYearOn } from "@/lib/dates";
import { planState, planSummary } from "@/lib/billing";
import { stripeCustomerUrl } from "@/lib/stripe";
import { PageLoading } from "@/components/page-loading";
import { PlanBadge, StatusBadge } from "@/components/admin/badges";
import { PlanControls } from "@/components/admin/plan-controls";

export const metadata: Metadata = { title: "Subscriptions" };

const FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active plan" },
  { value: "ending", label: "Ending in 30 days" },
  { value: "none", label: "No plan" },
  { value: "ended", label: "Ended" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

const DAY_MS = 86_400_000;

export default function SubscriptionsPage({ searchParams }: PageProps<"/admin/subscriptions">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <SubscriptionsContent searchParams={searchParams} />
    </Suspense>
  );
}

function clockNow() {
  return Date.now();
}


async function SubscriptionsContent({ searchParams }: { searchParams: PageProps<"/admin/subscriptions">["searchParams"] }) {
  const { supabase } = await requireAdminPage("/admin/subscriptions");
  const { plan: planParam } = await searchParams;
  const filter: Filter = FILTERS.some((f) => f.value === planParam) ? (planParam as Filter) : "all";

  const [{ data }, { data: plans }] = await Promise.all([
    supabase.rpc("admin_list_businesses", {}),
    supabase
      .from("subscriptions")
      .select("business_id, source, status, current_period_end, cancel_at_period_end, past_due_since, stripe_customer_id"),
  ]);
  const planBy = new Map((plans ?? []).map((p) => [p.business_id, p]));
  const now = clockNow();
  const rows = (data ?? []).filter((b) => b.status !== "draft");
  const endsSoon = (b: (typeof rows)[number]) =>
    b.plan_active && b.plan_ends_at !== null && new Date(b.plan_ends_at).getTime() - now <= 30 * DAY_MS;
  const visible = rows.filter((b) => {
    if (filter === "active") return b.plan_active;
    if (filter === "ending") return endsSoon(b);
    if (filter === "none") return !b.plan_source;
    if (filter === "ended") return Boolean(b.plan_source) && !b.plan_active;
    return true;
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink">Subscriptions</h1>
      <p className="mt-2">
        Grant, extend or revoke complimentary plans. Paid plans are read-only here and managed in Stripe. Businesses still setting up are not listed.
      </p>

      <nav aria-label="Plan filter" className="mt-6 overflow-x-auto">
        <ul className="flex gap-2">
          {FILTERS.map((f) => (
            <li key={f.value}>
              <Link
                href={f.value === "all" ? "/admin/subscriptions" : `/admin/subscriptions?plan=${f.value}`}
                aria-current={filter === f.value ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-sm border-[1.5px] border-ink px-3 font-medium whitespace-nowrap ${
                  filter === f.value ? "bg-ink text-white" : "bg-white text-ink"
                }`}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {visible.length === 0 ? (
        <p className="panel mt-6 p-5">No businesses match this filter.</p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {visible.map((b) => {
            const today = dayInZone(now, b.timezone);
            const currentEnd = b.plan_ends_at ? dayInZone(b.plan_ends_at, b.timezone) : null;
            const row = planBy.get(b.id) ?? null;
            const plan = planState(row, now);
            const customer = row?.stripe_customer_id ?? null;
            return (
              <li key={b.id} className="panel grid gap-4 p-4 md:grid-cols-[1fr_minmax(0,22rem)]">
                <div className="min-w-0">
                  <Link href={`/admin/merchants/${b.id}`} className="font-semibold text-ink underline underline-offset-4">
                    {b.name}
                  </Link>
                  <p className="mt-1 flex flex-wrap gap-2">
                    <StatusBadge status={b.status} />
                    <PlanBadge source={b.plan_source} active={b.plan_active} />
                  </p>
                  <p className={`mt-2 text-sm tabular ${endsSoon(b) || plan.kind === "past_due" ? "font-semibold text-signal" : ""}`}>
                    {planSummary(plan, b.timezone)}
                  </p>
                  <p className="text-sm break-all">{b.owner_email}</p>
                </div>
                <PlanControls
                  compact
                  businessId={b.id}
                  businessName={b.name}
                  source={b.plan_source}
                  active={b.plan_active}
                  hasEndDate={Boolean(b.plan_ends_at)}
                  today={today}
                  suggestedEnd={b.plan_active ? (currentEnd ?? "") : dayOneYearOn(today)}
                  stripeUrl={customer ? stripeCustomerUrl(customer) : null}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
