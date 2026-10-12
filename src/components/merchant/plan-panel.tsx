import type { ReactNode } from "react";
import { formatDay } from "@/lib/dates";
import { PAST_DUE_GRACE_DAYS, type PlanState } from "@/lib/billing";
import { ManageBillingButton, StartPlanButton } from "@/components/merchant/billing-buttons";

type Props = {
  state: PlanState;
  timeZone: string;
  hasBillingAccount: boolean;
  priceLabel: string | null;
};

const day = (iso: string | null, tz: string) => (iso ? formatDay(iso, tz) : null);

// The plan in plain words, with the one or two buttons that make sense for it.
export function PlanPanel({ state, timeZone: tz, hasBillingAccount, priceLabel }: Props) {
  const price = priceLabel ? ` The annual plan is ${priceLabel}.` : "";

  switch (state.kind) {
    case "none":
      return (
        <Panel title="No plan yet" tone="warn">
          <p>Your coupons cannot go live until you start a plan. You can build them and save drafts now.{price}</p>
          <StartPlanButton />
        </Panel>
      );
    case "complimentary":
      return (
        <Panel title="Complimentary plan">
          <p>
            Coupersville gave you a free plan, active {state.endsAt ? `until ${day(state.endsAt, tz)}` : "with no end date"}.
            {" "}If you start a paid annual plan, it replaces the complimentary one.{price}
          </p>
          <StartPlanButton variant="secondary" />
        </Panel>
      );
    case "active":
      return (
        <Panel title="Annual plan, active">
          <p>{state.renewsAt ? `Renews on ${day(state.renewsAt, tz)}.` : "Active."} Your coupons are live for shoppers.</p>
          <ManageBillingButton />
        </Panel>
      );
    case "cancelling":
      return (
        <Panel title="Annual plan, cancelled" tone="warn">
          <p>
            It stays active until {day(state.endsAt, tz) ?? "the end of this period"}, then your coupons are hidden from
            shoppers. To keep it, renew it in billing.
          </p>
          <ManageBillingButton label="Renew or manage billing" />
        </Panel>
      );
    case "past_due":
      return (
        <Panel title="Payment failed" tone="alert">
          <p>
            We could not charge your card for your plan. Your coupons stay live until {day(state.graceEndsAt, tz)}. Update
            your card before then to keep them live.
          </p>
          <ManageBillingButton label="Update card" variant="primary" />
        </Panel>
      );
    case "expired":
      return (
        <Panel title={state.source === "complimentary" ? "Complimentary plan ended" : "Plan ended"} tone="alert">
          <p>
            {state.paymentFailed
              ? `Your payment failed and the ${PAST_DUE_GRACE_DAYS}-day grace period ended${state.endedAt ? ` on ${day(state.endedAt, tz)}` : ""}. `
              : `Your plan ended${state.endedAt ? ` on ${day(state.endedAt, tz)}` : ""}. `}
            Your coupons are hidden from shoppers until you start a plan again.{price}
          </p>
          <div className="flex flex-wrap gap-3">
            {state.paymentFailed && hasBillingAccount ? (
              <ManageBillingButton label="Update card" variant="primary" />
            ) : (
              <StartPlanButton />
            )}
            {hasBillingAccount && !state.paymentFailed && <ManageBillingButton label="View past invoices" />}
          </div>
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
