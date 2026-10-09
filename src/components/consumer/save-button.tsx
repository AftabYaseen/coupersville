"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { removeFavorite, saveFavorite } from "@/app/coupon/actions";

type Props = {
  couponId: string;
  saved: boolean;
  signedIn: boolean;
  // Set when the shopper tapped Save while signed out and has just come back from signing in.
  saveOnArrival: boolean;
};

export function SaveButton({ couponId, saved, signedIn, saveOnArrival }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
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

  if (!signedIn) {
    const next = encodeURIComponent(`/coupon/${couponId}?save=1`);
    return (
      <Link href={`/login?next=${next}`} className="btn btn-secondary w-full">
        <Bookmark aria-hidden size={18} strokeWidth={1.5} />
        Save coupon
      </Link>
    );
  }

  function toggle() {
    setMessage("");
    startTransition(async () => {
      const result = saved ? await removeFavorite(couponId) : await saveFavorite(couponId);
      setMessage(result.ok ? (result.message ?? "") : result.error);
    });
  }

  return (
    <div className="grid gap-2">
      <button type="button" className="btn btn-secondary w-full" aria-pressed={saved} disabled={pending} onClick={toggle}>
        {saved ? (
          <BookmarkCheck aria-hidden size={18} strokeWidth={1.5} />
        ) : (
          <Bookmark aria-hidden size={18} strokeWidth={1.5} />
        )}
        {saved ? "Saved" : "Save coupon"}
      </button>
      <p role="status" className="text-center text-sm">
        {message}
      </p>
    </div>
  );
}
