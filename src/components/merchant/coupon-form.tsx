"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { saveCoupon } from "@/app/merchant/coupons/actions";
import { couponSchema, type CouponInput, type CouponIntent } from "@/lib/validation/merchant";
import { describeLimits } from "@/lib/coupons";
import { DAY_PATTERN, endOfDayInZone } from "@/lib/dates";
import { WEEKDAYS } from "@/lib/rules";
import { COUPON_IMAGE_BUCKET, publicImageUrl } from "@/lib/storage";
import type { Enums } from "@/lib/supabase/database.types";
import { Field, FormMessage } from "@/components/field";
import { Ticket, formatOffer } from "@/components/ticket";
import { ImageUpload } from "@/components/merchant/image-upload";

const OFFER_KINDS = [
  { value: "percent", label: "Percentage off" },
  { value: "amount", label: "Dollar amount off" },
  { value: "fixed_price", label: "Fixed price" },
  { value: "free", label: "Free" },
] as const;

const PER_USER_CHOICES = [
  { value: "once", label: "Once" },
  { value: "limited", label: "Up to" },
  { value: "unlimited", label: "Any number of times during the promotion" },
] as const;

export type CouponCategoryOption = { id: string; name: string; tint: Enums<"stock_tint"> };
export type CouponLocationOption = { id: string; label: string; active: boolean };

