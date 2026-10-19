"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, QrCode } from "lucide-react";
import { startRedemption } from "@/app/redeem/actions";
import { FormMessage } from "@/components/field";
import { SignInSheet } from "@/components/consumer/sign-in-sheet";

type Props = {
  couponId: string;
  signedIn: boolean;
  label?: string;
  variant?: "primary" | "secondary";
  // Set when the coupon's schedule is closed right now, for example "Available Tuesday at 11am".
  unavailable?: string | null;
};

export function RedeemButton({ couponId, signedIn, label = "Redeem now", variant = "primary", unavailable }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const className = `btn w-full ${variant === "secondary" ? "btn-secondary" : ""}`;

  if (unavailable) {
    return (
      <div className="grid gap-2">
        <button type="button" className={className} disabled aria-describedby={`when-${couponId}`}>
          <CalendarClock aria-hidden size={18} strokeWidth={1.5} />
          {label}
        </button>
        <p id={`when-${couponId}`} className="text-center text-sm font-medium">
          {unavailable}
        </p>
      </div>
    );
  }

  function redeem() {
    setError(null);
    startTransition(async () => {
      // On success this redirects to the QR code, so a result only comes back on failure.
      const result = await startRedemption(couponId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="grid gap-2">
      <button type="button" className={className} disabled={pending} onClick={() => (signedIn ? redeem() : setSheetOpen(true))}>
        <QrCode aria-hidden size={18} strokeWidth={1.5} />
        {pending ? "Getting your code" : label}
      </button>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <SignInSheet
        open={sheetOpen}
        title="Sign in to redeem this coupon"
        returnPath={`/coupon/${couponId}`}
        onClose={() => setSheetOpen(false)}
        onSignedIn={() => {
          setSheetOpen(false);
          router.refresh();
          redeem();
        }}
      />
    </div>
  );
}
