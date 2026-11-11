-- Client round 3 (2026-11-12): new membership level names. Only the names change; the codes stay,
-- so seat claims, plans, checkouts, consents and every function that reads offers by code are
-- untouched. The app reads names from this table, so later renames are one edit in Admin > Offers.
--
--   founding_merchant  Founding Merchant    -> Pioneer Circle
--   early_access       Early Access         -> Early Bird
--   general            General Membership   -> Main Street
--   merchant_plus      Merchant Plus        -> Boulevard
--   enterprise         Enterprise (Custom)  -> Build Your Route
--
-- Drops nothing. Stops without changing anything if any of the five rows is missing.

begin;

do $$
declare
  changed int;
begin
  update public.offers o
  set name = v.name
  from (values
    ('founding_merchant', 'Pioneer Circle'),
    ('early_access', 'Early Bird'),
    ('general', 'Main Street'),
    ('merchant_plus', 'Boulevard'),
    ('enterprise', 'Build Your Route')
  ) as v(code, name)
  where o.code = v.code;

  get diagnostics changed = row_count;
  if changed <> 5 then
    raise exception 'Expected to rename 5 offers, found %. Nothing was changed.', changed;
  end if;
end;
$$;

commit;
