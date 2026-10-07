"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { requestPasswordReset } from "@/app/(auth)/actions";
import { resetRequestSchema, type ResetRequestInput } from "@/lib/validation/auth";
import { Field, FormMessage } from "@/components/field";

export function ResetRequestForm() {
  const [result, setResult] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetRequestInput>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const res = await requestPasswordReset(values);
      setResult(
        res.ok ? { tone: "success", text: res.message ?? "Check your inbox." } : { tone: "error", text: res.error },
      );
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {result && <FormMessage tone={result.tone}>{result.text}</FormMessage>}

      <Field id="email" label="Email" error={errors.email?.message}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className="field-input"
          aria-invalid={Boolean(errors.email)}
          {...register("email")}
        />
      </Field>

      <button type="submit" className="btn w-full" disabled={pending}>
        {pending ? "Sending link" : "Send reset link"}
      </button>

      <Link href="/login" className="min-h-11 content-center text-sm font-medium text-ink underline underline-offset-4">
        Back to sign in
      </Link>
    </form>
  );
}
