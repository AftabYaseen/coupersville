"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createLocation, setLocationActive, updateLocation } from "@/app/merchant/locations/actions";
import { locationSchema, type LocationInput } from "@/lib/validation/merchant";
import { FormMessage } from "@/components/field";
import { LocationFields } from "@/components/merchant/location-fields";

export function LocationForm({ locationId, defaults }: { locationId?: string; defaults: LocationInput }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm({ resolver: zodResolver(locationSchema), defaultValues: defaults });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = locationId ? await updateLocation(locationId, values) : await createLocation(values);
      if (!result.ok) setServerError(result.error);
    });
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="panel grid gap-6 p-5 sm:p-6">
        {serverError && <FormMessage tone="error">{serverError}</FormMessage>}
        <LocationFields />
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn" disabled={pending}>
            {pending ? "Saving" : locationId ? "Save store" : "Add store"}
          </button>
          <Link href="/merchant/locations" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </FormProvider>
  );
}

export function LocationActiveToggle({ locationId, active }: { locationId: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await setLocationActive(locationId, !active);
            if (!result.ok) setError(result.error);
          })
        }
      >
        {pending ? "Saving" : active ? "Close store" : "Reopen store"}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
