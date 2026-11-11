import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { FOUNDING_OFFER, OFFER_TIME_ZONE } from "@/lib/offers";

// The founding offer (Pioneer Circle) for public pages, read from the offers table so its name, dates
// and number of free seats live in one place. Null once the offer is off, over or out of free seats.
export async function foundingCallout(): Promise<{ name: string; freeSeats: number; from: string; to: string } | null> {
  const admin = createAdminClient();
  const [{ data: offer }, { count: freeTaken }] = await Promise.all([
    admin.from("offers").select("name, active, free_seats, window_starts_at, window_ends_at").eq("code", FOUNDING_OFFER).maybeSingle(),
    admin.from("offer_seat_claims").select("id", { count: "exact", head: true }).eq("offer_code", FOUNDING_OFFER).eq("free", true),
  ]);
  if (!offer?.active || !offer.window_starts_at || !offer.window_ends_at || offer.free_seats <= 0) return null;
  if ((freeTaken ?? 0) >= offer.free_seats) return null;
  if (Date.now() >= new Date(offer.window_ends_at).getTime()) return null;

  const long = (instant: number) =>
    new Intl.DateTimeFormat("en-US", { timeZone: OFFER_TIME_ZONE, month: "long", day: "numeric", year: "numeric" }).format(instant);
  return {
    name: offer.name,
    freeSeats: offer.free_seats,
    from: long(new Date(offer.window_starts_at).getTime()),
    // The stored end is exclusive, so the last day is the day before.
    to: long(new Date(offer.window_ends_at).getTime() - 1),
  };
}
