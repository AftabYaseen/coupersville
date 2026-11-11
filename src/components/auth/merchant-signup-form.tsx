"use client";

import Link from "next/link";
import { useState, useTransition, type InputHTMLAttributes } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signUpMerchant } from "@/app/(auth)/actions";
import { merchantSignupSchema, type MerchantSignupInput } from "@/lib/validation/auth";
import { Field, FormMessage } from "@/components/field";
import { PasswordInput } from "@/components/auth/password-input";

type CategoryOption = { id: string; name: string };

export function MerchantSignupForm({ categories }: { categories: CategoryOption[] }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MerchantSignupInput>({
    resolver: zodResolver(merchantSignupSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
      confirm: "",
      businessName: "",
      primaryCategoryId: "",
      websiteUrl: "",
      addressLine1: "",
      city: "",
      state: "",
      postalCode: "",
      country: "United States",
    },
  });

  const onSubmit = handleSubmit(
    (values) => {
      setServerError(null);
      startTransition(async () => {
        const result = await signUpMerchant(values);
        if (!result.ok) setServerError(result.error);
        else setCreated(result.message ?? "Your business account has been created.");
      });
    },
    () => setServerError("Please complete the highlighted fields."),
  );

  if (created) {
    return (
      <div className="grid gap-4" role="status">
        <h2 className="wordmark text-3xl text-ink">Welcome to Coupersville.</h2>
        <p>{created}</p>
        <Link href="/login" className="btn btn-secondary">
          Merchant sign in
        </Link>
      </div>
    );
  }

  const input = (name: keyof MerchantSignupInput, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <Field id={name} label={label} hint={hint} error={errors[name]?.message}>
      <input id={name} className="field-input" aria-invalid={Boolean(errors[name])} {...props} {...register(name)} />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-8">
      {serverError && <FormMessage tone="error">{serverError}</FormMessage>}

      <fieldset className="grid gap-5">
        <legend className="mb-4 text-xl font-semibold">About you</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {input("firstName", "First name", { autoComplete: "given-name" })}
          {input("lastName", "Last name", { autoComplete: "family-name" })}
        </div>
        {input("email", "Business email", { type: "email", autoComplete: "email" }, "You sign in with this address.")}
        {input("phone", "Phone number", { type: "tel", autoComplete: "tel" }, "Shown to shoppers as your business phone. You can change it later.")}
        <Field id="password" label="Create password" hint="At least 8 characters." error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} {...register("password")} />
        </Field>
        <Field id="confirm" label="Confirm password" error={errors.confirm?.message}>
          <PasswordInput id="confirm" autoComplete="new-password" aria-invalid={Boolean(errors.confirm)} {...register("confirm")} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-4 text-xl font-semibold">About your business</legend>
        {input("businessName", "Business name", { autoComplete: "organization" })}
        <Field id="primaryCategoryId" label="Primary category" error={errors.primaryCategoryId?.message}>
          <select id="primaryCategoryId" className="field-input" aria-invalid={Boolean(errors.primaryCategoryId)} {...register("primaryCategoryId")}>
            <option value="">Choose a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        {input("websiteUrl", "Business website", { type: "url", autoComplete: "url", placeholder: "https://" }, "Optional.")}
        {input("addressLine1", "Street address", { autoComplete: "address-line1" })}
        <div className="grid gap-5 sm:grid-cols-2">
          {input("city", "City", { autoComplete: "address-level2" })}
          {input("state", "State or region", { autoComplete: "address-level1" })}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {input("postalCode", "ZIP or postal code", { autoComplete: "postal-code" })}
          {input("country", "Country", { autoComplete: "country-name" })}
        </div>
      </fieldset>

      <p className="text-sm">
        By creating an account, you confirm that you are authorized to represent this business and agree to the Coupersville{" "}
        <Link href="/terms" className="font-medium text-ink underline underline-offset-4">
          Terms of use
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-medium text-ink underline underline-offset-4">
          Privacy notice
        </Link>
        .
      </p>

      <button type="submit" className="btn w-full" disabled={pending}>
        {pending ? "Creating your account" : "Create my business account"}
      </button>

      <p className="text-sm">
        Already have a Coupersville business account?{" "}
        <Link href="/login" className="font-medium text-ink underline underline-offset-4">
          Merchant sign in
        </Link>
      </p>
    </form>
  );
}
