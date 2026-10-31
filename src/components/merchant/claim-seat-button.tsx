"use client";

import { useFormStatus } from "react-dom";
import { claimFreeSeat } from "@/app/merchant/billing/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn w-fit" disabled={pending}>
      {pending ? "Claiming free seat" : "Claim free seat"}
    </button>
  );
}

export function ClaimSeatButton() {
  return (
    <form action={claimFreeSeat}>
      <Submit />
    </form>
  );
}
