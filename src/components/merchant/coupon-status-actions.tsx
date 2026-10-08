"use client";

import { useState, useTransition } from "react";
import { deleteDraftCoupon, setCouponStatus } from "@/app/merchant/coupons/actions";
import type { Enums } from "@/lib/supabase/database.types";
import { FormMessage } from "@/components/field";

export function CouponStatusActions({
  couponId,
  status,
  ended,
}: {
  couponId: string;
  status: Enums<"coupon_status">;
  ended: boolean;
}) {
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

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
        {status === "published" && (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => setCouponStatus(couponId, "paused"))}>
            Pause coupon
          </button>
        )}
        {status === "paused" && !ended && (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => setCouponStatus(couponId, "published"))}>
            Resume coupon
          </button>
        )}
        {status === "draft" &&
          (confirmingDelete ? (
            <>
              <button
                type="button"
                className="btn border-signal bg-signal"
                disabled={pending}
                onClick={() => run(() => deleteDraftCoupon(couponId))}
              >
                Yes, delete draft
              </button>
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setConfirmingDelete(false)}>
                Keep draft
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmingDelete(true)}>
              Delete draft
            </button>
          ))}
      </div>
    </div>
  );
}
