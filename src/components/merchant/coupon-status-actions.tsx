"use client";

import { useState, useTransition } from "react";
import { deleteCoupon, setCouponStatus } from "@/app/merchant/coupons/actions";
import type { Enums } from "@/lib/supabase/database.types";
import { FormMessage } from "@/components/field";

export function CouponStatusActions({
  couponId,
  status,
  ended,
  held,
}: {
  couponId: string;
  status: Enums<"coupon_status">;
  ended: boolean;
  // Removed by Coupersville: no pause or resume, but it can still be deleted.
  held: boolean;
}) {
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const deletable = status === "draft" || held;
  const noun = held ? "coupon" : "draft";

  function run(action: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? { tone: "success", text: result.message ?? "Saved." } : { tone: "error", text: result.error });
    });
  }

  return (
    <div className="grid gap-3">
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <div className="flex flex-wrap gap-3">
        {!held && status === "published" && (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => setCouponStatus(couponId, "paused"))}>
            Pause coupon
          </button>
        )}
        {!held && status === "paused" && !ended && (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => setCouponStatus(couponId, "published"))}>
            Resume coupon
          </button>
        )}
        {deletable &&
          (confirmingDelete ? (
            <>
              <button
                type="button"
                className="btn border-signal bg-signal"
                disabled={pending}
                onClick={() => run(() => deleteCoupon(couponId))}
              >
                Yes, delete {noun}
              </button>
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setConfirmingDelete(false)}>
                Keep {noun}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmingDelete(true)}>
              Delete {noun}
            </button>
          ))}
      </div>
    </div>
  );
}
