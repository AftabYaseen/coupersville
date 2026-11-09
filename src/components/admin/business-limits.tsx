"use client";

import { useState, useTransition } from "react";
import { grantEnterprisePlan, setBusinessLimits } from "@/app/admin/subscriptions/actions";
import { Field, FormMessage } from "@/components/field";
import type { ActionResult } from "@/lib/validation/auth";

type Props = {
  businessId: string;
  maxLocations: string;
  campaignsPerMonth: string;
  // A current paid plan cannot be replaced, and an Enterprise plan already has its grant.
  canGrantEnterprise: boolean;
  today: string;
};

export function BusinessLimits({ businessId, maxLocations, campaignsPerMonth, canGrantEnterprise, today }: Props) {
  const [locations, setLocations] = useState(maxLocations);
  const [campaigns, setCampaigns] = useState(campaignsPerMonth);
  const [endsOn, setEndsOn] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const id = (name: string) => `limits-${businessId}-${name}`;

  function run(action: () => Promise<ActionResult>) {
    setMessage(null);
    startTransition(async () => {
      const r = await action();
      setMessage(r.ok ? { tone: "success", text: r.message ?? "Saved." } : { tone: "error", text: r.error });
    });
  }

  const values = { maxLocations: locations, campaignsPerMonth: campaigns };
  return (
    <div className="grid max-w-md gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id("locations")} label="Locations" hint="Blank uses the plan's limit.">
          <input id={id("locations")} type="number" min={1} inputMode="numeric" className="field-input tabular" value={locations} onChange={(e) => setLocations(e.target.value)} />
        </Field>
        <Field id={id("campaigns")} label="Campaigns per month" hint="Blank uses the plan's limit.">
          <input id={id("campaigns")} type="number" min={1} inputMode="numeric" className="field-input tabular" value={campaigns} onChange={(e) => setCampaigns(e.target.value)} />
        </Field>
      </div>
      <button type="button" className="btn btn-secondary justify-self-start" disabled={pending} onClick={() => run(() => setBusinessLimits(businessId, values))}>
        Save limits
      </button>
      {canGrantEnterprise && (
        <div className="grid gap-3 border-t-[1.5px] border-ink pt-3">
          <Field id={id("ends")} label="Enterprise until" hint="Uses the two limits above. Leave blank for no end date.">
            <input id={id("ends")} type="date" min={today} className="field-input tabular" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </Field>
          <button type="button" className="btn justify-self-start" disabled={pending} onClick={() => run(() => grantEnterprisePlan(businessId, { ...values, endsOn }))}>
            Grant Enterprise (Custom)
          </button>
        </div>
      )}
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
    </div>
  );
}
