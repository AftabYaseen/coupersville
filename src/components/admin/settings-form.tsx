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
  { key: "founders_rule", label: "A Founding Merchant qualifies for a free seat when" },
  { key: "founders_full", label: "If Founding seats fill before the window ends" },
  { key: "payments_open", label: "Payments" },
  { key: "renewals_enabled", label: "Renewals" },
];

export function SettingsForm({ defaults }: { defaults: SettingsInput }) {
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SettingsInput, unknown, z.output<typeof settingsSchema>>({
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
      <Field
        id="setting-publishing-opens"
        label="Publishing opens on"
        hint="From midnight Pacific time. Before then, merchants can save drafts but not publish."
      >
        <input id="setting-publishing-opens" type="date" className="field-input tabular" {...register("publishing_opens_on")} />
      </Field>
      <Field
        id="setting-contact-email"
        label="Contact email"
        hint="Contact page messages go here. Also shown on the Contact, Business membership and Billing pages."
        error={errors.enterprise_contact_email?.message}
      >
        <input id="setting-contact-email" type="email" className="field-input" {...register("enterprise_contact_email")} />
      </Field>
      <Field
        id="setting-response-time"
        label="Response time"
        hint='Shown after a message is sent: "We will respond within 2 business days."'
        error={errors.contact_response_time?.message}
      >
        <input id="setting-response-time" className="field-input" {...register("contact_response_time")} />
      </Field>
      <button type="submit" className="btn justify-self-start" disabled={pending}>
        {pending ? "Saving" : "Save settings"}
      </button>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
    </form>
  );
}
