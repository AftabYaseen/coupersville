"use client";

import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateBusiness, updateBusinessImage } from "@/app/merchant/business/actions";
import { businessSchema, type BusinessInput } from "@/lib/validation/merchant";
import { LOGO_BUCKET } from "@/lib/storage";
import { FormMessage } from "@/components/field";
import { BusinessFields, type CategoryOption } from "@/components/merchant/business-fields";
import { ImageUpload } from "@/components/merchant/image-upload";

type Message = { tone: "error" | "success"; text: string } | null;

export function BusinessForm({
  categories,
  timezones,
  defaults,
}: {
  categories: CategoryOption[];
  timezones: string[];
  defaults: BusinessInput;
}) {
  const [message, setMessage] = useState<Message>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm({ resolver: zodResolver(businessSchema), defaultValues: defaults });

  const onSubmit = form.handleSubmit((values) => {
    setMessage(null);
    startTransition(async () => {
      const result = await updateBusiness(values);
      setMessage(result.ok ? { tone: "success", text: result.message ?? "Saved." } : { tone: "error", text: result.error });
      if (result.ok) form.reset(form.getValues());
    });
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="panel grid gap-6 p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Details</h2>
        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        <BusinessFields categories={categories} timezones={timezones} />
        <button type="submit" className="btn w-full sm:w-auto sm:justify-self-start" disabled={pending}>
          {pending ? "Saving" : "Save details"}
        </button>
      </form>
    </FormProvider>
  );
}

export function BusinessImages({
  businessId,
  logoPath,
  coverPath,
}: {
  businessId: string;
  logoPath: string | null;
  coverPath: string | null;
}) {
  const [message, setMessage] = useState<Message>(null);

  async function save(kind: "logo" | "cover", path: string | null) {
    setMessage(null);
    const result = await updateBusinessImage({ kind, path });
    setMessage(result.ok ? { tone: "success", text: result.message ?? "Saved." } : { tone: "error", text: result.error });
  }

  return (
    <section className="panel grid gap-6 p-5 sm:p-6" aria-labelledby="images-heading">
      <h2 id="images-heading" className="text-xl font-semibold">
        Images
      </h2>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <ImageUpload
        label="Logo"
        hint="Square works best. JPG, PNG, or WebP up to 5 MB."
        bucket={LOGO_BUCKET}
        businessId={businessId}
        value={logoPath}
        shape="square"
        onChange={(path) => save("logo", path)}
      />
      <ImageUpload
        label="Cover image"
        hint="A wide photo of your shop. JPG, PNG, or WebP up to 5 MB."
        bucket={LOGO_BUCKET}
        businessId={businessId}
        value={coverPath}
        onChange={(path) => save("cover", path)}
      />
    </section>
  );
}
