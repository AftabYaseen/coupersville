-- Client round 1, item 4: two more kinds of offer.
--   fixed_price: the item costs this much ("$1 regular coffee"); discount_value is the price.
--   free: the item or service is free; discount_value is empty.
-- Added on their own: Postgres cannot use a new enum value in the transaction that adds it.

alter type public.discount_type add value if not exists 'fixed_price';
alter type public.discount_type add value if not exists 'free';
