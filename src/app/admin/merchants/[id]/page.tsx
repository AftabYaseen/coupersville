import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requireAdminPage } from "@/lib/admin";
import { subscriptionIsActive } from "@/lib/merchant";
import { planState, planSummary } from "@/lib/billing";
import { ENTERPRISE_OFFER, FOUNDING_OFFER } from "@/lib/offers";
import { campaignsText, loadUsage, locationsText } from "@/lib/limits";
import { BusinessLimits } from "@/components/admin/business-limits";
import { COUPON_VIEW_STATUS, couponView } from "@/lib/coupons";
import { dayInZone, dayOneYearOn, formatDay } from "@/lib/dates";
import { formatOffer } from "@/components/ticket";
import { PageLoading } from "@/components/page-loading";
import { ActionButton } from "@/components/admin/action-button";
import { PlanBadge, StatusBadge } from "@/components/admin/badges";
import { PlanControls } from "@/components/admin/plan-controls";
import { setBusinessStatus } from "@/app/admin/merchants/actions";
import { DeleteBusiness } from "@/components/admin/delete-business";
import { businessDeletionPlan } from "@/lib/business-deletion";
import { adminTestCheckout } from "@/app/admin/merchants/billing-actions";
import { HostedPageButton } from "@/components/merchant/hosted-page-button";
import { FormMessage } from "@/components/field";
import { anetConfigured, anetIsProduction } from "@/lib/authorize-net";
import { resolveCheckout } from "@/lib/paid-billing";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata: Metadata = { title: "Business" };

export default function AdminBusinessPage({ params, searchParams }: PageProps<"/admin/merchants/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <BusinessContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function clockNow() {
  return Date.now();
}


