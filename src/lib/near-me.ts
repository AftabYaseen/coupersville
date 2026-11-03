// Near me: the shopper's location, rounded to 3 decimal places (about 110 m), is kept in a short-lived
// first-party cookie and never put in a web address, so it does not reach request logs. The search
// address carries only near=1.

export const NEAR_COOKIE = "cpv_near";
export const NEAR_MAX_AGE_S = 30 * 60;

export const roundCoord = (n: number) => Math.round(n * 1000) / 1000;

export type NearLocation = { lat: number; lng: number };

export function nearCookieValue({ lat, lng }: NearLocation): string {
  return `${roundCoord(lat).toFixed(3)},${roundCoord(lng).toFixed(3)}`;
}

export function parseNearCookie(value: string | undefined): NearLocation | null {
  const m = value?.match(/^(-?\d{1,2}\.\d{3}),(-?\d{1,3}\.\d{3})$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
