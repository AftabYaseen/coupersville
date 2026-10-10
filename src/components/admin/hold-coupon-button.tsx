"use client";

import { useState, useTransition } from "react";
import { holdCoupon } from "@/app/admin/coupons/actions";
import { FormMessage } from "@/components/field";

// Unpublish with an optional reason the merchant will see.
export function HoldCouponButton({ couponId }: { couponId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldId = `hold-reason-${couponId}`;

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Unpublish
      </button>
    );
  }

  return (
    <div className="grid w-full max-w-sm gap-2">
      <label htmlFor={fieldId} className="field-label">
        Reason for the merchant (optional)
      </label>
      <textarea
        id={fieldId}
        rows={3}
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="field-input py-2"
      />
      <p className="text-sm">Shoppers stop seeing it straight away. Only an admin can release it.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn border-signal bg-signal"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await holdCoupon(couponId, reason);
              if (!result.ok) setError(result.error);
            });
          }}
        >
          {pending ? "Unpublishing" : "Unpublish coupon"}
        </button>
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setOpen(false)}>
          Keep it live
        </button>
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}
