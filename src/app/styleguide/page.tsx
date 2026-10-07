import type { Metadata } from "next";
import { Ticket, formatOffer } from "@/components/ticket";

export const metadata: Metadata = { title: "Ticket style" };

const SWATCHES = [
  ["ink", "bg-ink"],
  ["ink-deep", "bg-ink-deep"],
  ["marigold", "bg-marigold"],
  ["paper", "bg-paper"],
  ["white", "bg-white"],
  ["signal", "bg-signal"],
  ["stock-mint", "bg-stock-mint"],
  ["stock-pink", "bg-stock-pink"],
  ["stock-sky", "bg-stock-sky"],
  ["stock-butter", "bg-stock-butter"],
] as const;

export default function StyleguidePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="wordmark text-4xl text-ink">New on Main Street</h1>
      <p className="mt-2 max-w-prose">
        Sample tickets in each stock tint. Each category prints its coupons on one of these four colours.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Ticket
          tint="mint"
          merchant="Rosa's Kitchen"
          offer={formatOffer("percent", 15)}
          title="Dinner for two"
          description="Any two mains from the evening menu."
          expiresAt="2026-11-30T23:59:00Z"
          limits="Dine in only. Not valid on holidays."
          store="4 Elm Street"
        />
        <Ticket
          tint="pink"
          merchant="Corner Grocer"
          offer={formatOffer("amount", 5)}
          title="Weekly shop"
          expiresAt="2026-10-10T23:59:00Z"
          expiringSoon
          limits="Minimum spend $40"
          store="All locations"
        />
        <Ticket
          tint="sky"
          merchant="Little Wheels Toys"
          offer={formatOffer("percent", 30)}
          title="Wooden puzzles"
          expiresAt="2027-01-15T23:59:00Z"
          limits="One per customer"
          store="22 Mill Road"
          stubActions={
            <button type="button" className="btn w-full">
              Redeem now
            </button>
          }
        />
        <Ticket
          tint="butter"
          merchant="Main Street Bakery"
          offer={formatOffer("amount", 2.5)}
          title="Any dozen cookies"
          expiresAt="2026-12-31T23:59:00Z"
          store="12 Main Street"
          stubActions={
            <button type="button" className="btn btn-secondary w-full">
              Save coupon
            </button>
          }
        />
      </div>

      <h2 className="mt-12 text-2xl font-semibold">Buttons</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className="btn">
          Publish coupon
        </button>
        <button type="button" className="btn btn-secondary">
          Save draft
        </button>
        <button type="button" className="btn" disabled>
          Redeem now
        </button>
      </div>

      <h2 className="mt-12 text-2xl font-semibold">Colours</h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {SWATCHES.map(([name, bg]) => (
          <li key={name} className="panel overflow-hidden">
            <div className={`h-14 border-b-[1.5px] border-ink ${bg}`} />
            <p className="px-3 py-2 text-sm font-medium">{name}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
