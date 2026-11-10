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

// The membership in plain words, using the copy deck's system messages (2026-11-10).
// Coupons are hidden while a membership has lapsed and come back by themselves on renewal, as long
// as they have not ended.
export function PlanPanel({ state, timeZone: tz, foundingSeat, billingLink }: Props) {
  const link = billingLink ? (
    <Link href="/merchant/billing" className="btn btn-secondary w-fit">
      See billing
    </Link>
  ) : null;

  switch (state.kind) {
    case "none":
      return (
        <Panel title="No membership yet" tone="warn">
          <p>Your coupons cannot go live until you have a membership. You can build them and save drafts now.</p>
          {link}
        </Panel>
      );
    case "complimentary":
      return (
        <Panel title={foundingSeat ? "Founding Merchant, complimentary year" : "Complimentary membership"}>
          <p>
            {state.endsAt
              ? `Your Coupersville membership is active through ${day(state.endsAt, tz)}.`
              : "Your Coupersville membership is active, with no end date."}{" "}
            Your published coupons are live for shoppers.
          </p>
        </Panel>
      );
    case "active":
      return (
        <Panel title="Membership active">
          <p>
            {state.renewsAt
              ? `Your Coupersville membership renews on ${day(state.renewsAt, tz)}. Review your billing information to avoid interruption.`
              : "Your Coupersville membership is active."}
          </p>
          {link}
        </Panel>
      );
    case "cancelling":
      return (
        <Panel title="Renewal turned off" tone="warn">
          <p>
            Your Coupersville membership is active through {day(state.endsAt, tz) ?? "the end of this period"}. After that, your
            published coupons are removed from public view.
          </p>
          {link}
        </Panel>
      );
    case "past_due":
      return (
        <Panel title="Payment failed" tone="alert">
          <p>
            We could not process your membership payment. Update your payment method to keep your coupons published. They stay
            live until {day(state.graceEndsAt, tz)}.
          </p>
          {link}
        </Panel>
      );
    case "expired":
      return (
        <Panel title="Membership expired" tone="alert">
          <p>
            {state.paymentFailed
              ? `Your payment failed and the ${PAST_DUE_GRACE_DAYS}-day grace period ended${state.endedAt ? ` on ${day(state.endedAt, tz)}` : ""}. `
              : ""}
            Your membership has expired, and your published coupons have been removed from public view. Renew your membership and
            your eligible offers go back on display.
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
