"use client";

import { useState, useTransition } from "react";
import { checkAuthorizeNetConnection } from "@/app/admin/settings/actions";
import { FormMessage } from "@/components/field";
import type { ActionResult } from "@/lib/validation/auth";

export function AnetConnectionCheck() {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const check = () => {
    setResult(null);
    startTransition(async () => {
      // A page left open across a deploy, or a dropped connection, rejects here.
      setResult(
        await checkAuthorizeNetConnection().catch(
          (): ActionResult => ({ ok: false, error: "This page is out of date or lost its connection. Reload the page and try again." }),
        ),
      );
    });
  };

  return (
    <div className="grid gap-3">
      <button type="button" className="btn btn-secondary justify-self-start" disabled={pending} onClick={check}>
        {pending ? "Checking" : "Check Authorize.net connection"}
      </button>
      {result && <FormMessage tone={result.ok ? "success" : "error"}>{result.ok ? result.message : result.error}</FormMessage>}
    </div>
  );
}