async function BusinessContent({
  params,
  searchParams,
}: {
  params: PageProps<"/admin/merchants/[id]">["params"];
  searchParams: PageProps<"/admin/merchants/[id]">["searchParams"];
}) {
  const { id } = await params;
  const { checkout, cancelled } = await searchParams;
  const { supabase } = await requireAdminPage(`/admin/merchants/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();

  const [{ data: business }, { data: plan }, { data: stores }, { data: coupons }, { data: team }, { count: redemptions }, { data: override }, usage] =
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
      supabase.from("business_limit_overrides").select("max_locations, campaigns_per_month").eq("business_id", id).maybeSingle(),
      loadUsage(supabase, id),
    ]);
  if (!business) notFound();

  // Back from a test checkout: confirm it the same way a merchant's is confirmed.
  let checkoutResult: string | null = null;
  if (cancelled === "1") {
    checkoutResult = "cancelled";
  } else if (typeof checkout === "string" && z.uuid().safeParse(checkout).success && anetConfigured()) {
    checkoutResult = await resolveCheckout(checkout).catch(() => "retry_later");
    // Authorize.net lists a new payment 10 to 20 seconds late: on a recent checkout, keep confirming.
    if (checkoutResult === "no_payment") {
      const { data: started } = await supabase.from("checkouts").select("created_at").eq("id", checkout).maybeSingle();
      if (started && clockNow() - new Date(started.created_at).getTime() < 20 * 60_000) checkoutResult = "confirming";
    }
    if (checkoutResult === "retry_later" || checkoutResult === "busy") checkoutResult = "confirming";
  }
  const { data: settings } = await supabase.from("platform_settings").select("payments_open").eq("singleton", true).maybeSingle();

  const now = clockNow();
  const tz = business.timezone;
  const planActive = subscriptionIsActive(plan, now);
  const today = dayInZone(now, tz);
  const currentEnd = plan?.current_period_end ? dayInZone(plan.current_period_end, tz) : null;
  const owner = (team ?? []).find((m) => m.role === "owner");
  const deletion = await businessDeletionPlan(business.id).catch(() => null);
  const deletionLines =
    deletion?.mode === "delete"
      ? [
          "Everything is deleted: the business, its stores, coupons, team, staff invites, plan and images.",
          "It has no payments, redemptions or Founding seat, so there is nothing to keep.",
        ]
      : [
          `It has ${deletion?.reasons.join(", ") ?? "records we may need"}, so the business name, store addresses, plan and payment records, any Founding seat, and the coupons that were redeemed are kept, so redemption counts stay right.`,
          "Removed: the description, contact email, phone and website, store phone numbers, images, coupons nobody redeemed, the team and staff invites.",
          "It stays suspended with no owner, hidden from shoppers, and its plan does not renew.",
        ];

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
            <dd className="break-all">{owner ? `${owner.full_name ?? ""} ${owner.email}`.trim() : "Owner deleted their account"}</dd>
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
            : `${plan.offer_code === ENTERPRISE_OFFER ? "Enterprise (Custom). " : ""}${plan.offer_code === FOUNDING_OFFER && plan.source === "complimentary" ? "Founding Merchant, free seat. " : ""}${planSummary(planState(plan, now), tz)}.${planActive ? "" : " Coupons are hidden from shoppers."}`}
        </p>
        <PlanControls
          businessId={business.id}
          businessName={business.name}
          source={plan?.source ?? null}
          active={planActive}
          hasEndDate={Boolean(plan?.current_period_end)}
          today={today}
          suggestedEnd={planActive ? (currentEnd ?? "") : dayOneYearOn(today)}        />
      </section>

      <section className="panel grid gap-3 p-5" aria-labelledby="limits-heading">
        <h2 id="limits-heading" className="text-xl font-semibold">
          Limits
        </h2>
        {usage && (
          <p className="tabular">
            {locationsText(usage)}. {campaignsText(usage)}.
          </p>
        )}
        <BusinessLimits
          businessId={business.id}
          maxLocations={override?.max_locations?.toString() ?? ""}
          campaignsPerMonth={override?.campaigns_per_month?.toString() ?? ""}
          canGrantEnterprise={!(plan && plan.source !== "complimentary" && planActive) && !(planActive && plan?.offer_code === ENTERPRISE_OFFER)}
          today={today}
        />
      </section>

      {anetConfigured() && (
        <section className="panel grid gap-3 p-5" aria-labelledby="test-checkout-heading">
          <h2 id="test-checkout-heading" className="text-xl font-semibold">
            Test checkout
          </h2>
          <p>
            Buys the $1.00 admin payment test for this business on Authorize.net&apos;s payment page
            {anetIsProduction() ? ", with a real card and real money." : " (sandbox: use a test card, nothing is charged)."} Merchants
            never see this offer, and it claims no Founding seat. Use it on a test business only.
            {settings?.payments_open ? " Payments are open to merchants." : " Payments are closed to merchants."}
          </p>
          {checkoutResult && (
            <FormMessage tone={checkoutResult === "captured" || checkoutResult === "confirming" ? "success" : "error"}>
              Checkout result: {checkoutResult === "confirming" ? "confirming the payment, this page updates on its own" : checkoutResult.replace(/_/g, " ")}.
            </FormMessage>
          )}
          {checkoutResult === "confirming" && <AutoRefresh seconds={5} />}
          <HostedPageButton
            label="Test checkout ($1.00)"
            pendingLabel="Opening the payment page"
            start={adminTestCheckout.bind(null, business.id)}
            variant="secondary"
          />
        </section>
      )}

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
        {!team?.length && <p className="panel mt-3 p-5">Nobody is on this team. The owner may have deleted their account.</p>}
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

      <section className="grid gap-3" aria-labelledby="delete-heading">
        <h2 id="delete-heading" className="text-xl font-semibold">
          Delete business
        </h2>
        <p>For a deletion request from the business. Suspending is enough to hide it from shoppers.</p>
        <DeleteBusiness businessId={business.id} name={business.name} consequences={deletionLines} />
      </section>
    </div>
  );
}
