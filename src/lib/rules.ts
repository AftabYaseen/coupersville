import { addDays, dayInZone, safeTimeZone, zonedTimeToUtc } from "@/lib/dates";

// A coupon's redemption rules, as merchants set them. Postgres (coupon_rule_problem) decides
// whether a redemption may happen; this file only puts the rules into words and works out when
// the coupon is next available, so the app can explain and grey out Redeem.

export type Frequency = "day" | "week";

export type CouponRules = {
  per_user_limit: number | null;
  redeem_frequency: Frequency | null;
  schedule_days: number[] | null; // ISO weekdays: 1 Monday to 7 Sunday
  schedule_start: string | null; // "HH:MM" or "HH:MM:SS"
  schedule_end: string | null;
};

export const WEEKDAYS = [
  { iso: 1, short: "Mon", long: "Monday" },
  { iso: 2, short: "Tue", long: "Tuesday" },
  { iso: 3, short: "Wed", long: "Wednesday" },
  { iso: 4, short: "Thu", long: "Thursday" },
  { iso: 5, short: "Fri", long: "Friday" },
  { iso: 6, short: "Sat", long: "Saturday" },
  { iso: 7, short: "Sun", long: "Sunday" },
] as const;

export function asFrequency(value: unknown): Frequency | null {
  return value === "day" || value === "week" ? value : null;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

// "11am", "3:30pm", "noon", "midnight"
export function formatClock(time: string): string {
  const total = minutesOf(time);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (m === 0 && h === 12) return "noon";
  if (m === 0 && (h === 0 || h === 24)) return "midnight";
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

function listWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function describeDays(days: number[] | null): string | null {
  if (!days || days.length === 0 || days.length === 7) return null;
  const set = [...new Set(days)].sort((a, b) => a - b);
  const key = set.join(",");
  if (key === "1,2,3,4,5") return "Weekdays";
  if (key === "6,7") return "Weekends";
  return listWords(set.map((d) => `${WEEKDAYS[d - 1].long}s`));
}

// "Tuesdays, 11am to 3pm", "Weekdays", "Every day, 11am to 3pm", or null when always available.
export function describeSchedule(rules: Pick<CouponRules, "schedule_days" | "schedule_start" | "schedule_end">): string | null {
  const days = describeDays(rules.schedule_days);
  const window =
    rules.schedule_start && rules.schedule_end
      ? `${formatClock(rules.schedule_start)} to ${formatClock(rules.schedule_end)}`
      : null;
  if (!days && !window) return null;
  if (!days) return `Every day, ${window}`;
  return window ? `${days}, ${window}` : days;
}

// "One per customer", "Up to 3 per customer, once a day", "No limit per customer".
export function describePerCustomer(rules: Pick<CouponRules, "per_user_limit" | "redeem_frequency">): string {
  const often = rules.redeem_frequency === "day" ? "once a day" : rules.redeem_frequency === "week" ? "once a week" : null;
  if (rules.per_user_limit === 1) return "One per customer";
  if (rules.per_user_limit && rules.per_user_limit > 1) {
    return often ? `Up to ${rules.per_user_limit} per customer, ${often}` : `Up to ${rules.per_user_limit} per customer`;
  }
  return often ? `${often[0].toUpperCase()}${often.slice(1)} per customer` : "No limit per customer";
}

type LocalNow = { day: string; isoDay: number; minutes: number };

function localNow(now: number, tz: string): LocalNow {
  const zone = safeTimeZone(tz);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const isoDay = WEEKDAYS.findIndex((w) => w.short === get("weekday")) + 1;
  return { day: dayInZone(now, zone), isoDay, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function dayAllowed(rules: CouponRules, isoDay: number) {
  return !rules.schedule_days || rules.schedule_days.length === 0 || rules.schedule_days.includes(isoDay);
}

// Matches coupon_rule_problem: the day must be allowed, and the time inside the window
// (start included, end excluded).
export function isWithinSchedule(rules: CouponRules, tz: string, now = Date.now()): boolean {
  const local = localNow(now, tz);
  if (!dayAllowed(rules, local.isoDay)) return false;
  if (!rules.schedule_start || !rules.schedule_end) return true;
  return local.minutes >= minutesOf(rules.schedule_start) && local.minutes < minutesOf(rules.schedule_end);
}

// The next moment the schedule opens, or null if it is open now or has no schedule.
export function nextOpening(rules: CouponRules, tz: string, now = Date.now()): Date | null {
  if (isWithinSchedule(rules, tz, now)) return null;
  const local = localNow(now, tz);
  const startMinutes = rules.schedule_start ? minutesOf(rules.schedule_start) : 0;
  for (let offset = 0; offset <= 7; offset += 1) {
    const isoDay = ((local.isoDay - 1 + offset) % 7) + 1;
    if (!dayAllowed(rules, isoDay)) continue;
    if (offset === 0 && local.minutes >= startMinutes) continue;
    const day = addDays(local.day, offset);
    return zonedTimeToUtc(day, Math.floor(startMinutes / 60), startMinutes % 60, tz);
  }
  return null;
}

// When a once-a-day or once-a-week limit resets: next midnight, or next Monday at midnight.
export function frequencyResetsAt(frequency: Frequency, tz: string, now = Date.now()): Date {
  const local = localNow(now, tz);
  const days = frequency === "day" ? 1 : 8 - local.isoDay;
  return zonedTimeToUtc(addDays(local.day, days), 0, 0, tz);
}

// "today at 11am", "tomorrow at 11am", "Tuesday at 11am", "Tuesday, Nov 4 at 11am"
export function formatWhen(at: Date, tz: string, now = Date.now()): string {
  const zone = safeTimeZone(tz);
  const today = dayInZone(now, zone);
  const day = dayInZone(at, zone);
  const clock = formatClock(
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at),
  );
  if (day === today) return `today at ${clock}`;
  if (day === addDays(today, 1)) return `tomorrow at ${clock}`;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long" }).format(at);
  if (day <= addDays(today, 6)) return `${weekday} at ${clock}`;
  const date = new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric" }).format(at);
  return `${weekday}, ${date} at ${clock}`;
}

// Words for the two rule failures, used for shoppers and staff alike.
export function outsideScheduleText(rules: CouponRules, tz: string, now = Date.now()) {
  const schedule = describeSchedule(rules);
  const next = nextOpening(rules, tz, now);
  return {
    title: "Not available right now",
    body: `${schedule ? `Available ${/^(Every|Weekdays|Weekends)/.test(schedule) ? schedule.toLowerCase() : schedule}.` : ""}${
      next ? ` Next available ${formatWhen(next, tz, now)}.` : ""
    }`.trim(),
  };
}

export function frequencyLimitText(frequency: Frequency, tz: string, now = Date.now()) {
  const resets = frequencyResetsAt(frequency, tz, now);
  return {
    title: frequency === "day" ? "Already used today" : "Already used this week",
    body: `This coupon can be used once a ${frequency} per customer. It can be used again ${formatWhen(resets, tz, now)}.`,
  };
}
