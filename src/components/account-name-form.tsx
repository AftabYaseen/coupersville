"use client";

import { useState, useTransition } from "react";
import { updateName } from "@/app/account/actions";
import { Field, FormMessage } from "@/components/field";

export function AccountNameForm({ name }: { name: string | null }) {
  const [value, setValue] = useState(name ?? "");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const r = await updateName({ fullName: value });
          setMessage(r.ok ? { tone: "success", text: r.message ?? "Saved." } : { tone: "error", text: r.error });
        });
      }}
    >
      <Field id="account-name" label="Name" hint="Optional.">
        <input
          id="account-name"
          autoComplete="name"
          maxLength={100}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="field-input"
        />
      </Field>
      <button type="submit" className="btn btn-secondary justify-self-start" disabled={pending}>
        {pending ? "Saving" : "Save name"}
      </button>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
    </form>
  );
}
