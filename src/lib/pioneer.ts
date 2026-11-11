import "server-only";
import { cacheLife } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { FOUNDING_OFFER } from "@/lib/offers";

// The founding offer (Pioneer Circle) as the public Pioneer Circle and FAQ pages, the footer and the
// welcome step need it: its name and seat cap ("the first 200") come from the offers table, so a
// change in Admin > Offers reaches them within the hour. Cached, so these pages stay static.

export type PioneerOffer = {
  name: string;
  // Null when the offer has no seat cap; the wording then drops the number.
  seats: number | null;
  // How many of those seats come with a complimentary first year.
  freeSeats: number;
  active: boolean;
  windowStartsAt: string | null;
  windowEndsAt: string | null;
};

const FALLBACK: PioneerOffer = { name: "Pioneer Circle", seats: 200, freeSeats: 50, active: false, windowStartsAt: null, windowEndsAt: null };

export async function pioneerOffer(): Promise<PioneerOffer> {
  "use cache";
  cacheLife("hours");
  try {
    const { data } = await createAdminClient()
      .from("offers")
      .select("name, seat_cap, free_seats, active, window_starts_at, window_ends_at")
      .eq("code", FOUNDING_OFFER)
      .maybeSingle();
    if (!data) return FALLBACK;
    return { name: data.name, seats: data.seat_cap, freeSeats: data.free_seats, active: data.active, windowStartsAt: data.window_starts_at, windowEndsAt: data.window_ends_at };
  } catch {
    return FALLBACK;
  }
}

// "The first 200", or "The first" businesses when there is no cap.
export const firstSeats = (o: PioneerOffer) => (o.seats ? `first ${o.seats}` : "first");

// Our factual note (not the client's text) tying "the first 200" to the free seats, from the offers
// table: "The Pioneer Circle has 200 places. The first 50 Pioneers receive a complimentary year;
// Pioneers 51 to 200 join at the Pioneer Circle rate." Null when there is no seat cap.
export function seatsNote(o: PioneerOffer): string | null {
  if (!o.seats) return null;
  const places = `The ${o.name} has ${o.seats} places.`;
  const free = Math.min(o.freeSeats, o.seats);
  if (free <= 0) return `${places} Pioneers join at the ${o.name} rate.`;
  if (free >= o.seats) return `${places} Every Pioneer receives a complimentary year.`;
  const paid = free + 1 === o.seats ? `Pioneer ${o.seats} joins` : `Pioneers ${free + 1} to ${o.seats} join`;
  return `${places} The first ${free} Pioneers receive a complimentary year; ${paid} at the ${o.name} rate.`;
}

// Whether a business finishing setup now is joining while the offer's sign-up window is open.
// Read fresh (not cached), since it decides the welcome step.
export async function pioneerWindowOpen(now: number): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("offers")
    .select("active, window_starts_at, window_ends_at")
    .eq("code", FOUNDING_OFFER)
    .maybeSingle();
  if (!data?.active) return false;
  const starts = data.window_starts_at ? new Date(data.window_starts_at).getTime() : -Infinity;
  const ends = data.window_ends_at ? new Date(data.window_ends_at).getTime() : Infinity;
  return starts <= now && now < ends;
}
