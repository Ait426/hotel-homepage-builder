-- ============================================================================
-- 0012 — 요금 계산: extra_guest_fee + 자동 프로모션 반영
--
-- create_reservation priced a stay as nights × rooms only, ignoring two
-- things the schema already models:
--   • room_types.extra_guest_fee — a per-guest-per-night surcharge for guests
--     beyond occupancy_base (added in 0006, never used in pricing)
--   • promotions — automatic discounts (code is null) matching the stay
-- so the booked amount could differ from what the site should charge, and
-- reservations.promotion_id / discount_amount were always null/0.
--
-- This REPLACES the function (same signature) to compute:
--   room_subtotal = Σ nightly price × rooms         (unchanged)
--   extra_total   = extra guests × extra_guest_fee × nights
--   subtotal      = room_subtotal + extra_total
--   discount      = best automatic promotion applied to subtotal
--   amount_total  = max(0, subtotal − discount)
-- and records the applied promotion + discount on the reservation.
--
-- The math mirrors src/lib/pricing.ts (priceStay) EXACTLY — both adapters
-- quote with that module, and this RPC re-verifies the quoted total. Any
-- change to one must land in the others or bookings bounce on price_changed.
-- ============================================================================

create or replace function public.create_reservation(
  p_hotel_id uuid,
  p_room_type_id uuid,
  p_rate_plan_id uuid,
  p_check_in date,
  p_check_out date,
  p_rooms int,
  p_adults int,
  p_children int,
  p_guest jsonb,
  p_expected_total numeric default null
)
returns table (reservation_id uuid, code text, amount_total numeric, currency text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nights       int;
  v_locked       int := 0;
  v_room_total   numeric := 0;
  v_extra_total  numeric := 0;
  v_extra_guests int;
  v_subtotal     numeric := 0;
  v_discount     numeric := 0;
  v_promo_id     uuid;
  v_total        numeric := 0;
  v_currency     text;
  v_timezone     text;
  v_today        date;
  v_advance      int;
  v_occ_max      int;
  v_occ_base     int;
  v_extra_fee    numeric;
  v_base_price   numeric;
  v_code         text;
  v_id           uuid;
  v_breakdown    jsonb := '[]'::jsonb;
  v_night        record;
  v_price        numeric;
  v_closed       boolean;
  v_min_stay     int;
begin
  if p_check_out <= p_check_in then
    raise exception 'invalid_stay_range' using errcode = 'P0001';
  end if;
  if p_rooms is null or p_rooms < 1 then
    raise exception 'invalid_rooms_count' using errcode = 'P0001';
  end if;
  if p_guest is null or coalesce(p_guest->>'name', '') = ''
     or coalesce(p_guest->>'email', '') = '' then
    raise exception 'invalid_guest' using errcode = 'P0001';
  end if;

  v_nights := p_check_out - p_check_in;
  if v_nights > 30 then
    raise exception 'invalid_stay_range' using errcode = 'P0001';
  end if;

  select h.currency, h.timezone into v_currency, v_timezone
  from hotels h where h.id = p_hotel_id and h.status = 'live';
  if not found then
    raise exception 'hotel_not_found' using errcode = 'P0001';
  end if;

  v_today := (now() at time zone v_timezone)::date;

  -- no bookings starting before the hotel-local calendar date
  if p_check_in < v_today then
    raise exception 'invalid_stay_range' using errcode = 'P0001';
  end if;

  select rp.base_price, rt.occupancy_max, rt.occupancy_base, rt.extra_guest_fee
    into v_base_price, v_occ_max, v_occ_base, v_extra_fee
  from rate_plans rp
  join room_types rt on rt.id = rp.room_type_id
  where rp.id = p_rate_plan_id
    and rp.hotel_id = p_hotel_id
    and rp.room_type_id = p_room_type_id
    and rp.status = 'active'
    and rt.status = 'active';
  if not found then
    raise exception 'rate_plan_not_found' using errcode = 'P0001';
  end if;

  if coalesce(p_adults, 2) + coalesce(p_children, 0) > v_occ_max * p_rooms then
    raise exception 'invalid_guest' using errcode = 'P0001';
  end if;

  -- Lock every night of the stay in date order. This serializes competing
  -- bookings for the same room type without table-level locks.
  for v_night in
    select i.date, i.total, i.sold, i.blocked
    from room_inventory i
    where i.room_type_id = p_room_type_id
      and i.hotel_id = p_hotel_id
      and i.date >= p_check_in
      and i.date < p_check_out
    order by i.date
    for update
  loop
    v_locked := v_locked + 1;

    if v_night.total - v_night.sold - v_night.blocked < p_rooms then
      raise exception 'sold_out' using errcode = 'P0001',
        detail = v_night.date::text;
    end if;

    select dr.price, dr.closed, dr.min_stay
      into v_price, v_closed, v_min_stay
    from daily_rates dr
    where dr.rate_plan_id = p_rate_plan_id and dr.date = v_night.date;

    if found then
      if v_closed then
        raise exception 'closed_for_sale' using errcode = 'P0001',
          detail = v_night.date::text;
      end if;
      if v_min_stay > v_nights then
        raise exception 'min_stay_not_met' using errcode = 'P0001',
          detail = v_night.date::text;
      end if;
    else
      v_price := v_base_price;
    end if;

    v_room_total := v_room_total + v_price * p_rooms;
    v_breakdown := v_breakdown || jsonb_build_object(
      'date', v_night.date, 'price', v_price
    );
  end loop;

  -- Every night must be explicitly opened for sale in the ledger.
  if v_locked <> v_nights then
    raise exception 'not_open_for_sale' using errcode = 'P0001';
  end if;

  -- extra-guest surcharge: guests above the base occupancy across all rooms,
  -- each charged the per-night fee for the whole stay
  v_extra_guests := greatest(
    0, coalesce(p_adults, 2) + coalesce(p_children, 0) - v_occ_base * p_rooms
  );
  v_extra_total := round(v_extra_guests * coalesce(v_extra_fee, 0) * v_nights, 2);
  v_subtotal := round(v_room_total + v_extra_total, 2);

  -- best AUTOMATIC promotion (code is null) whose conditions the stay meets;
  -- pick the one giving the largest discount on the subtotal
  v_advance := p_check_in - v_today;
  select p.id,
         case
           when p.discount_percent is not null
             then round(v_subtotal * p.discount_percent / 100, 2)
           else least(p.discount_amount, v_subtotal)
         end
    into v_promo_id, v_discount
  from promotions p
  where p.hotel_id = p_hotel_id
    and p.status = 'active'
    and p.code is null
    and (p.room_type_ids is null or p_room_type_id = any (p.room_type_ids))
    and p.min_nights <= v_nights
    and (p.min_advance_days is null or v_advance >= p.min_advance_days)
    and (p.max_advance_days is null or v_advance <= p.max_advance_days)
    and (p.stay_from is null or p_check_in >= p.stay_from)
    and (p.stay_to is null or p_check_in <= p.stay_to)
  order by 2 desc, p.id asc
  limit 1;

  v_discount := coalesce(v_discount, 0);
  v_total := greatest(0, round(v_subtotal - v_discount, 2));

  -- rounded to 2dp: the client total arrives as a JSON float and may carry
  -- binary-float dust; exact numeric equality would reject valid bookings
  if p_expected_total is not null
     and round(p_expected_total, 2) <> round(v_total, 2) then
    raise exception 'price_changed' using errcode = 'P0001',
      detail = v_total::text;
  end if;

  update room_inventory
  set sold = sold + p_rooms, updated_at = now()
  where room_type_id = p_room_type_id
    and hotel_id = p_hotel_id
    and date >= p_check_in
    and date < p_check_out;

  v_code := 'BK-' || to_char(now(), 'YYMMDD') || '-'
            || upper(encode(gen_random_bytes(4), 'hex'));

  insert into reservations (
    hotel_id, room_type_id, rate_plan_id, code, status,
    check_in, check_out, rooms_count, adults, children,
    guest, amount_total, currency, price_breakdown,
    promotion_id, discount_amount
  ) values (
    p_hotel_id, p_room_type_id, p_rate_plan_id, v_code, 'confirmed',
    p_check_in, p_check_out, p_rooms, coalesce(p_adults, 2), coalesce(p_children, 0),
    p_guest, v_total, v_currency, v_breakdown,
    v_promo_id, v_discount
  )
  returning id into v_id;

  perform public.emit_event(
    p_hotel_id, 'reservation.created', 'reservation', v_id::text,
    jsonb_build_object(
      'code', v_code,
      'roomTypeId', p_room_type_id,
      'ratePlanId', p_rate_plan_id,
      'checkIn', p_check_in,
      'checkOut', p_check_out,
      'rooms', p_rooms,
      'amountTotal', v_total,
      'discountAmount', v_discount,
      'promotionId', v_promo_id,
      'currency', v_currency,
      'guestEmail', p_guest->>'email'
    )
  );

  return query select v_id, v_code, v_total, v_currency;
end;
$$;

-- create or replace preserves grants, but re-assert the revoke: only the
-- booking API (service role) may call this — never anon/authenticated.
revoke execute on function public.create_reservation(
  uuid, uuid, uuid, date, date, int, int, int, jsonb, numeric
) from public, anon, authenticated;
