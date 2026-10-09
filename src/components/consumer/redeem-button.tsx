"use client";

import { useState } from "react";

// Visible now so shoppers learn where it lives; in-store redemption arrives in the next phase.
export function RedeemButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-2">
      <button type="button" className="btn w-full" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Redeem now
      </button>
      {open && (
        <p role="status" className="rounded-sm border-[1.5px] border-ink bg-white p-3 text-sm">
          Redeeming in store is coming soon. Save this coupon so it is ready when it opens.
        </p>
      )}
    </div>
  );
}
