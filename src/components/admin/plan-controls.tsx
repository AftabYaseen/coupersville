"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { extendComplimentaryPlan, revokeComplimentaryPlan, setComplimentaryPlan } from "@/app/admin/subscriptions/actions";
import { FormMessage } from "@/components/field";
import type { ActionResult } from "@/lib/validation/auth";

type Props = {
  businessId: string;
  businessName: string;
  source: "stripe" | "complimentary" | null;
  active: boolean;
  hasEndDate: boolean;
  // Defaults for the date field, as YYYY-MM-DD in the business timezone.
  today: string;
  suggestedEnd: string;
  compact?: boolean;
  // Link to the business's customer in the Stripe dashboard, when it has one.
  stripeUrl?: string | null;
};

export function PlanControls({ businessId, businessName, source, active, hasEndDate, today, suggestedEnd, compact, stripeUrl }: Props) {
  const [endsOn, setEndsOn] = useState(suggestedEnd);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [pending, startTransition] = useTransition();
  const fieldId = `plan-end-${businessId}`;

  const stripeLink = stripeUrl ? (
    <a href={stripeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-medium text-ink underline underline-offset-4">
      <ExternalLink aria-hidden size={16} strokeWidth={1.5} />
      Open customer in Stripe
    </a>
  ) : null;

  // Paid plans are read-only here: Stripe and its webhook own them.
  if (source === "stripe" && active) {
    return (
      <div className="grid gap-1">
        <p className="text-sm">This business pays through Stripe, so its plan is read-only here.</p>
        {stripeLink}
      </div>
    );
  }

  function run(action: () => Promise<ActionResult>) {
    setMessage(null);
    startTransition(async () => {
      const r = await action();
      setConfirmRevoke(false);
      setMessage(r.ok ? { tone: "success", text: r.message ?? "Saved." } : { tone: "error", text: r.error });
    });
  }

  const granting = !active;
  return (
    <div className={`grid gap-3 ${compact ? "" : "max-w-md"}`}>
      {source === "stripe" && (
        <div className="grid gap-1">
          <p className="text-sm">The paid plan has lapsed. A complimentary plan can replace it.</p>
          {stripeLink}
        </div>
      )}
      <div>
        <label htmlFor={fieldId} className="field-label">
          {granting ? "Complimentary until" : "Change end date"}
        </label>
        <input
          id={fieldId}
          type="date"
          min={today}
          value={endsOn}
          onChange={(e) => setEndsOn(e.target.value)}
          className="field-input tabular"
        />
        <p className="mt-1.5 text-sm">Leave blank for no end date.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => run(() => setComplimentaryPlan(businessId, endsOn))}
        >
          {granting ? "Grant complimentary plan" : "Save end date"}
        </button>
        {active && hasEndDate && (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => extendComplimentaryPlan(businessId))}>
            Extend by 1 year
          </button>
        )}
        {active && !confirmRevoke && (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setConfirmRevoke(true)}>
            Revoke plan
          </button>
        )}
      </div>
      {confirmRevoke && (
        <div className="grid gap-2">
          <p className="text-sm">Revoke {businessName}&apos;s plan now? Its coupons are hidden from shoppers straight away.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn border-signal bg-signal"
              disabled={pending}
              onClick={() => run(() => revokeComplimentaryPlan(businessId))}
            >
              Yes, revoke plan
            </button>
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setConfirmRevoke(false)}>
              Keep plan
            </button>
          </div>
        </div>
      )}
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
    </div>
  );
}
