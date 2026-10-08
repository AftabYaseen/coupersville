"use client";

import { get, useFormContext, type FieldError } from "react-hook-form";
import { Field } from "@/components/field";

export type CategoryOption = { id: string; name: string };

function useFieldError(name: string): string | undefined {
  const {
    formState: { errors },
  } = useFormContext();
  return (get(errors, name) as FieldError | undefined)?.message;
}

export function BusinessFields({
  prefix = "",
  categories,
  timezones,
}: {
  prefix?: string;
  categories: CategoryOption[];
  timezones: string[];
}) {
  const { register } = useFormContext();
  const n = (field: string) => `${prefix}${field}`;
  const id = (field: string) => n(field).replace(/\./g, "-");
  const err = {
    name: useFieldError(n("name")),
    description: useFieldError(n("description")),
    primaryCategoryId: useFieldError(n("primaryCategoryId")),
    contactEmail: useFieldError(n("contactEmail")),
    contactPhone: useFieldError(n("contactPhone")),
    websiteUrl: useFieldError(n("websiteUrl")),
    timezone: useFieldError(n("timezone")),
  };

  return (
    <div className="grid gap-5">
      <Field id={id("name")} label="Business name" error={err.name}>
        <input id={id("name")} className="field-input" aria-invalid={Boolean(err.name)} {...register(n("name"))} />
      </Field>

      <Field id={id("primaryCategoryId")} label="Main category" error={err.primaryCategoryId}>
        <select
          id={id("primaryCategoryId")}
          className="field-input"
          aria-invalid={Boolean(err.primaryCategoryId)}
          {...register(n("primaryCategoryId"))}
        >
          <option value="">Choose a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        id={id("description")}
        label="About your business"
        hint="Optional. A sentence or two shoppers will see."
        error={err.description}
      >
        <textarea
          id={id("description")}
          rows={3}
          className="field-input py-2"
          aria-invalid={Boolean(err.description)}
          {...register(n("description"))}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={id("contactEmail")} label="Contact email" hint="Optional." error={err.contactEmail}>
          <input
            id={id("contactEmail")}
            type="email"
            autoComplete="email"
            className="field-input"
            aria-invalid={Boolean(err.contactEmail)}
            {...register(n("contactEmail"))}
          />
        </Field>
        <Field id={id("contactPhone")} label="Contact phone" hint="Optional." error={err.contactPhone}>
          <input
            id={id("contactPhone")}
            type="tel"
            autoComplete="tel"
            className="field-input"
            aria-invalid={Boolean(err.contactPhone)}
            {...register(n("contactPhone"))}
          />
        </Field>
      </div>

      <Field id={id("websiteUrl")} label="Website" hint="Optional. For example https://example.com" error={err.websiteUrl}>
        <input
          id={id("websiteUrl")}
          type="url"
          className="field-input"
          aria-invalid={Boolean(err.websiteUrl)}
          {...register(n("websiteUrl"))}
        />
      </Field>

      <Field
        id={id("timezone")}
        label="Timezone"
        hint="Coupon start and end dates follow this timezone."
        error={err.timezone}
      >
        <select id={id("timezone")} className="field-input" aria-invalid={Boolean(err.timezone)} {...register(n("timezone"))}>
          <option value="">Choose a timezone</option>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
