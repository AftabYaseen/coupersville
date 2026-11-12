"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CalendarClock, QrCode } from "lucide-react";
import { startRedemption } from "@/app/redeem/actions";
import { privateOfferPath } from "@/lib/just-for-you";
import { FormMessage } from "@/components/field";
import { SignInSheet } from "@/components/consumer/sign-in-sheet";

type Props = {
  couponId: string;
  signedIn: boolean;
  label?: string;
  variant?: "primary" | "secondary";
  // Set when the coupon's schedule is closed right now, for example "Available Tuesday at 11am".
  unavailable?: string | null;
  // A Just for You offer: the key from its private link, which the database needs for a code.
  privateKey?: string;
};

export function RedeemButton({ couponId, signedIn, label = "Redeem now", variant = "primary", unavailable, privateKey }: Props) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  // The "Ready to use this deal?" step: the code and its 5-minute timer start only after Generate.
  const [stepOpen, setStepOpen] = useState(false);
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

  return (
    <div className="grid gap-2">
      <button type="button" className={className} onClick={() => (signedIn ? setStepOpen(true) : setSheetOpen(true))}>
        <QrCode aria-hidden size={18} strokeWidth={1.5} />
        {label}
      </button>
      <SignInSheet
        open={sheetOpen}
        title="Sign in to redeem this coupon"
        returnPath={privateKey ? privateOfferPath(privateKey) : `/coupon/${couponId}`}
        onClose={() => setSheetOpen(false)}
        onSignedIn={() => {
          setSheetOpen(false);
          router.refresh();
          setStepOpen(true);
        }}
      />
      {stepOpen && <GenerateStep couponId={couponId} privateKey={privateKey} onClose={() => setStepOpen(false)} />}
    </div>
  );
}

function GenerateStep({ couponId, privateKey, onClose }: { couponId: string; privateKey?: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headingId = useId();
  const textId = useId();
  const generateRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    generateRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function generate() {
    setError(null);
    startTransition(async () => {
      // On success this redirects to the QR code, so a result only comes back on failure.
      const result = await startRedemption(couponId, privateKey);
      if (!result.ok) setError(result.error);
    });
  }

  // Rendered into <body> so the ticket stub's notch mask cannot clip it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-deep/40 sm:items-center" onClick={pending ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={textId}
        className="grid w-full max-w-md gap-4 rounded-t-sm border-[1.5px] border-ink bg-white p-5 pb-8 sm:rounded-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={headingId} className="text-xl font-semibold">
          Ready to use this deal?
        </h2>
        <p id={textId}>
          Generate your coupon only when you are at the participating business and ready to redeem. This QR coupon is time-limited
          and can be used once.
        </p>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <div className="grid gap-3 sm:grid-cols-2">
          <button ref={generateRef} type="button" className="btn" disabled={pending} onClick={generate}>
            <QrCode aria-hidden size={18} strokeWidth={1.5} />
            {pending ? "Getting your code" : "Generate my QR coupon"}
          </button>
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={onClose}>
            Not yet
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
