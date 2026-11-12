"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { updateOffer } from "@/app/admin/offers/actions";
import { Field, FormMessage } from "@/components/field";
import type { OfferInput } from "@/lib/validation/admin";

type Props = {
  code: string;
  defaults: OfferInput;
  // Other offers this one can renew into.
  renewOptions: { code: string; name: string }[];
  seatsUsed: number;
  freeSeatsUsed: number;
};

export function OfferForm({ code, defaults, renewOptions, seatsUsed, freeSeatsUsed }: Props) {
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit } = useForm<OfferInput>({ defaultValues: defaults });
  const id = (name: string) => `offer-${code}-${name}`;

  const onSubmit = handleSubmit((values) => {
    setMessage(null);
    startTransition(async () => {
      const r = await updateOffer(code, values);
      setMessage(r.ok ? { tone: "success", text: r.message ?? "Saved." } : { tone: "error", text: r.error });
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <Field id={id("name")} label="Name">
        <input id={id("name")} className="field-input" {...register("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id("starts")} label="Sign-up opens on" hint="Blank means already open.">
          <input id={id("starts")} type="date" className="field-input tabular" {...register("startsOn")} />
        </Field>
        <Field id={id("ends")} label="Last day of sign-up" hint="Blank means no end.">
          <input id={id("ends")} type="date" className="field-input tabular" {...register("endsOn")} />
        </Field>
        <Field id={id("cap")} label="Seat cap" hint={`${seatsUsed} taken. Blank means no cap.`}>
          <input id={id("cap")} type="number" min={Math.max(1, seatsUsed)} inputMode="numeric" className="field-input tabular" {...register("seatCap")} />
        </Field>
        <Field id={id("free")} label="Free seats" hint={`${freeSeatsUsed} taken.`}>
          <input id={id("free")} type="number" min={freeSeatsUsed} inputMode="numeric" className="field-input tabular" {...register("freeSeats")} />
        </Field>
        <Field id={id("annual")} label="Annual price, USD">
          <input id={id("annual")} type="number" min={0} step="0.01" inputMode="decimal" className="field-input tabular" {...register("annualPrice")} />
        </Field>
        <Field id={id("monthly")} label="Monthly price, USD" hint="Blank means annual only.">
          <input id={id("monthly")} type="number" min={0} step="0.01" inputMode="decimal" className="field-input tabular" {...register("monthlyPrice")} />
        </Field>
        <Field id={id("term")} label="Term">
          <select id={id("term")} className="field-input" {...register("term")}>
            <option value="12">12 months</option>
            <option value="ongoing">Ongoing</option>
          </select>
        </Field>
        <Field id={id("renews")} label="Renews into">
          <select id={id("renews")} className="field-input" {...register("renewsInto")}>
            <option value="">Nothing</option>
            {renewOptions.map((o) => (
              <option key={o.code} value={o.code}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id("locations")} label="Most locations" hint="Active stores. Blank means unlimited.">
          <input id={id("locations")} type="number" min={1} inputMode="numeric" className="field-input tabular" {...register("maxLocations")} />
        </Field>
        <Field
          id={id("campaigns")}
          label="Campaigns per location per month"
          hint="First publishes per calendar month, times the business's open stores. Blank means unlimited."
        >
          <input id={id("campaigns")} type="number" min={1} inputMode="numeric" className="field-input tabular" {...register("campaignsPerLocation")} />
        </Field>
        <Field
          id={id("private")}
          label="Just for You offers per month"
          hint="Per business, while they do not count as campaigns (Admin > Settings). Blank means unlimited."
        >
          <input id={id("private")} type="number" min={1} inputMode="numeric" className="field-input tabular" {...register("privateOffersPerMonth")} />
        </Field>
        <Field id={id("coupons")} label="Most live coupons" hint="Stored, not enforced yet. Blank means unlimited.">
          <input id={id("coupons")} type="number" min={1} inputMode="numeric" className="field-input tabular" {...register("maxLiveCoupons")} />
        </Field>
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="size-5 accent-ink" {...register("active")} />
        <span>Active</span>
      </label>
      <button type="submit" className="btn justify-self-start" disabled={pending}>
        {pending ? "Saving" : "Save offer"}
      </button>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
    </form>
  );
}
