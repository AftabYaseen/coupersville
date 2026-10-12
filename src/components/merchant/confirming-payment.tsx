"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { currentPlanState } from "@/app/merchant/billing/actions";

const POLL_MS = 2000;
const PATIENCE_MS = 60_000;

type View = "waiting" | "active" | "slow";

// Checks every 2 seconds whether the webhook has recorded the paid plan. It never marks anything itself.
export function ConfirmingPayment() {
  const [view, setView] = useState<View>("waiting");

  useEffect(() => {
    const started = Date.now();
    let stopped = false;
    let timer: number | undefined;

    const check = async () => {
      try {
        const state = await currentPlanState();
        if (stopped) return;
        // Only a paid plan counts here; a complimentary plan is replaced once the webhook lands.
        if (state.kind === "active" || state.kind === "cancelling") {
          setView("active");
          return;
        }
      } catch {
        // Keep waiting; a dropped request is not a failed payment.
      }
      if (Date.now() - started > PATIENCE_MS) setView("slow");
      timer = window.setTimeout(check, POLL_MS);
    };
    void check();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (view === "active") {
    return (
      <div className="panel grid justify-items-start gap-4 p-6" role="status">
        <CheckCircle2 aria-hidden size={48} strokeWidth={1.5} className="text-ink" />
        <h1 className="wordmark text-4xl text-ink">Your annual plan is active</h1>
        <p>Payment confirmed. Your published coupons are live for shoppers.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/merchant" className="btn">
            Go to dashboard
          </Link>
          <Link href="/merchant/billing" className="btn btn-secondary">
            View billing
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="panel grid justify-items-start gap-4 p-6" role="status" aria-live="polite">
      <Clock aria-hidden size={48} strokeWidth={1.5} className="text-ink" />
      <h1 className="wordmark text-4xl text-ink">Confirming your payment</h1>
      {view === "waiting" ? (
        <p>Stripe is confirming your payment. This usually takes a few seconds. Keep this page open.</p>
      ) : (
        <>
          <p>
            This is taking longer than usual. If your payment went through, your plan turns on as soon as Stripe confirms it,
            and you do not need to pay again. You can leave this page.
          </p>
          <Link href="/merchant/billing" className="btn btn-secondary">
            View billing
          </Link>
        </>
      )}
    </div>
  );
}
