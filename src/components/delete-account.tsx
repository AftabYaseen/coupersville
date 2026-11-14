"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteMyAccount } from "@/app/account/actions";
import { Field } from "@/components/field";

// Two steps: open the panel and read what happens, then type "delete" to confirm.
export function DeleteAccount({ consequences }: { consequences: string[] }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary border-urgent text-urgent" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden size={18} strokeWidth={1.5} />
        Delete account
      </button>
    );
  }

  const ready = confirm.trim().toLowerCase() === "delete";

  return (
    <form
      className="grid gap-4 rounded-sm border border-urgent bg-white p-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await deleteMyAccount({ confirm });
          if (result && !result.ok) setError(result.error);
        });
      }}
    >
      <h3 className="text-lg font-semibold text-urgent">Delete your account?</h3>
      <ul className="grid list-disc gap-1.5 pl-5">
        {consequences.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>This cannot be undone.</p>
      <Field id="delete-confirm" label="Type delete to confirm" error={error ?? undefined}>
        <input
          id="delete-confirm"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="field-input"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "delete-confirm-error" : undefined}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn border-urgent bg-urgent" disabled={pending || !ready}>
          {pending ? "Deleting account" : "Delete my account"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setConfirm("");
            setError(null);
          }}
        >
          Keep my account
        </button>
      </div>
    </form>
  );
}
