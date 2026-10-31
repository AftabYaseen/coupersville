import type { ReactNode } from "react";
import Link from "next/link";
import { formatDay } from "@/lib/dates";
import { PAST_DUE_GRACE_DAYS, type PlanState } from "@/lib/billing";

type Props = {
  state: PlanState;
  timeZone: string;
  // The plan is a free Founding Merchant seat.
  foundingSeat?: boolean;
  // On the dashboard, plans that need attention link to Billing.
  billingLink?: boolean;
};

const day = (iso: string | null, tz: string) => (iso ? formatDay(iso, tz) : null);

const SUPPORT = "To change or cancel it, contact Coupersville support.";

// The plan in plain words. Payments are not open yet, so there are no payment buttons.
export function PlanPanel({ state, timeZone: tz, foundingSeat, billingLink }: Props) {
  const link = billingLink ? (
    <Link href="/merchant/billing" className="btn btn-secondary w-fit">
      See billing
    </Link>
  ) : null;

  switch (state.kind) {
    case "none":
      return (
        <Panel title="No plan yet" tone="warn">
          <p>Your coupons cannot go live until you have a plan. You can build them and save drafts now.</p>
          {link}
        </Panel>
      );
    case "complimentary":
      return (
        <Panel title={foundingSeat ? "Founding Merchant, free seat" : "Complimentary plan"}>
          <p>
            {foundingSeat ? "Your first 12 months are free" : "Coupersville gave you a free plan"},{" "}
            active {state.endsAt ? `until ${day(state.endsAt, tz)}` : "with no end date"}. Your coupons are live for shoppers.
          </p>
        </Panel>
      );
    case "active":
      return (
        <Panel title="Annual plan, active">
          <p>
            {state.renewsAt ? `Renews on ${day(state.renewsAt, tz)}.` : "Active."} Your coupons are live for shoppers. {SUPPORT}
          </p>
        </Panel>
      );
    case "cancelling":
      return (
        <Panel title="Annual plan, cancelled" tone="warn">
          <p>
            It stays active until {day(state.endsAt, tz) ?? "the end of this period"}, then your coupons are hidden from
            shoppers. To keep it, contact Coupersville support.
          </p>
        </Panel>
      );
    case "past_due":
      return (
        <Panel title="Payment failed" tone="alert">
          <p>
            We could not take the payment for your plan. Your coupons stay live until {day(state.graceEndsAt, tz)}. Contact
            Coupersville support before then to keep them live.
          </p>
        </Panel>
      );
    case "expired":
      return (
        <Panel title={state.source === "complimentary" ? "Complimentary plan ended" : "Plan ended"} tone="alert">
          <p>
            {state.paymentFailed
              ? `Your payment failed and the ${PAST_DUE_GRACE_DAYS}-day grace period ended${state.endedAt ? ` on ${day(state.endedAt, tz)}` : ""}. `
              : `Your plan ended${state.endedAt ? ` on ${day(state.endedAt, tz)}` : ""}. `}
            Your coupons are hidden from shoppers until you have a plan again.
          </p>
          {link}
        </Panel>
      );
  }
}

function Panel({ title, tone, children }: { title: string; tone?: "warn" | "alert"; children: ReactNode }) {
  const border = tone === "alert" ? "border-signal" : "border-ink";
  return (
    <section className={`grid gap-4 rounded-sm border-[1.5px] bg-white p-5 ${border}`} aria-labelledby="plan-state-heading">
      <h2 id="plan-state-heading" className={`text-xl font-semibold ${tone === "alert" ? "text-signal" : ""}`}>
        {title}
      </h2>
      {children}
    </section>
  );
}
