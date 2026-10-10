"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createCategory, updateCategory } from "@/app/admin/categories/actions";
import { categorySchema, slugify, STOCK_TINTS, type CategoryInput, type CategoryOutput } from "@/lib/validation/admin";
import { Field, FormMessage } from "@/components/field";

const TINT_LABELS = { mint: "Mint", pink: "Pink", sky: "Sky", butter: "Butter" } as const;
const TINT_BG = { mint: "bg-stock-mint", pink: "bg-stock-pink", sky: "bg-stock-sky", butter: "bg-stock-butter" } as const;

type Props = {
  categoryId?: string;
  defaults?: { name: string; slug: string; shopLabel: string; tint: (typeof STOCK_TINTS)[number] };
  onDone?: () => void;
};

export function CategoryForm({ categoryId, defaults, onDone }: Props) {
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const prefix = categoryId ?? "new";
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CategoryInput, unknown, CategoryOutput>({
    resolver: zodResolver(categorySchema),
    defaultValues: defaults ?? { name: "", slug: "", shopLabel: "", tint: "mint" },
  });
  const name = useWatch({ control, name: "name" });
  const tint = useWatch({ control, name: "tint" });

  const onSubmit = handleSubmit((values) => {
    setMessage(null);
    startTransition(async () => {
      const result = categoryId ? await updateCategory(categoryId, values) : await createCategory(values);
      setMessage(result.ok ? { tone: "success", text: result.message ?? "Saved." } : { tone: "error", text: result.error });
      if (result.ok && !categoryId) reset();
      if (result.ok) onDone?.();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field id={`${prefix}-name`} label="Name" error={errors.name?.message}>
        <input id={`${prefix}-name`} className="field-input" aria-invalid={Boolean(errors.name)} {...register("name")} />
      </Field>
      <Field id={`${prefix}-shop`} label="On Main Street" hint='For example "The bakery".' error={errors.shopLabel?.message}>
        <input id={`${prefix}-shop`} className="field-input" aria-invalid={Boolean(errors.shopLabel)} {...register("shopLabel")} />
      </Field>
      <Field
        id={`${prefix}-slug`}
        label="Web address name"
        hint={`Shown as /c/${slugify(name || "") || "name"}. Leave blank to use the name.`}
        error={errors.slug?.message}
      >
        <input
          id={`${prefix}-slug`}
          className="field-input"
          placeholder={slugify(name || "")}
          aria-invalid={Boolean(errors.slug)}
          {...register("slug")}
        />
      </Field>
      <fieldset>
        <legend className="field-label">Ticket tint</legend>
        <div className="grid grid-cols-2 gap-2">
          {STOCK_TINTS.map((t) => (
            <label
              key={t}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border-[1.5px] border-ink px-3 ${TINT_BG[t]} ${
                tint === t ? "font-semibold" : ""
              }`}
            >
              <input type="radio" value={t} className="size-4 accent-ink" {...register("tint")} />
              {TINT_LABELS[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Saving" : categoryId ? "Save category" : "Add category"}
        </button>
        {categoryId && onDone && (
          <button type="button" className="btn btn-secondary" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
      {message && (
        <div className="sm:col-span-2">
          <FormMessage tone={message.tone}>{message.text}</FormMessage>
        </div>
      )}
    </form>
  );
}

export function EditCategory(props: Required<Pick<Props, "categoryId" | "defaults">>) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  }
  return (
    <div className="w-full basis-full">
      <CategoryForm {...props} onDone={() => setOpen(false)} />
    </div>
  );
}
