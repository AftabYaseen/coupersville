import { formatDay } from "@/lib/dates";
import { formatPrice, type Offer } from "@/lib/offers";

// Automatic-renewal terms (New York General Business Law 527-a): the price, billing cycle, renewal
// date, renewal price and how to cancel, shown next to an unticked box before payment. The same text
// is checked again on the server, recorded with the time it was agreed, and repeated in the email
// sent after purchase. Plain module: the billing page and the server actions both build it.

export type Cycle = "annual" | "monthly";
type Priced = Pick<Offer, "name" | "annual_price_cents" | "monthly_price_cents" | "term_months">;

const DAY_MS = 86_400_000;

export const CANCEL_TERMS =
  "You can cancel anytime online: go to Billing and choose Cancel renewal. Your plan stays active until the end of the period you have paid for. Payments already made are not refunded.";

// Adds whole months the way Postgres does: the 31st plus one month is the last day of the next month.
export function addMonths(instant: number | string | Date, months: number): Date {
  const d = new Date(instant);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function price(offer: Priced, cycle: Cycle): { cycle: Cycle; cents: number } {
  const cents = cycle === "monthly" ? offer.monthly_price_cents : offer.annual_price_cents;
  return cents ? { cycle, cents } : { cycle: "annual", cents: offer.annual_price_cents };
}
const per = (cycle: Cycle) => (cycle === "monthly" ? "a month" : "a year");
const every = (cycle: Cycle) => (cycle === "monthly" ? "every month" : "every year");
const renewalPrice = (next: Priced, cycle: Cycle) => {
  const p = price(next, cycle);
  return `${formatPrice(p.cents)} ${per(p.cycle)} (the ${next.name} price today; each renewal is charged at the ${next.name} price on its renewal date)`;
};

// Buying an offer at checkout. `next` is the offer it renews into once its term ends.
export function purchaseTerms({ offer, next, cycle, now, timeZone }: { offer: Priced; next: Priced | null; cycle: Cycle; now: number; timeZone: string }): string {
  const first = price(offer, cycle);
  const day = (months: number) => formatDay(addMonths(now, months), timeZone);
  const term = offer.term_months;
  const then = next ?? offer;
  let text: string;
  if (term && first.cycle === "monthly") {
    text =
      `You pay ${formatPrice(first.cents)} today and ${formatPrice(first.cents)} a month for ${term} months of ${offer.name}, billed monthly, next on ${day(1)}. ` +
      `Your plan then renews automatically on ${day(term)} as ${then.name} at ${renewalPrice(then, "monthly")}, and ${every("monthly")} after that until you cancel.`;
  } else if (term) {
    const years = term === 12 ? "your first year" : `your first ${term} months`;
    text =
      `You pay ${formatPrice(first.cents)} today for ${years} of ${offer.name}, billed once. ` +
      `Your plan renews automatically on ${day(term)} as ${then.name} at ${renewalPrice(then, "annual")}, and ${every("annual")} after that until you cancel.`;
  } else {
    const months = first.cycle === "monthly" ? 1 : 12;
    text =
      `You pay ${formatPrice(first.cents)} today for ${first.cycle === "monthly" ? "one month" : "one year"} of ${offer.name}, billed ${first.cycle === "monthly" ? "monthly" : "yearly"}. ` +
      `Your plan renews automatically on ${day(months)} at ${renewalPrice(offer, first.cycle)}, and ${every(first.cycle)} after that until you cancel.`;
  }
  return `${text} ${CANCEL_TERMS}`;
}

// A free founding seat (`free`, Pioneer Circle) adding a card, so the plan continues on `next` (Main
// Street) when the free year ends. Free seats are charged up to a day early, so coupons never drop out.
export function continueTerms({
  free,
  next,
  cycle,
  endsAt,
  timeZone,
}: {
  free: Pick<Offer, "name">;
  next: Priced;
  cycle: Cycle;
  endsAt: string;
  timeZone: string;
}): string {
  const p = price(next, cycle);
  const ends = formatDay(endsAt, timeZone);
  const charged = formatDay(new Date(new Date(endsAt).getTime() - DAY_MS), timeZone);
  return (
    `Your free ${free.name} year ends on ${ends}. Your plan then continues automatically as ${next.name} at ${renewalPrice(next, p.cycle)}, ` +
    `charged to this card on ${charged} or ${ends}, and ${every(p.cycle)} after that until you cancel. Nothing is charged before then. ${CANCEL_TERMS}`
  );
}
