import { rulesOf } from "@/lib/coupons";
import { formatDay, safeTimeZone } from "@/lib/dates";
import { describePerCustomer, describeSchedule } from "@/lib/rules";

// The "Good to know" list on a coupon page, also shown in the builder's preview so the merchant sees
// exactly what shoppers will read. Pure, so it runs on the server and in the browser.
export type GoodToKnowCoupon = {
  min_spend: number | string | null;
  min_qty: number | null;
  max_people: number | null;
  per_user_limit: number | null;
  redeem_frequency: string | null;
  schedule_days: number[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
  total_limit: number | null;
  limits_text: string | null;
  exclusions: string | null;
  // Null while the merchant has not chosen an end date yet.
  expires_at: string | Date | null;
};

function money(value: number) {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

export function goodToKnow(c: GoodToKnowCoupon, timeZone: string): [string, string][] {
  const tz = safeTimeZone(timeZone);
  const rules = rulesOf(c);
  const validFor = [
    c.min_qty && c.min_qty > 1 ? `At least ${c.min_qty} items` : null,
    c.max_people ? (c.max_people === 1 ? "1 person" : `Up to ${c.max_people} people`) : null,
  ].filter(Boolean);
  const facts: [string, string][] = [
    ["Minimum purchase", c.min_spend ? money(Number(c.min_spend)) : "None"],
  ];
  if (validFor.length) facts.push(["Valid for", validFor.join(", ")]);
  facts.push(["Redemption limit", describePerCustomer(rules)]);
  if (c.total_limit) facts.push(["Total available", `${c.total_limit}, while they last`]);
  facts.push(["Available", describeSchedule(rules) ?? "Any day and time while the offer runs"]);
  if (c.limits_text) facts.push(["Additional terms", c.limits_text]);
  facts.push(["Exclusions", c.exclusions || "None stated"]);
  if (c.expires_at) {
    const ends = new Date(c.expires_at);
    const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(ends);
    facts.push(["Ends", `${formatDay(ends, tz)} at ${time}`]);
  }
  return facts;
}
