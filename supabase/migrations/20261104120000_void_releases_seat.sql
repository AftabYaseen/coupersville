-- A checkout told to void because its seat is gone no longer holds a seat.
--
-- checkout_start_resolving marks the checkout 'resolving' before deciding. On the void path the
-- checkout kept holds_seat = true, so offer_seats_in_use counted it as a seat until the void at
-- Authorize.net was recorded. If that void had to be retried, the dead checkout went on blocking the
-- seat and a real merchant could be told the seats were gone. Found by the rolled-back seat-race
-- test on 2026-11-04 (3 seats counted against a cap of 2). Now the void path releases the seat and
-- records outcome 'seats_gone', so a retried call still voids instead of capturing a seatless
-- payment. Only this function changes.

create or replace function public.checkout_start_resolving(p_checkout_id uuid, p_trans_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.checkouts%rowtype;
  v_offer public.offers%rowtype;
begin
  select * into v_checkout from public.checkouts k where k.id = p_checkout_id for update;
  if v_checkout.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_checkout.status in ('captured', 'voided', 'failed') then
    return jsonb_build_object('result', v_checkout.status);
  end if;
  if v_checkout.anet_trans_id is not null and v_checkout.anet_trans_id <> p_trans_id then
    return jsonb_build_object('result', 'trans_mismatch');
  end if;
  if v_checkout.status = 'resolving' and v_checkout.resolving_until > now() then
    return jsonb_build_object('result', 'busy');
  end if;

  select * into v_offer from public.offers o where o.code = v_checkout.offer_code for update;
  update public.checkouts
     set status = 'resolving', anet_trans_id = p_trans_id, resolving_until = now() + interval '5 minutes'
   where id = p_checkout_id;

  -- Once told to void, always void, even if the void at Authorize.net has to be retried.
  if v_checkout.outcome = 'seats_gone' then
    return jsonb_build_object('result', 'void', 'reason', 'seats_gone');
  end if;
  if v_checkout.holds_seat and v_offer.seat_cap is not null
     and public.offer_seats_in_use(v_offer.code, p_checkout_id) >= v_offer.seat_cap then
    -- The seat is gone: this checkout only needs voiding now, and must not keep a seat while it waits.
    update public.checkouts set holds_seat = false, outcome = 'seats_gone' where id = p_checkout_id;
    return jsonb_build_object('result', 'void', 'reason', 'seats_gone');
  end if;
  return jsonb_build_object('result', 'capture');
end;
$$;
revoke execute on function public.checkout_start_resolving(uuid, text) from public, anon, authenticated;
grant execute on function public.checkout_start_resolving(uuid, text) to service_role;
