"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { updateSettings } from "@/app/admin/settings/actions";
import { SETTING_OPTIONS, settingsSchema, type SettingsInput } from "@/lib/validation/admin";
import { Field, FormMessage } from "@/components/field";

const FIELDS: { key: keyof typeof SETTING_OPTIONS; label: string }[] = [
  { key: "subscription_expiry", label: "When a plan ends" },
  { key: "plans", label: "Plans" },
];

export function SettingsForm({ defaults }: { defaults: SettingsInput }) {
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit } = useForm<SettingsInput, unknown, z.output<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: defaults,
  });

  const onSubmit = handleSubmit((values) => {
    setMessage(null);
    startTransition(async () => {
      const result = await updateSettings(values);
      setMessage(result.ok ? { tone: "success", text: result.message ?? "Saved." } : { tone: "error", text: result.error });
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {FIELDS.map((f) => (
        <Field
          key={f.key}
          id={`setting-${f.key}`}
          label={f.label}
          hint={SETTING_OPTIONS[f.key].length === 1 ? "This is the only option for now." : undefined}
        >
          <select id={`setting-${f.key}`} className="field-input" {...register(f.key)}>
            {SETTING_OPTIONS[f.key].map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      ))}
      <button type="submit" className="btn justify-self-start" disabled={pending}>
        {pending ? "Saving" : "Save settings"}
      </button>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
    </form>
  );
}
