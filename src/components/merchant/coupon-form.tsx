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
import { COUPON_IMAGE_BUCKET, publicImageUrl } from "@/lib/storage";
import type { Enums } from "@/lib/supabase/database.types";
import { Field, FormMessage } from "@/components/field";
import { Ticket, formatOffer } from "@/components/ticket";
import { ImageUpload } from "@/components/merchant/image-upload";

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
};

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

  const isDraft = status === null || status === "draft";

  function submit(intent: CouponIntent) {
    return form.handleSubmit((data) => {
      setServerError(null);
      setPendingIntent(intent);
      startTransition(async () => {
        const result = await saveCoupon(couponId, data, intent);
        if (!result.ok) setServerError(result.error);
        setPendingIntent(null);
      });
    });
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
            <Field id="title" label="Title" hint="Short and specific, like Any loaf of sourdough." error={err("title")}>
              <input id="title" className="field-input" aria-invalid={Boolean(err("title"))} {...register("title")} />
            </Field>

            <fieldset>
              <legend className="field-label">Discount</legend>
              <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
                <div className="flex gap-2">
                  {(["percent", "amount"] as const).map((type) => (
                    <label
                      key={type}
                      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border-[1.5px] border-ink px-3 ${
                        values.discountType === type ? "bg-stock-sky" : "bg-white"
                      }`}
                    >
                      <input type="radio" value={type} className="size-4 accent-ink" {...register("discountType")} />
                      {type === "percent" ? "Percent off" : "Amount off"}
                    </label>
                  ))}
                </div>
                <div>
                  <label htmlFor="discountValue" className="sr-only">
                    {values.discountType === "percent" ? "Percent off" : "Dollars off"}
                  </label>
                  <div className="flex items-center gap-2">
                    {values.discountType === "amount" && <span className="font-semibold">$</span>}
                    <input
                      id="discountValue"
                      inputMode="decimal"
                      className="field-input max-w-32 tabular"
                      aria-invalid={Boolean(err("discountValue"))}
                      {...register("discountValue")}
                    />
                    {values.discountType === "percent" && <span className="font-semibold">%</span>}
                  </div>
                  {err("discountValue") && <p className="field-error">{err("discountValue")}</p>}
                </div>
              </div>
            </fieldset>

            <Field id="categoryId" label="Category" error={err("categoryId")}>
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
              label="What it applies to"
              hint="Optional. For example all bread and pastries."
              error={err("includedProducts")}
            >
              <input id="includedProducts" className="field-input" {...register("includedProducts")} />
            </Field>

            <ImageUpload
              label="Coupon image"
              hint="Optional. JPG, PNG, or WebP up to 5 MB."
              bucket={COUPON_IMAGE_BUCKET}
              businessId={businessId}
              value={values.imagePath ?? null}
              onChange={(path) => setValue("imagePath", path, { shouldDirty: true })}
            />
          </section>

          <section className="panel grid gap-5 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Dates</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="startsOn" label="Starts on" error={err("startsOn")}>
                <input id="startsOn" type="date" className="field-input tabular" {...register("startsOn")} />
              </Field>
              <Field id="expiresOn" label="Ends on" hint="Valid through the end of this day." error={err("expiresOn")}>
                <input id="expiresOn" type="date" min={today} className="field-input tabular" {...register("expiresOn")} />
              </Field>
            </div>
            <p className="text-sm">Dates follow your business timezone, {timeZone.replace(/_/g, " ")}.</p>
          </section>

          <section className="panel grid gap-5 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Conditions</h2>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field id="minSpend" label="Minimum spend ($)" hint="Optional." error={err("minSpend")}>
                <input id="minSpend" inputMode="decimal" className="field-input tabular" {...register("minSpend")} />
              </Field>
              <Field id="minQty" label="Minimum items" hint="Optional." error={err("minQty")}>
                <input id="minQty" inputMode="numeric" className="field-input tabular" {...register("minQty")} />
              </Field>
              <Field id="maxPeople" label="Most people" hint="Optional." error={err("maxPeople")}>
                <input id="maxPeople" inputMode="numeric" className="field-input tabular" {...register("maxPeople")} />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="perUserLimit" label="Uses per shopper" error={err("perUserLimit")}>
                <input id="perUserLimit" inputMode="numeric" className="field-input tabular" {...register("perUserLimit")} />
              </Field>
              <Field id="totalLimit" label="Total uses" hint="Optional. Leave blank for no cap." error={err("totalLimit")}>
                <input id="totalLimit" inputMode="numeric" className="field-input tabular" {...register("totalLimit")} />
              </Field>
            </div>
            <Field id="limitsText" label="Other fine print" hint="Optional. For example dine in only." error={err("limitsText")}>
              <input id="limitsText" className="field-input" {...register("limitsText")} />
            </Field>
          </section>

          <section className="panel grid gap-4 p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Where it works</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { all: true, label: "All stores" },
                { all: false, label: "Choose stores" },
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
                Your plan is not active yet, so you can save this as a draft. Publishing opens once Coupersville
                activates your plan.
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
                    {pendingIntent === "publish" ? "Publishing" : "Publish coupon"}
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
            offer={formatOffer(values.discountType ?? "percent", discountValue)}
            title={values.title || "Your coupon title"}
            description={values.description || undefined}
            expiresAt={previewExpires}
            timeZone={timeZone}
            limits={
              describeLimits({
                min_spend: toNumber(values.minSpend),
                min_qty: toNumber(values.minQty),
                max_people: toNumber(values.maxPeople),
                per_user_limit: toNumber(values.perUserLimit),
                limits_text: values.limitsText || null,
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
