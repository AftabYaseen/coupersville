"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "@/app/(auth)/actions";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { Field, FormMessage } from "@/components/field";
import { PasswordInput } from "@/components/auth/password-input";

// business: the merchant sign-in wording from the copy deck. Otherwise plain wording for a shopper
// who chose the password option in the sign-in sheet.
export function LoginForm({ next, notice, business = true }: { next?: string; notice?: string; business?: boolean }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", next },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signIn(values);
      if (!result.ok) setServerError(result.error);
    });
  });

  return (
    <>
      <h1 className="wordmark text-3xl text-primary">{business ? "Welcome back." : "Sign in"}</h1>
      <p className="mt-2 mb-6">
        {business
          ? "Sign in to manage your business, create offers, scan coupons and review redemption activity."
          : "Sign in with your email and password."}
      </p>

      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        {notice && !serverError && <FormMessage tone="error">{notice}</FormMessage>}
        {serverError && <FormMessage tone="error">{serverError}</FormMessage>}

        <Field id="email" label={business ? "Business email" : "Email"} error={errors.email?.message}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="field-input"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
        </Field>

        <Field id="password" label="Password" error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
        </Field>

        <Link href="/reset-password" className="-mt-2 min-h-11 content-center justify-self-start text-sm font-medium text-primary underline underline-offset-4">
          Forgot password?
        </Link>

        <button type="submit" className="btn w-full" disabled={pending}>
          {pending ? "Signing in" : "Sign in"}
        </button>

        <p className="text-sm">
          {business ? (
            <>
              Not yet a Coupersville business?{" "}
              <Link href="/business-membership" className="font-medium text-primary underline underline-offset-4">
                View business membership
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link
                href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
                className="font-medium text-primary underline underline-offset-4"
              >
                Create an account
              </Link>
            </>
          )}
        </p>
      </form>
    </>
  );
}
