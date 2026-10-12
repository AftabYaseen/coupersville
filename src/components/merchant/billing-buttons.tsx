"use client";

import { useState, useTransition } from "react";
import { CreditCard, ExternalLink } from "lucide-react";
import { openBillingPortal, startCheckout } from "@/app/merchant/billing/actions";
import { FormMessage } from "@/components/field";

function useStripeRedirect(action: () => Promise<{ ok: false; error: string } | { ok: true; message?: string }>) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = () => {
    setError(null);
    startTransition(async () => {
      // On success the action redirects to Stripe, so a result only comes back on failure.
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  };
  return { error, pending, run };
}

export function StartPlanButton({ label = "Start annual plan", variant = "primary" }: { label?: string; variant?: "primary" | "secondary" }) {
  const { error, pending, run } = useStripeRedirect(startCheckout);
  return (
    <div className="grid gap-2">
      <button type="button" className={`btn ${variant === "secondary" ? "btn-secondary" : ""}`} disabled={pending} onClick={run}>
        <CreditCard aria-hidden size={18} strokeWidth={1.5} />
        {pending ? "Opening checkout" : label}
      </button>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}

export function ManageBillingButton({ label = "Manage billing", variant = "secondary" }: { label?: string; variant?: "primary" | "secondary" }) {
  const { error, pending, run } = useStripeRedirect(openBillingPortal);
  return (
    <div className="grid gap-2">
      <button type="button" className={`btn ${variant === "secondary" ? "btn-secondary" : ""}`} disabled={pending} onClick={run}>
        <ExternalLink aria-hidden size={18} strokeWidth={1.5} />
        {pending ? "Opening billing" : label}
      </button>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}
