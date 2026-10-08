"use client";

import { useState } from "react";
import { get, useFormContext, useWatch, type FieldError } from "react-hook-form";
import { LocateFixed, X } from "lucide-react";
import { Field } from "@/components/field";

function useFieldError(name: string): string | undefined {
  const {
    formState: { errors },
  } = useFormContext();
  return (get(errors, name) as FieldError | undefined)?.message;
}

export function LocationFields({ prefix = "" }: { prefix?: string }) {
  const { register, setValue, control } = useFormContext();
  const n = (field: string) => `${prefix}${field}`;
  const id = (field: string) => n(field).replace(/\./g, "-");
  const err = {
    storeName: useFieldError(n("storeName")),
    storeNumber: useFieldError(n("storeNumber")),
    addressLine1: useFieldError(n("addressLine1")),
    addressLine2: useFieldError(n("addressLine2")),
    city: useFieldError(n("city")),
    state: useFieldError(n("state")),
    postalCode: useFieldError(n("postalCode")),
    phone: useFieldError(n("phone")),
    lat: useFieldError(n("lat")),
  };

  const lat = useWatch({ control, name: n("lat") }) as number | string | undefined;
  const lng = useWatch({ control, name: n("lng") }) as number | string | undefined;
  const pinned = lat !== undefined && lat !== "" && lng !== undefined && lng !== "";
  const [locating, setLocating] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  function pinToCurrentPosition() {
    setPinError(null);
    if (!("geolocation" in navigator)) {
      setPinError("This device cannot share its location. You can save the store without a pin.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue(n("lat"), Number(pos.coords.latitude.toFixed(6)), { shouldDirty: true });
        setValue(n("lng"), Number(pos.coords.longitude.toFixed(6)), { shouldDirty: true });
        setLocating(false);
      },
      () => {
        setPinError("We could not get this device's location. Allow location access and try again.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function clearPin() {
    setValue(n("lat"), "", { shouldDirty: true });
    setValue(n("lng"), "", { shouldDirty: true });
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-[1fr_10rem]">
        <Field id={id("storeName")} label="Store name" hint="For example Main Street or Downtown." error={err.storeName}>
          <input id={id("storeName")} className="field-input" aria-invalid={Boolean(err.storeName)} {...register(n("storeName"))} />
        </Field>
        <Field id={id("storeNumber")} label="Store number" hint="Optional." error={err.storeNumber}>
          <input id={id("storeNumber")} className="field-input" aria-invalid={Boolean(err.storeNumber)} {...register(n("storeNumber"))} />
        </Field>
      </div>

      <Field id={id("addressLine1")} label="Street address" error={err.addressLine1}>
        <input
          id={id("addressLine1")}
          autoComplete="address-line1"
          className="field-input"
          aria-invalid={Boolean(err.addressLine1)}
          {...register(n("addressLine1"))}
        />
      </Field>
      <Field id={id("addressLine2")} label="Address line 2" hint="Optional. Suite, unit, or floor." error={err.addressLine2}>
        <input
          id={id("addressLine2")}
          autoComplete="address-line2"
          className="field-input"
          aria-invalid={Boolean(err.addressLine2)}
          {...register(n("addressLine2"))}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field id={id("city")} label="City" error={err.city}>
          <input
            id={id("city")}
            autoComplete="address-level2"
            className="field-input"
            aria-invalid={Boolean(err.city)}
            {...register(n("city"))}
          />
        </Field>
        <Field id={id("state")} label="State or region" error={err.state}>
          <input
            id={id("state")}
            autoComplete="address-level1"
            className="field-input"
            aria-invalid={Boolean(err.state)}
            {...register(n("state"))}
          />
        </Field>
        <Field id={id("postalCode")} label="Postal code" error={err.postalCode}>
          <input
            id={id("postalCode")}
            autoComplete="postal-code"
            className="field-input"
            aria-invalid={Boolean(err.postalCode)}
            {...register(n("postalCode"))}
          />
        </Field>
      </div>

      <Field id={id("phone")} label="Store phone" hint="Optional." error={err.phone}>
        <input id={id("phone")} type="tel" className="field-input" aria-invalid={Boolean(err.phone)} {...register(n("phone"))} />
      </Field>

      <div>
        <p className="field-label">Map pin</p>
        <p className="text-sm">
          Optional. Shoppers nearby find you through this pin. Set it while you are at the store.
        </p>
        {pinned ? (
          <p className="mt-2 text-sm font-medium tabular">
            Pinned at {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
          </p>
        ) : (
          <p className="mt-2 text-sm font-medium">No pin set</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={pinToCurrentPosition} disabled={locating}>
            <LocateFixed aria-hidden size={18} strokeWidth={1.5} />
            {locating ? "Finding location" : pinned ? "Update pin to my location" : "Use my current location"}
          </button>
          {pinned && (
            <button type="button" className="btn btn-secondary" onClick={clearPin}>
              <X aria-hidden size={18} strokeWidth={1.5} />
              Remove pin
            </button>
          )}
        </div>
        {(pinError || err.lat) && (
          <p className="field-error" role="alert">
            {pinError ?? err.lat}
          </p>
        )}
      </div>
    </div>
  );
}
