"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { sendContactMessage } from "@/app/contact/actions";
import { CONTACT_ROLES, CONTACT_TOPICS, contactSchema, type ContactInput } from "@/lib/validation/contact";
import { Field, FormMessage } from "@/components/field";

export function ContactForm() {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", role: "Shopper", topic: "Coupon question", message: "", website: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await sendContactMessage(values);
      if (result.ok) setSent(result.message ?? "Thanks for contacting Coupersville.");
      else setError(result.error);
    });
  });

  if (sent) {
    return (
      <div role="status" className="panel p-5">
        <p className="text-lg font-semibold">{sent}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="panel relative grid gap-5 overflow-hidden p-5 sm:p-6">
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="contact-name" label="Name" error={errors.name?.message}>
          <input id="contact-name" autoComplete="name" className="field-input" aria-invalid={Boolean(errors.name)} {...register("name")} />
        </Field>
        <Field id="contact-email" label="Email address" error={errors.email?.message}>
          <input
            id="contact-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            className="field-input"
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
        </Field>
        <Field id="contact-role" label="I am a" error={errors.role?.message}>
          <select id="contact-role" className="field-input" {...register("role")}>
            {CONTACT_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field id="contact-topic" label="Topic" error={errors.topic?.message}>
          <select id="contact-topic" className="field-input" {...register("topic")}>
            {CONTACT_TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="contact-message" label="Message" error={errors.message?.message}>
        <textarea id="contact-message" rows={6} className="field-input py-2" aria-invalid={Boolean(errors.message)} {...register("message")} />
      </Field>
      {/* Hidden from people and screen readers. Bots that fill it in are ignored. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="contact-website">Leave this empty</label>
        <input id="contact-website" type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>
      <button type="submit" className="btn justify-self-start" disabled={pending}>
        {pending ? "Sending" : "Send message"}
      </button>
    </form>
  );
}
