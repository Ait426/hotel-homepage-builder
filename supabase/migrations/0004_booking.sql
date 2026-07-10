-- ============================================================================
-- 0004 — Booking: inventory ledger + reservations
--
-- Structural decision D: dual structure.
--   * room_inventory is the per-(room_type, date) COUNT ledger and the
--     source of truth for availability. Fast to query, one row per night.
--   * reservations is the RECORD of who bought what. It never drives
--     availability directly, but lets us audit/rebuild the ledger.
-- Concurrency: create_reservation() locks the stay's ledger rows
-- (FOR UPDATE, ordered by date to avoid deadlocks) inside one transaction;
-- the CHECK (sold + blocked <= total) is the final overbooking guard.
-- OTA channel sync is out of scope for MVP, but the ledger is normalized at
-- room_type granularity so per-channel allocations can attach later.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- room_types
-- ---------------------------------------------------------------------------
create table public.room_types (
  id             uuid primary key default gen_random_uuid(),
  hotel_id       uuid not null references public.hotels (id) on delete cascade,
  slug           text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'),
  code           text not null,
  sort           int  not null default 0,
  -- {"ko": {"name": .., "tagline": .., "description": ..}, "en": {...}}
  content        jsonb not null default '{}'::jsonb,
  -- [{"url": .., "alt": {"ko": ..}}]
  images         jsonb not null default '[]'::jsonb,
  amenities      text[] not null default '{}',
  size_sqm       numeric(6, 1),
  occupancy_base int not null default 2 check (occupancy_base > 0),
  occupancy_max  int not null default 2,
  total_rooms    int not null default 0 check (total_rooms >= 0),
  status         text not null default 'active'
                 check (status in ('active', 'hidden')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (hotel_id, slug),
  unique (hotel_id, code),
  check (occupancy_max >= occupancy_base)
);

create trigger room_types_set_updated_at
  before update on public.room_types
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- rate_plans — pricing/policy variants of a room type
-- ---------------------------------------------------------------------------
create table public.rate_plans (
  id                  uuid primary key default gen_random_uuid(),
  hotel_id            uuid not null references public.hotels (id) on delete cascade,
  room_type_id        uuid not null references public.room_types (id) on delete cascade,
  code                text not null,
  name                jsonb not null default '{}'::jsonb,
  meal_plan           text not null default 'room_only'
                      check (meal_plan in ('room_only', 'breakfast', 'half_board', 'full_board')),
  -- {"freeUntilDaysBefore": 3, "penaltyPercent": 100, "text": {"ko": ..}}
  cancellation_policy jsonb not null default '{}'::jsonb,
  -- fallback nightly price when no daily_rates row exists for a date
  base_price          numeric(12, 2) not null check (base_price >= 0),
  status              text not null default 'active'
                      check (status in ('active', 'hidden')),
  created_at          timestamptz not null default now(),
  unique (hotel_id, code)
);

create index rate_plans_room_type_idx on public.rate_plans (room_type_id);

-- ---------------------------------------------------------------------------
-- room_inventory — the count ledger (source of truth for availability)
-- ---------------------------------------------------------------------------
create table public.room_inventory (
  hotel_id     uuid not null references public.hotels (id) on delete cascade,
  room_type_id uuid not null references public.room_types (id) on delete cascade,
  date         date not null,
  -- sellable count that day (may differ from room_types.total_rooms:
  -- renovations, long stays, seasonal closures)
  total        int not null check (total >= 0),
  sold         int not null default 0 check (sold >= 0),
  -- maintenance holds / future per-channel allotments
  blocked      int not null default 0 check (blocked >= 0),
  updated_at   timestamptz not null default now(),
  primary key (room_type_id, date),
  -- the overbooking guard of last resort
  check (sold + blocked <= total)
);

create index room_inventory_hotel_date_idx on public.room_inventory (hotel_id, date);

-- ---------------------------------------------------------------------------
-- daily_rates — per-date price overrides / sale stops per rate plan
-- ---------------------------------------------------------------------------
create table public.daily_rates (
  hotel_id     uuid not null references public.hotels (id) on delete cascade,
  rate_plan_id uuid not null references public.rate_plans (id) on delete cascade,
  date         date not null,
  price        numeric(12, 2) not null check (price >= 0),
  closed       boolean not null default false,
  min_stay     int not null default 1 check (min_stay >= 1),
  primary key (rate_plan_id, date)
);

create index daily_rates_hotel_date_idx on public.daily_rates (hotel_id, date);

-- ---------------------------------------------------------------------------
-- reservations — the record ledger
-- ---------------------------------------------------------------------------
create table public.reservations (
  id              uuid primary key default gen_random_uuid(),
  hotel_id        uuid not null references public.hotels (id) on delete cascade,
  room_type_id    uuid not null references public.room_types (id),
  rate_plan_id    uuid not null references public.rate_plans (id),
  -- human-facing code guests use to look up / cancel
  code            text not null unique,
  status          text not null default 'confirmed'
                  check (status in ('pending', 'confirmed', 'cancelled',
                                    'checked_in', 'checked_out', 'no_show')),
  check_in        date not null,
  check_out       date not null,
  rooms_count     int not null default 1 check (rooms_count > 0),
  adults          int not null default 2 check (adults >= 1),
  children        int not null default 0 check (children >= 0),
  -- {"name": .., "email": .., "phone": .., "locale": .., "requests": ..}
  guest           jsonb not null,
  amount_total    numeric(12, 2) not null check (amount_total >= 0),
  currency        text not null,
  -- [{"date": "2026-07-10", "price": 250000}, ...] per room
  price_breakdown jsonb not null default '[]'::jsonb,
  source          text not null default 'direct',
  -- PG payload (Toss Payments 등) attaches here later
  payment         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  cancelled_at    timestamptz,
  check (check_out > check_in)
);

create index reservations_hotel_checkin_idx on public.reservations (hotel_id, check_in);
create index reservations_hotel_created_idx on public.reservations (hotel_id, created_at desc);

create trigger reservations_set_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Public availability view — exposes only what the booking widget needs.
-- security_invoker = false (definer) so anon reads go through the view while
-- the raw ledger stays closed under RLS.
-- ---------------------------------------------------------------------------
create view public.room_availability
with (security_invoker = false) as
select
  i.hotel_id,
  i.room_type_id,
  i.date,
  greatest(i.total - i.sold - i.blocked, 0) as remaining
from public.room_inventory i
join public.room_types rt on rt.id = i.room_type_id
join public.hotels h on h.id = i.hotel_id
where rt.status = 'active' and h.status = 'live';

grant select on public.room_availability to anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_reservation — the only write path for direct bookings.
-- Runs entirely in one transaction:
--   1. validate plan/room/hotel linkage
--   2. lock the stay's ledger rows FOR UPDATE (ordered by date)
--   3. verify remaining capacity + price every night
--   4. increment sold, insert reservation, emit outbox event
-- Two guests racing for the last room serialize on step 2; the loser fails
-- the capacity check and gets 'sold_out'.
-- ---------------------------------------------------------------------------
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
  -- client-quoted total, re-verified server-side; pass null to skip the check
  p_expected_total numeric default null
)
returns table (reservation_id uuid, code text, amount_total numeric, currency text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nights      int;
  v_locked      int := 0;
  v_total       numeric := 0;
  v_currency    text;
  v_timezone    text;
  v_occ_max     int;
  v_base_price  numeric;
  v_code        text;
  v_id          uuid;
  v_breakdown   jsonb := '[]'::jsonb;
  v_night       record;
  v_price       numeric;
  v_closed      boolean;
  v_min_stay    int;
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

  -- no bookings starting before the hotel-local calendar date
  if p_check_in < (now() at time zone v_timezone)::date then
    raise exception 'invalid_stay_range' using errcode = 'P0001';
  end if;

  select rp.base_price, rt.occupancy_max into v_base_price, v_occ_max
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

    v_total := v_total + v_price * p_rooms;
    v_breakdown := v_breakdown || jsonb_build_object(
      'date', v_night.date, 'price', v_price
    );
  end loop;

  -- Every night must be explicitly opened for sale in the ledger.
  if v_locked <> v_nights then
    raise exception 'not_open_for_sale' using errcode = 'P0001';
  end if;

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
    guest, amount_total, currency, price_breakdown
  ) values (
    p_hotel_id, p_room_type_id, p_rate_plan_id, v_code, 'confirmed',
    p_check_in, p_check_out, p_rooms, coalesce(p_adults, 2), coalesce(p_children, 0),
    p_guest, v_total, v_currency, v_breakdown
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
      'currency', v_currency,
      'guestEmail', p_guest->>'email'
    )
  );

  return query select v_id, v_code, v_total, v_currency;
