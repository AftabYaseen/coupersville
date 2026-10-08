import type { z } from "zod";
import type { businessSchema, locationSchema } from "@/lib/validation/merchant";
import type { TablesInsert } from "@/lib/supabase/database.types";

type BusinessValues = z.output<typeof businessSchema>;
type LocationValues = z.output<typeof locationSchema>;

export function businessRow(v: BusinessValues) {
  return {
    name: v.name,
    description: v.description,
    primary_category_id: v.primaryCategoryId,
    contact_email: v.contactEmail,
    contact_phone: v.contactPhone,
    website_url: v.websiteUrl,
    timezone: v.timezone,
  } satisfies Partial<TablesInsert<"businesses">>;
}

export function locationRow(v: LocationValues) {
  return {
    store_name: v.storeName,
    store_number: v.storeNumber,
    address_line1: v.addressLine1,
    address_line2: v.addressLine2,
    city: v.city,
    state: v.state,
    postal_code: v.postalCode,
    phone: v.phone,
    geo: v.lat !== undefined && v.lng !== undefined ? `SRID=4326;POINT(${v.lng} ${v.lat})` : null,
  } satisfies Partial<TablesInsert<"locations">>;
}
