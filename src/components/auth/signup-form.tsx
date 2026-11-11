"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signUp } from "@/app/(auth)/actions";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { JOIN_HREF } from "@/lib/site-copy";
import { Field, FormMessage } from "@/components/field";
import { PasswordInput } from "@/components/auth/password-input";

// A shopper account with a password. Businesses join through the merchant sign-up (JOIN_HREF).
export function SignupForm({ next }: { next?: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", email: "", password: "", accountType: "consumer", next },
  });

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
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="btn btn-secondary">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {serverError && <FormMessage tone="error">{serverError}</FormMessage>}

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
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
      </Field>

      <p className="text-sm">
        By creating an account you agree to the{" "}
        <Link href="/terms" className="font-medium text-ink underline underline-offset-4">
          terms
        </Link>{" "}
        and confirm you have read how we handle your{" "}
        <Link href="/privacy" className="font-medium text-ink underline underline-offset-4">
          privacy
        </Link>
        .
      </p>

      <button type="submit" className="btn w-full" disabled={pending}>
        {pending ? "Creating account" : "Create account"}
      </button>

      <p className="text-sm">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
      <p className="text-sm">
        Running a business?{" "}
        <Link href={JOIN_HREF} className="font-medium text-ink underline underline-offset-4">
          Join Coupersville as a business
        </Link>
      </p>
    </form>
  );
}
