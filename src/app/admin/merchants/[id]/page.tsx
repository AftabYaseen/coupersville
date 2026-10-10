import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requireAdminPage } from "@/lib/admin";
import { subscriptionIsActive } from "@/lib/merchant";
import { COUPON_VIEW_STATUS, couponView } from "@/lib/coupons";
import { dayInZone, dayOneYearOn, formatDay } from "@/lib/dates";
import { formatOffer } from "@/components/ticket";
import { PageLoading } from "@/components/page-loading";
import { ActionButton } from "@/components/admin/action-button";
import { PlanBadge, StatusBadge } from "@/components/admin/badges";
import { PlanControls } from "@/components/admin/plan-controls";
import { setBusinessStatus } from "@/app/admin/merchants/actions";

export const metadata: Metadata = { title: "Business" };

export default function AdminBusinessPage({ params }: PageProps<"/admin/merchants/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <BusinessContent params={params} />
    </Suspense>
  );
}

function clockNow() {
  return Date.now();
}


async function BusinessContent({ params }: { params: PageProps<"/admin/merchants/[id]">["params"] }) {
  const { id } = await params;
  const { supabase } = await requireAdminPage(`/admin/merchants/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();

  const [{ data: business }, { data: plan }, { data: stores }, { data: coupons }, { data: team }, { count: redemptions }] =
    await Promise.all([
      supabase.from("businesses").select("*, categories(name)").eq("id", id).maybeSingle(),
      supabase.from("subscriptions").select("*").eq("business_id", id).maybeSingle(),
      supabase
        .from("locations")
        .select("id, store_name, store_number, address_line1, city, state, postal_code, active")
        .eq("business_id", id)
        .order("active", { ascending: false })
        .order("store_name"),
      supabase
        .from("coupons")
        .select("id, title, status, starts_at, expires_at, discount_type, discount_value, featured, admin_hold")
        .eq("business_id", id)
        .order("updated_at", { ascending: false }),
      supabase.rpc("business_team", { p_business_id: id }),
      supabase.from("redemptions").select("id", { count: "exact", head: true }).eq("business_id", id),
    ]);
  if (!business) notFound();

  const now = clockNow();
  const tz = business.timezone;
  const planActive = subscriptionIsActive(plan, now);
  const today = dayInZone(now, tz);
  const currentEnd = plan?.current_period_end ? dayInZone(plan.current_period_end, tz) : null;
  const owner = (team ?? []).find((m) => m.role === "owner");

  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-4 py-10">
      <Link href="/admin/merchants" className="inline-flex min-h-11 items-center gap-2 justify-self-start font-medium text-ink">
        <ArrowLeft aria-hidden size={18} strokeWidth={1.5} />
        All merchants
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="wordmark text-4xl text-ink">{business.name}</h1>
          <p className="mt-2 flex flex-wrap gap-2">
            <StatusBadge status={business.status} />
            <PlanBadge source={plan?.source ?? null} active={planActive} />
          </p>
        </div>
        {business.status === "active" || business.status === "draft" ? (
          <ActionButton
            action={setBusinessStatus.bind(null, business.id, "suspended")}
            confirm={{
              question: `Suspend ${business.name}? Shoppers stop seeing all of its coupons straight away.`,
              yes: "Yes, suspend",
              no: "Keep active",
            }}
          >
            Suspend business
          </ActionButton>
        ) : (
          <ActionButton action={setBusinessStatus.bind(null, business.id, "active")} variant="primary">
            Reactivate business
          </ActionButton>
        )}
      </div>

      {business.status === "suspended" && (
        <p className="rounded-sm border-[1.5px] border-signal bg-white p-4 text-signal">
          Suspended. None of this business&apos;s coupons are shown to shoppers, and staff cannot redeem them.
        </p>
      )}

      <section className="panel grid gap-2 p-5" aria-labelledby="about-heading">
        <h2 id="about-heading" className="text-xl font-semibold">
          About
        </h2>
        {business.description && <p>{business.description}</p>}
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium">Owner</dt>
            <dd className="break-all">{owner ? `${owner.full_name ?? ""} ${owner.email}`.trim() : "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium">Category</dt>
            <dd>{business.categories?.name ?? "None"}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium">Contact</dt>
            <dd className="break-all">{[business.contact_email, business.contact_phone].filter(Boolean).join(", ") || "None given"}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium">Website</dt>
            <dd className="break-all">{business.website_url ?? "None given"}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium">Timezone</dt>
            <dd>{tz}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium">Joined</dt>
            <dd className="tabular">{formatDay(business.created_at, tz)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium">Redemptions, all time</dt>
            <dd className="tabular">{redemptions ?? 0}</dd>
          </div>
        </dl>
      </section>

      <section id="plan" className="panel grid gap-3 p-5" aria-labelledby="plan-heading">
        <h2 id="plan-heading" className="text-xl font-semibold">
          Plan
        </h2>
        <p>
          {!plan
            ? "No plan. Coupons cannot go live until the business has one."
            : planActive
              ? `${plan.source === "complimentary" ? "Complimentary" : "Paid"} plan, active ${
                  plan.current_period_end ? `until ${formatDay(plan.current_period_end, tz)}` : "with no end date"
                }.`
              : `${plan.source === "complimentary" ? "Complimentary" : "Paid"} plan ended${
                  plan.current_period_end ? ` ${formatDay(plan.current_period_end, tz)}` : ""
                }. Coupons are hidden from shoppers.`}
        </p>
        <PlanControls
          businessId={business.id}
          businessName={business.name}
          source={plan?.source ?? null}
          active={planActive}
          hasEndDate={Boolean(plan?.current_period_end)}
          today={today}
          suggestedEnd={planActive ? (currentEnd ?? "") : dayOneYearOn(today)}
        />
      </section>

      <section aria-labelledby="coupons-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="coupons-heading" className="text-xl font-semibold">
            Coupons
          </h2>
          <Link href={`/admin/coupons?business=${business.id}`} className="btn btn-secondary">
            Manage coupons
          </Link>
        </div>
        {!coupons?.length ? (
          <p className="panel mt-3 p-4">No coupons yet.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {coupons.map((c) => (
              <li key={c.id} className="panel flex flex-wrap items-baseline justify-between gap-2 p-3">
                <span>
                  <span className="font-semibold tabular">{formatOffer(c.discount_type, Number(c.discount_value))}</span>, {c.title}
                  {c.featured && <span className="ml-2 text-sm font-medium">Featured</span>}
                </span>
                <span className="text-sm">{COUPON_VIEW_STATUS[couponView(c, now)]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="stores-heading">
        <h2 id="stores-heading" className="text-xl font-semibold">
          Stores
        </h2>
        {!stores?.length ? (
          <p className="panel mt-3 p-4">No stores yet.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {stores.map((s) => (
              <li key={s.id} className="panel p-3">
                <span className="font-semibold">
                  {s.store_name}
                  {s.store_number && <span className="font-normal tabular"> #{s.store_number}</span>}
                </span>
                {!s.active && <span className="ml-2 text-sm font-medium text-signal">Closed</span>}
                <span className="block text-sm">{[s.address_line1, s.city, s.state, s.postal_code].filter(Boolean).join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="team-heading">
        <h2 id="team-heading" className="text-xl font-semibold">
          Team
        </h2>
        <ul className="mt-3 grid gap-2">
          {(team ?? []).map((m) => (
            <li key={m.member_id} className="panel flex flex-wrap justify-between gap-2 p-3">
              <span className="break-all">
                {m.full_name ?? m.email}
                <span className="block text-sm">{m.email}</span>
              </span>
              <span className="text-sm font-medium">{m.role === "owner" ? "Owner" : m.role === "manager" ? "Manager" : "Staff"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
