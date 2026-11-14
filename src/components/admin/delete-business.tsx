"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteBusinessAction } from "@/app/admin/merchants/actions";
import { Field, FormMessage } from "@/components/field";

// Two steps: open the panel and read what happens, then type the business name to confirm.
export function DeleteBusiness({ businessId, name, consequences }: { businessId: string; name: string; consequences: string[] }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) return <FormMessage tone="success">{done}</FormMessage>;

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary border-urgent text-urgent w-fit" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden size={18} strokeWidth={1.5} />
        Delete business
      </button>
    );
  }

  const ready = confirm.trim() === name.trim();

  return (
    <form
      className="grid gap-4 rounded-sm border border-urgent bg-white p-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await deleteBusinessAction(businessId, confirm);
          if (!result) return;
          if (result.ok) setDone(result.message ?? "Deleted.");
          else setError(result.error);
        });
      }}
    >
      <h3 className="text-lg font-semibold text-urgent">Delete {name}?</h3>
      <ul className="grid list-disc gap-1.5 pl-5">
        {consequences.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>This cannot be undone.</p>
      <Field id="delete-business-confirm" label={`Type ${name} to confirm`} error={error ?? undefined}>
        <input
          id="delete-business-confirm"
          autoComplete="off"
          spellCheck={false}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="field-input"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "delete-business-confirm-error" : undefined}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn border-urgent bg-urgent" disabled={pending || !ready}>
          {pending ? "Deleting business" : "Delete business"}
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
          Keep business
        </button>
      </div>
    </form>
  );
}
