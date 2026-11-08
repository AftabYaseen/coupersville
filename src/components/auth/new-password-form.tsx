"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updatePassword } from "@/app/(auth)/actions";
import { newPasswordSchema, type NewPasswordInput } from "@/lib/validation/auth";
import { Field, FormMessage } from "@/components/field";
import { PasswordInput } from "@/components/auth/password-input";

export function NewPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await updatePassword(values);
      if (!result.ok) setServerError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {serverError && <FormMessage tone="error">{serverError}</FormMessage>}

      <Field id="password" label="New password" hint="At least 8 characters." error={errors.password?.message}>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
      </Field>

      <Field id="confirm" label="Confirm new password" error={errors.confirm?.message}>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirm)}
          {...register("confirm")}
        />
      </Field>

      <button type="submit" className="btn w-full" disabled={pending}>
        {pending ? "Saving password" : "Save new password"}
      </button>
    </form>
  );
}
