"use client";

import { useState, useTransition } from "react";
import { setRenewal } from "@/app/merchant/billing/actions";
import { FormMessage } from "@/components/field";

export function RenewalToggle({ cancelled, endsOn }: { cancelled: boolean; endsOn: string }) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(renew: boolean) {
    setMessage(null);
    startTransition(async () => {
      const r = await setRenewal(renew);
      setConfirming(false);
      setMessage(r.ok ? { tone: "success", text: r.message ?? "Saved." } : { tone: "error", text: r.error });
    });
  }

  return (
    <div className="grid gap-2">
      {cancelled ? (
        <button type="button" className="btn btn-secondary w-fit" disabled={pending} onClick={() => run(true)}>
          Resume renewals
        </button>
      ) : confirming ? (
        <div className="grid gap-2">
          <p className="text-sm">
            Cancel renewal? Your plan stays active until {endsOn}, then your coupons are hidden from shoppers. There are no partial refunds.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn border-signal bg-signal" disabled={pending} onClick={() => run(false)}>
              Yes, cancel renewal
            </button>
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setConfirming(false)}>
              Keep renewing
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary w-fit" disabled={pending} onClick={() => setConfirming(true)}>
          Cancel renewal
        </button>
      )}
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
    </div>
  );
}
