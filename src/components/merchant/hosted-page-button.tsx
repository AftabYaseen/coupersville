"use client";

import { useId, useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/field";

type Hosted = { ok: true; url: string; token: string } | { ok: false; error: string };

const RELOAD = "This page is out of date or lost its connection. Reload the page and try again.";

// Gets a one-time token from our server, then posts it to Authorize.net's own page (Accept Hosted
// or the card page). Card details are typed there, never here.
export function HostedPageButton({
  label,
  pendingLabel,
  start,
  cycles,
  terms,
  variant = "primary",
}: {
  label: string;
  pendingLabel: string;
  // The agreed renewal terms are sent back, so the server can check them and record them.
  start: (cycle: string | null, agreedTerms: string | null) => Promise<Hosted>;
  // When given, the merchant picks one first: [value, label] pairs.
  cycles?: [string, string][];
  // Automatic-renewal terms for each cycle. When given, an unticked box must be ticked to go on.
  terms?: Record<string, string>;
  variant?: "primary" | "secondary";
}) {
  const [cycle, setCycle] = useState(cycles?.[0]?.[0] ?? null);
  const [agreed, setAgreed] = useState(false);
  const [target, setTarget] = useState<{ url: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const boxId = useId();
  const shown = terms ? (terms[cycle ?? "annual"] ?? null) : null;

  function go() {
    setError(null);
    startTransition(async () => {
      // A page left open across a deploy, or a dropped connection, rejects here.
      const r = await start(cycle, shown && agreed ? shown : null).catch((): Hosted => ({ ok: false, error: RELOAD }));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTarget({ url: r.url, token: r.token });
      // Submit once the hidden form has the token.
      requestAnimationFrame(() => form.current?.submit());
    });
  }

  return (
    <div className="grid gap-3">
      {cycles && cycles.length > 1 && (
        <fieldset className="grid gap-2">
          <legend className="field-label">How would you like to pay?</legend>
          {cycles.map(([value, text]) => (
            <label key={value} className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="cycle"
                value={value}
                checked={cycle === value}
                onChange={() => {
                  setCycle(value);
                  // Different terms: agree again.
                  setAgreed(false);
                }}
                className="size-5 accent-primary"
              />
              <span className="tabular">{text}</span>
            </label>
          ))}
        </fieldset>
      )}
      {terms && (
        <div className="grid gap-3 rounded-sm border border-line bg-white p-4">
          <h3 className="font-semibold">Automatic renewal</h3>
          {Object.entries(terms).map(([value, text]) => (
            <p key={value} data-renewal-terms={value} hidden={value !== (cycle ?? "annual")} className="text-sm tabular">
              {text}
            </p>
          ))}
          <label htmlFor={boxId} className="flex min-h-11 items-start gap-3">
            <input id={boxId} type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary" />
            <span className="font-medium">I agree to these automatic renewal terms.</span>
          </label>
        </div>
      )}
      <button
        type="button"
        className={`btn w-fit ${variant === "secondary" ? "btn-secondary" : ""}`}
        disabled={pending || Boolean(target) || (Boolean(terms) && !agreed)}
        onClick={go}
      >
        {pending || target ? pendingLabel : label}
      </button>
      {target && (
        <form ref={form} method="post" action={target.url} className="hidden">
          <input type="hidden" name="token" value={target.token} />
        </form>
      )}
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}
