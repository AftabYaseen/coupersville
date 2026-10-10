"use client";

import { useState, useTransition } from "react";
import { acceptInvite } from "@/app/join/actions";
import { FormMessage } from "@/components/field";

export function AcceptInviteButton({ token, businessName }: { token: string; businessName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-3">
      <button
        type="button"
        className="btn w-full"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await acceptInvite(token);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        {pending ? "Joining" : `Join ${businessName}`}
      </button>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}
