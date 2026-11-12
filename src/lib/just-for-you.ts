// Just for You private offers. A coupon with visibility "private" is left out of every public list
// (live_coupons), opens only through its private link, and can be redeemed once in total. The
// database enforces all of this; these are only the names and the link.

// What merchants see. Shoppers only ever see "Just for You".
export const PRIVATE_OFFER_LABEL = "Private Offer – Just for You";
export const SHOPPER_LABEL = "Just for You";

export const PRIVATE_KEY_PATTERN = /^[0-9a-f]{32}$/;

export function privateOfferPath(key: string): string {
  return `/just-for-you/${key}`;
}
