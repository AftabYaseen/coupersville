"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { removeFavorite } from "@/app/coupon/actions";

export function RemoveSavedButton({ couponId, title }: { couponId: string; title: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        className="btn btn-secondary w-full sm:w-auto"
        disabled={pending}
        aria-label={`Remove ${title} from saved`}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await removeFavorite(couponId);
            if (!result.ok) setError(result.error);
          })
        }
      >
        <Trash2 aria-hidden size={18} strokeWidth={1.5} />
        {pending ? "Removing" : "Remove"}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
