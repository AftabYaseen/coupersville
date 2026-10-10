"use client";

import { useState, useTransition, type ReactNode } from "react";
import { FormMessage } from "@/components/field";
import type { ActionResult } from "@/lib/validation/auth";

type Props = {
  // A server action with its arguments already bound on the server.
  action: () => Promise<ActionResult>;
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  // When set, the first tap asks this question and a second tap runs the action.
  confirm?: { question: string; yes: string; no?: string };
  showSuccess?: boolean;
};

const STYLES = {
  primary: "btn",
  secondary: "btn btn-secondary",
  danger: "btn border-signal bg-signal",
};

export function ActionButton({ action, children, pendingText, variant = "secondary", confirm, showSuccess = true }: Props) {
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setAsking(false);
      if (!result.ok) setMessage({ tone: "error", text: result.error });
      else if (showSuccess) setMessage({ tone: "success", text: result.message ?? "Done." });
    });
  }

  return (
    <div className="grid gap-2">
      {asking && confirm ? (
        <div className="grid gap-2">
          <p className="text-sm">{confirm.question}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={STYLES.danger} disabled={pending} onClick={run}>
              {pending ? (pendingText ?? "Working") : confirm.yes}
            </button>
            <button type="button" className={STYLES.secondary} disabled={pending} onClick={() => setAsking(false)}>
              {confirm.no ?? "Cancel"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={STYLES[variant]}
          disabled={pending}
          onClick={() => (confirm ? setAsking(true) : run())}
        >
          {pending ? (pendingText ?? "Working") : children}
        </button>
      )}
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
    </div>
  );
}
