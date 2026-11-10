"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { removeFavorite, saveFavorite } from "@/app/coupon/actions";
import { SignInSheet } from "@/components/consumer/sign-in-sheet";

type Props = {
  couponId: string;
  saved: boolean;
  signedIn: boolean;
  // Set when the shopper tapped Save, signed in with a password, and has just come back.
  saveOnArrival: boolean;
};

export function SaveButton({ couponId, saved, signedIn, saveOnArrival }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const arrivalHandled = useRef(false);

  useEffect(() => {
    if (!saveOnArrival || !signedIn || arrivalHandled.current) return;
    arrivalHandled.current = true;
    startTransition(async () => {
      const result = saved ? { ok: true as const, message: "Saved to your list." } : await saveFavorite(couponId);
      setMessage(result.ok ? (result.message ?? "") : result.error);
      router.replace(`/coupon/${couponId}`, { scroll: false });
    });
  }, [saveOnArrival, signedIn, saved, couponId, router]);

  function save() {
    setMessage("");
    startTransition(async () => {
      const result = await saveFavorite(couponId);
      setMessage(result.ok ? (result.message ?? "") : result.error);
      router.refresh();
    });
  }

  function toggle() {
    if (!signedIn) {
      setSheetOpen(true);
      return;
    }
    setMessage("");
    startTransition(async () => {
      const result = saved ? await removeFavorite(couponId) : await saveFavorite(couponId);
      setMessage(result.ok ? (result.message ?? "") : result.error);
    });
  }

  return (
    <div className="grid gap-2">
      <button type="button" className="btn btn-secondary w-full" aria-pressed={signedIn ? saved : undefined} disabled={pending} onClick={toggle}>
        {saved ? (
          <BookmarkCheck aria-hidden size={18} strokeWidth={1.5} />
        ) : (
          <Bookmark aria-hidden size={18} strokeWidth={1.5} />
        )}
        {saved ? "Saved" : "Save for later"}
      </button>
      <p role="status" className="text-center text-sm">
        {message}
      </p>
      <SignInSheet
        open={sheetOpen}
        title="Sign in to save this coupon"
        returnPath={`/coupon/${couponId}?save=1`}
        onClose={() => setSheetOpen(false)}
        onSignedIn={() => {
          setSheetOpen(false);
          save();
        }}
      />
    </div>
  );
}
