"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { updateSettings } from "@/app/admin/settings/actions";
import { SETTING_OPTIONS, settingsSchema, type SettingsInput } from "@/lib/validation/admin";
import { Field, FormMessage } from "@/components/field";

const FIELDS: { key: keyof typeof SETTING_OPTIONS; label: string; applied: string }[] = [
  {
    key: "redemption_method",
    label: "Redemption method",
    applied: "The app currently always offers the QR code and the 6-digit code.",
  },
  {
    key: "coupon_moderation",
    label: "Coupon moderation",
    applied: "The app currently publishes merchant coupons instantly. There is no review queue yet.",
  },
  { key: "subscription_expiry", label: "When a plan ends", applied: "Applied." },
  {
    key: "consumer_login",
    label: "Shopper sign-in",
    applied: "The app currently lets anyone browse.",
  },
  { key: "plans", label: "Plans", applied: "Applied." },
];

export function SettingsForm({ defaults }: { defaults: SettingsInput }) {
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SettingsInput, unknown, z.output<typeof settingsSchema>>({ resolver: zodResolver(settingsSchema), defaultValues: defaults });

  const onSubmit = handleSubmit((values) => {
    setMessage(null);
    startTransition(async () => {
      const result = await updateSettings(values);
      setMessage(result.ok ? { tone: "success", text: result.message ?? "Saved." } : { tone: "error", text: result.error });
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {FIELDS.map((f) => {
        const options = SETTING_OPTIONS[f.key];
        const changed = defaults[f.key] !== options[0].value;
        return (
          <Field key={f.key} id={`setting-${f.key}`} label={f.label}>
            <select id={`setting-${f.key}`} className="field-input" {...register(f.key)}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className={`mt-1.5 text-sm ${changed && f.applied !== "Applied." ? "font-semibold text-signal" : ""}`}>
              {options.length === 1 ? "Only one option for now." : f.applied}
            </p>
          </Field>
        );
      })}
      <Field
        id="setting-region"
        label="Region restriction"
        hint="Leave blank for no restriction. Stored for later; the app does not restrict by region yet."
        error={errors.region_restriction?.message}
      >
        <input id="setting-region" className="field-input" {...register("region_restriction")} />
      </Field>
      <button type="submit" className="btn justify-self-start" disabled={pending}>
        {pending ? "Saving" : "Save settings"}
      </button>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
    </form>
  );
}
