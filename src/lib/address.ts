// One line for a store's address, for maps links: "12 Main St, Suite 2, Springfield, IL 62701, United States".
export function storeAddress(s: {
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country?: string | null;
}): string {
  return [s.address_line1, s.address_line2, s.city, [s.state, s.postal_code].filter(Boolean).join(" "), s.country]
    .filter(Boolean)
    .join(", ");
}