type Props = {
  couponId: string | null;
  status: Enums<"coupon_status"> | null;
  businessId: string;
  businessName: string;
  timeZone: string;
  today: string;
  planActive: boolean;
  categories: CouponCategoryOption[];
  locations: CouponLocationOption[];
  defaults: CouponInput;
  // Removed by Coupersville: it can be edited but never published from here.
  held?: boolean;
};

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toNumber(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function CouponForm(props: Props) {
  const { couponId, status, businessId, businessName, timeZone, today, planActive, categories, locations, defaults } = props;
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<CouponIntent | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm({ resolver: zodResolver(couponSchema), defaultValues: defaults });
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = form;
  const values = useWatch({ control });

  const isDraft = (status === null || status === "draft") && !props.held;

  function submit(intent: CouponIntent) {
    return form.handleSubmit(
      (data) => {
      setServerError(null);
      setPendingIntent(intent);
      startTransition(async () => {
        const result = await saveCoupon(couponId, data, intent);
        if (!result.ok) setServerError(result.error);
        setPendingIntent(null);
      });
      },
      () => setServerError(
        intent === "publish"
          ? "Please complete the highlighted fields before publishing this coupon."
          : "Please complete the highlighted fields before saving this coupon.",
      ),
    );
  }

  const category = categories.find((c) => c.id === values.categoryId);
  const discountValue = toNumber(values.discountValue) ?? 0;
  const chosenIds = values.locationIds ?? [];
  const storeText = values.allLocations
    ? "All stores"
    : locations
        .filter((l) => chosenIds.includes(l.id))
        .map((l) => l.label)
        .join(", ") || "Choose stores";
  const previewExpires =
    values.expiresOn && DAY_PATTERN.test(values.expiresOn) ? endOfDayInZone(values.expiresOn, timeZone) : undefined;

  function toggleDay(iso: number, checked: boolean) {
    const current = values.scheduleDays ?? [];
    const next = checked ? [...current, iso] : current.filter((d) => d !== iso);
    setValue("scheduleDays", next.sort((a, b) => Number(a) - Number(b)) as number[], {
      shouldValidate: form.formState.isSubmitted,
      shouldDirty: true,
    });
  }

  function toggleLocation(id: string, checked: boolean) {
    const next = checked ? [...chosenIds, id] : chosenIds.filter((x) => x !== id);
    setValue("locationIds", next as string[], { shouldValidate: form.formState.isSubmitted, shouldDirty: true });
  }

  const err = (name: keyof typeof errors) => errors[name]?.message as string | undefined;

  return (
    <FormProvider {...form}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <form onSubmit={submit(isDraft ? "draft" : "save")} noValidate className="grid gap-6">
          {serverError && <FormMessage tone="error">{serverError}</FormMessage>}

          <section className="panel grid gap-5 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">The offer</h2>
            <Field id="title" label="Offer title" hint="Example: 20% off Tuesday lunch." error={err("title")}>
              <input id="title" className="field-input" aria-invalid={Boolean(err("title"))} {...register("title")} />
            </Field>

            <fieldset>
              <legend className="field-label">Discount type</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {OFFER_KINDS.map((kind) => (
                  <label
                    key={kind.value}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border-[1.5px] border-ink px-3 ${
                      values.discountType === kind.value ? "bg-stock-sky" : "bg-white"
                    }`}
                  >
                    <input type="radio" value={kind.value} className="size-4 accent-ink" {...register("discountType")} />
                    {kind.label}
                  </label>
                ))}
              </div>
              {values.discountType === "free" ? (
                <p className="mt-2 text-sm">
                  Say what is free in the title, for example Free coffee with any pastry. If a purchase is required, say so in the title
                  or the minimum purchase.
                </p>
              ) : (
                <div className="mt-3">
                  <label htmlFor="discountValue" className="field-label">
                    {values.discountType === "percent"
                      ? "Discount value, percentage"
                      : values.discountType === "fixed_price"
                        ? "Price"
                        : "Discount value, dollars"}
                  </label>
                  <div className="flex items-center gap-2">
                    {values.discountType !== "percent" && <span className="font-semibold">$</span>}
                    <input
                      id="discountValue"
                      inputMode="decimal"
                      className="field-input max-w-32 tabular"
                      aria-invalid={Boolean(err("discountValue"))}
                      {...register("discountValue")}
                    />
                    {values.discountType === "percent" && <span className="font-semibold">%</span>}
                  </div>
                  {values.discountType !== "fixed_price" && <p className="mt-1.5 text-sm">Enter the percentage or dollar amount.</p>}
                  {values.discountType === "fixed_price" && (
                    <p className="mt-1.5 text-sm">What the customer pays. Name the item in the title, like Regular coffee.</p>
                  )}
                  {err("discountValue") && <p className="field-error">{err("discountValue")}</p>}
                </div>
              )}
            </fieldset>

            <Field id="categoryId" label="Category" hint="Choose the category customers are most likely to browse." error={err("categoryId")}>
              <select id="categoryId" className="field-input" aria-invalid={Boolean(err("categoryId"))} {...register("categoryId")}>
                <option value="">Choose a category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="description" label="Description" hint="Optional." error={err("description")}>
              <textarea id="description" rows={3} className="field-input py-2" {...register("description")} />
            </Field>

            <Field
              id="includedProducts"
              label="Eligible products or services"
              hint="Describe exactly what is included. Optional."
              error={err("includedProducts")}
            >
              <input id="includedProducts" className="field-input" {...register("includedProducts")} />
            </Field>

            <ImageUpload
              label="Coupon image"
              hint="Optional. Upload a clear image that represents the offer. JPG, PNG or WebP, up to 5 MB."
              bucket={COUPON_IMAGE_BUCKET}
              businessId={businessId}
              value={values.imagePath ?? null}
              onChange={(path) => setValue("imagePath", path, { shouldDirty: true })}
            />
          </section>

          <section className="panel grid gap-5 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Dates</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="startsOn" label="Start date" hint="Choose when the offer becomes visible and redeemable." error={err("startsOn")}>
                <input id="startsOn" type="date" className="field-input tabular" {...register("startsOn")} />
              </Field>
              <Field id="expiresOn" label="Expiration date" hint="Choose the last date the offer may be redeemed. Valid through the end of this day." error={err("expiresOn")}>
                <input id="expiresOn" type="date" min={today} className="field-input tabular" {...register("expiresOn")} />
              </Field>
            </div>
            <p className="text-sm">Dates follow your business timezone, {timeZone.replace(/_/g, " ")}.</p>
          </section>

          <section className="panel grid gap-5 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Conditions</h2>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field id="minSpend" label="Minimum purchase ($)" hint="Optional. Enter the minimum amount required." error={err("minSpend")}>
                <input id="minSpend" inputMode="decimal" className="field-input tabular" {...register("minSpend")} />
              </Field>
              <Field id="minQty" label="Quantity" hint="Optional. Minimum items, for example 2." error={err("minQty")}>
                <input id="minQty" inputMode="numeric" className="field-input tabular" {...register("minQty")} />
              </Field>
              <Field id="maxPeople" label="Party limit" hint="Optional. For example up to 4 people." error={err("maxPeople")}>
                <input id="maxPeople" inputMode="numeric" className="field-input tabular" {...register("maxPeople")} />
              </Field>
            </div>
            <Field id="totalLimit" label="Total uses" hint="Optional. Leave blank for no cap." error={err("totalLimit")}>
              <input id="totalLimit" inputMode="numeric" className="field-input max-w-40 tabular" {...register("totalLimit")} />
            </Field>
            <Field
              id="limitsText"
              label="Additional terms"
              hint="Optional. Add exclusions and other important conditions. Set eligible days and times under How often."
              error={err("limitsText")}
            >
              <input id="limitsText" className="field-input" {...register("limitsText")} />
            </Field>
          </section>

          <section className="panel grid gap-5 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">How often</h2>
            <fieldset>
              <legend className="field-label">Each customer can use it</legend>
              <div className="grid gap-2">
                {PER_USER_CHOICES.map((choice) => (
                  <div key={choice.value} className="flex flex-wrap items-center gap-3">
                    <label className="flex min-h-11 cursor-pointer items-center gap-3">
                      <input type="radio" value={choice.value} className="size-5 accent-ink" {...register("perUserMode")} />
                      <span>{choice.label}</span>
                    </label>
                    {choice.value === "limited" && values.perUserMode === "limited" && (
                      <span className="flex items-center gap-2">
                        <label htmlFor="perUserLimit" className="sr-only">
                          Times per customer
                        </label>
                        <input
                          id="perUserLimit"
                          inputMode="numeric"
                          className="field-input max-w-24 tabular"
                          aria-invalid={Boolean(err("perUserLimit"))}
                          {...register("perUserLimit")}
                        />
                        <span>times</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {err("perUserLimit") && <p className="field-error">{err("perUserLimit")}</p>}
            </fieldset>

            {values.perUserMode !== "once" && (
              <Field id="redeemFrequency" label="At most" error={err("redeemFrequency")}>
                <select id="redeemFrequency" className="field-input max-w-64" {...register("redeemFrequency")}>
                  <option value="none">No extra limit</option>
                  <option value="day">Once a day per customer</option>
                  <option value="week">Once a week per customer</option>
                </select>
              </Field>
            )}

            <label className="flex min-h-11 cursor-pointer items-center gap-3 font-medium">
              <input type="checkbox" className="size-5 accent-ink" {...register("scheduleOn")} />
              Only on certain days or times
            </label>
            {values.scheduleOn && (
              <div className="grid gap-4">
                <fieldset>
                  <legend className="field-label">Days</legend>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((d) => {
                      const on = (values.scheduleDays ?? []).includes(d.iso);
                      return (
                        <label
                          key={d.iso}
                          className={`flex min-h-11 min-w-14 cursor-pointer items-center justify-center rounded-sm border-[1.5px] border-ink px-2 font-medium ${
                            on ? "bg-ink text-white" : "bg-white text-ink"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={on}
                            onChange={(e) => toggleDay(d.iso, e.target.checked)}
                          />
                          <span aria-hidden>{d.short}</span>
                          <span className="sr-only">{d.long}</span>
                        </label>
                      );
                    })}
                  </div>
                  {errors.scheduleDays?.message && <p className="field-error">{errors.scheduleDays.message}</p>}
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="scheduleStart" label="From" hint="Optional." error={err("scheduleStart")}>
                    <input id="scheduleStart" type="time" className="field-input tabular" {...register("scheduleStart")} />
                  </Field>
                  <Field id="scheduleEnd" label="Until" hint="Optional." error={err("scheduleEnd")}>
                    <input id="scheduleEnd" type="time" className="field-input tabular" {...register("scheduleEnd")} />
                  </Field>
                </div>
                <p className="text-sm">Times follow your business timezone, {timeZone.replace(/_/g, " ")}.</p>
              </div>
            )}
          </section>

          <section className="panel grid gap-4 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Participating locations</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { all: true, label: "All locations" },
                { all: false, label: "Selected locations" },
              ].map((opt) => (
                <label
                  key={opt.label}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border-[1.5px] border-ink px-3 ${
                    values.allLocations === opt.all ? "bg-stock-sky" : "bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="allLocationsChoice"
                    className="size-4 accent-ink"
                    checked={values.allLocations === opt.all}
                    onChange={() => setValue("allLocations", opt.all, { shouldDirty: true })}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {!values.allLocations && (
              <fieldset>
                <legend className="sr-only">Stores</legend>
                <div className="grid gap-2">
                  {locations.map((loc) => (
                    <label key={loc.id} className="flex min-h-11 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-5 accent-ink"
                        checked={chosenIds.includes(loc.id)}
                        onChange={(e) => toggleLocation(loc.id, e.target.checked)}
                      />
                      <span>
                        {loc.label}
                        {!loc.active && <span className="ml-2 text-sm text-signal">Closed</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {errors.locationIds?.message && <p className="field-error">{errors.locationIds.message}</p>}
          </section>

          <div className="grid gap-3">
            {isDraft && !planActive && (
              <p className="text-sm">
                You need an active membership to publish. Save this as a draft for now, then{" "}
                <Link href="/merchant/billing" className="font-medium text-ink underline underline-offset-4">
                  see your membership options
                </Link>
                .
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {isDraft ? (
                <>
                  <button
                    type="button"
                    className="btn"
                    disabled={pending || !planActive}
                    onClick={() => void submit("publish")()}
                  >
                    {pendingIntent === "publish" ? "Publishing" : "Publish now"}
                  </button>
                  <button type="submit" className="btn btn-secondary" disabled={pending}>
                    {pendingIntent === "draft" ? "Saving" : "Save draft"}
                  </button>
                </>
              ) : (
                <button type="submit" className="btn" disabled={pending}>
                  {pendingIntent === "save" ? "Saving" : "Save changes"}
                </button>
              )}
              <Link href="/merchant/coupons" className="btn btn-secondary">
                Cancel
              </Link>
            </div>
          </div>
        </form>

        <aside className="lg:sticky lg:top-6" aria-label="Preview">
          <p className="mb-3 font-medium">Preview</p>
          <Ticket
            tint={category?.tint ?? "sky"}
            merchant={businessName}
            offer={formatOffer(values.discountType ?? "percent", values.discountType === "free" ? null : discountValue)}
            title={values.title || "Your coupon title"}
            description={text(values.description) || undefined}
            expiresAt={previewExpires}
            timeZone={timeZone}
            limits={
              describeLimits({
                min_spend: toNumber(values.minSpend),
                min_qty: toNumber(values.minQty),
                max_people: toNumber(values.maxPeople),
                per_user_limit:
                  values.perUserMode === "once" ? 1 : values.perUserMode === "limited" ? toNumber(values.perUserLimit) : null,
                redeem_frequency: values.perUserMode === "once" || values.redeemFrequency === "none" ? null : values.redeemFrequency,
                schedule_days:
                  values.scheduleOn && values.scheduleDays && values.scheduleDays.length < 7
                    ? (values.scheduleDays as number[])
                    : null,
                schedule_start: values.scheduleOn && values.scheduleStart && values.scheduleEnd ? text(values.scheduleStart) : null,
                schedule_end: values.scheduleOn && values.scheduleStart && values.scheduleEnd ? text(values.scheduleEnd) : null,
                limits_text: text(values.limitsText) || null,
              }) || undefined
            }
            store={storeText}
          >
            {values.imagePath && (
              <div className="relative mt-4 aspect-[16/9] overflow-hidden rounded-sm border-[1.5px] border-ink">
                <Image
                  src={publicImageUrl(COUPON_IMAGE_BUCKET, values.imagePath)}
                  alt=""
                  fill
                  sizes="300px"
                  className="object-cover"
                />
              </div>
            )}
          </Ticket>
        </aside>
      </div>
    </FormProvider>
  );
}
