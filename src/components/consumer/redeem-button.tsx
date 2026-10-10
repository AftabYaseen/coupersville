"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { QrCode } from "lucide-react";
import { startRedemption } from "@/app/redeem/actions";
import { FormMessage } from "@/components/field";

type Props = { couponId: string; signedIn: boolean; label?: string; variant?: "primary" | "secondary" };

export function RedeemButton({ couponId, signedIn, label = "Redeem now", variant = "primary" }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const className = `btn w-full ${variant === "secondary" ? "btn-secondary" : ""}`;

  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(`/coupon/${couponId}`)}`} className={className}>
        <QrCode aria-hidden size={18} strokeWidth={1.5} />
        Sign in to redeem
      </Link>
    );
  }

  function redeem() {
    setError(null);
    startTransition(async () => {
      const result = await startRedemption(couponId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="grid gap-2">
      <button type="button" className={className} disabled={pending} onClick={redeem}>
        <QrCode aria-hidden size={18} strokeWidth={1.5} />
        {pending ? "Getting your code" : label}
      </button>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}
