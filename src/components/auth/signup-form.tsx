"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signUp } from "@/app/(auth)/actions";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { Field, FormMessage } from "@/components/field";

const ACCOUNT_TYPES = [
  { value: "consumer", title: "I'm a shopper", body: "Save and redeem coupons from local shops." },
  { value: "merchant", title: "I run a business", body: "Publish coupons for your stores." },
] as const;

export function SignupForm({ defaultType = "consumer" }: { defaultType?: SignupInput["accountType"] }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", email: "", password: "", accountType: defaultType },
  });
  const accountType = useWatch({ control, name: "accountType" });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signUp(values);
      if (!result.ok) setServerError(result.error);
      else setSent(result.message ?? "Check your email to finish signing up.");
    });
  });

  if (sent) {
    return (
      <div className="grid gap-4">
        <FormMessage tone="success">{sent}</FormMessage>
        <Link href="/login" className="btn btn-secondary">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {serverError && <FormMessage tone="error">{serverError}</FormMessage>}

      <fieldset>
        <legend className="field-label">Account type</legend>
        <div className="grid gap-2">
          {ACCOUNT_TYPES.map((type) => (
            <label
              key={type.value}
              className={`flex min-h-11 cursor-pointer gap-3 rounded-sm border-[1.5px] border-ink p-3 ${
                accountType === type.value ? "bg-stock-sky" : "bg-white"
              }`}
            >
              <input type="radio" value={type.value} className="mt-1 size-4 accent-ink" {...register("accountType")} />
              <span>
                <span className="block font-semibold">{type.title}</span>
                <span className="block text-sm">{type.body}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.accountType && <p className="field-error">{errors.accountType.message}</p>}
      </fieldset>

      <Field id="fullName" label="Your name" error={errors.fullName?.message}>
        <input
          id="fullName"
          autoComplete="name"
          className="field-input"
          aria-invalid={Boolean(errors.fullName)}
          {...register("fullName")}
        />
      </Field>

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

      <Field id="password" label="Password" hint="At least 8 characters." error={errors.password?.message}>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          className="field-input"
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
      </Field>

      <button type="submit" className="btn w-full" disabled={pending}>
        {pending ? "Creating account" : "Create account"}
      </button>

      <p className="text-sm">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
