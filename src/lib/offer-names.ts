import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ENTERPRISE_OFFER, FOUNDING_OFFER } from "@/lib/offers";

// Membership level names come from the offers table (Admin > Offers), so renaming a level is one
// edit there. Codes never change. The fallbacks are used only if the table cannot be read.
const FALLBACK = {
  [FOUNDING_OFFER]: "Pioneer Circle",
  early_access: "Early Bird",
  general: "Main Street",
  merchant_plus: "Boulevard",
  [ENTERPRISE_OFFER]: "Build Your Route",
} as Record<string, string>;

export type OfferNames = {
  founding: string;
  earlyAccess: string;
  general: string;
  plus: string;
  enterprise: string;
  of: (code: string | null | undefined) => string | null;
};

export function namesFrom(rows: { code: string; name: string }[]): OfferNames {
  const map = new Map(rows.map((r) => [r.code, r.name]));
  const of = (code: string | null | undefined) => (code ? (map.get(code) ?? FALLBACK[code] ?? null) : null);
  return {
    founding: of(FOUNDING_OFFER)!,
    earlyAccess: of("early_access")!,
    general: of("general")!,
    plus: of("merchant_plus")!,
    enterprise: of(ENTERPRISE_OFFER)!,
    of,
  };
}

export const offerNames = cache(async (): Promise<OfferNames> => {
  const { data } = await createAdminClient().from("offers").select("code, name");
  return namesFrom(data ?? []);
});