end;
$$;

-- Function runs as definer; do not let anon call it directly — the booking
-- API route (service role) is the only caller, so it can rate-limit and
-- validate input first.
revoke execute on function public.create_reservation(
  uuid, uuid, uuid, date, date, int, int, int, jsonb, numeric
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- cancel_reservation — restores the ledger and emits the event.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_reservation(
  p_hotel_id uuid,
  p_code text,
  p_email text
)
returns table (reservation_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res reservations%rowtype;
begin
  select * into v_res
  from reservations r
  where r.hotel_id = p_hotel_id
    and r.code = p_code
    and lower(r.guest->>'email') = lower(p_email)
  for update;

  if not found then
    raise exception 'reservation_not_found' using errcode = 'P0001';
  end if;
  if v_res.status not in ('pending', 'confirmed') then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  -- lock ledger rows in date order (same order as create_reservation)
  perform 1
  from room_inventory i
  where i.room_type_id = v_res.room_type_id
    and i.hotel_id = p_hotel_id
    and i.date >= v_res.check_in
    and i.date < v_res.check_out
  order by i.date
  for update;

  update room_inventory
  set sold = greatest(sold - v_res.rooms_count, 0), updated_at = now()
  where room_type_id = v_res.room_type_id
    and hotel_id = p_hotel_id
    and date >= v_res.check_in
    and date < v_res.check_out;

  update reservations
  set status = 'cancelled', cancelled_at = now()
  where id = v_res.id;

  perform public.emit_event(
    p_hotel_id, 'reservation.cancelled', 'reservation', v_res.id::text,
    jsonb_build_object('code', v_res.code, 'rooms', v_res.rooms_count,
                       'checkIn', v_res.check_in, 'checkOut', v_res.check_out)
  );

  return query select v_res.id, 'cancelled'::text;
end;
$$;

revoke execute on function public.cancel_reservation(uuid, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.room_types     enable row level security;
alter table public.rate_plans     enable row level security;
alter table public.room_inventory enable row level security;
alter table public.daily_rates    enable row level security;
alter table public.reservations   enable row level security;

create policy room_types_public_read on public.room_types
  for select using (
    (status = 'active'
      and exists (select 1 from public.hotels h where h.id = hotel_id and h.status = 'live'))
    or public.is_hotel_member(hotel_id)
  );
create policy room_types_member_write on public.room_types
  for all using (public.has_hotel_role(hotel_id, array['owner', 'manager']));

create policy rate_plans_public_read on public.rate_plans
  for select using (
    (status = 'active'
      and exists (select 1 from public.hotels h where h.id = hotel_id and h.status = 'live'))
    or public.is_hotel_member(hotel_id)
  );
create policy rate_plans_member_write on public.rate_plans
  for all using (public.has_hotel_role(hotel_id, array['owner', 'manager']));

-- raw ledger: staff only (public availability goes through room_availability)
create policy room_inventory_member_read on public.room_inventory
  for select using (public.is_hotel_member(hotel_id));
create policy room_inventory_member_write on public.room_inventory
  for all using (public.has_hotel_role(hotel_id, array['owner', 'manager']));

create policy daily_rates_public_read on public.daily_rates
  for select using (
    exists (select 1 from public.hotels h where h.id = hotel_id and h.status = 'live')
    or public.is_hotel_member(hotel_id)
  );
create policy daily_rates_member_write on public.daily_rates
  for all using (public.has_hotel_role(hotel_id, array['owner', 'manager']));

-- reservations: staff read/manage; guests interact via API routes only
create policy reservations_member_read on public.reservations
  for select using (public.is_hotel_member(hotel_id));
-- owner/manager only: careless direct edits (dates/amounts) desync the
-- ledger. Status transitions that touch inventory must go through RPCs.
create policy reservations_member_update on public.reservations
  for update using (public.has_hotel_role(hotel_id, array['owner', 'manager']));
