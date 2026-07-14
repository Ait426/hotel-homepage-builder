-- ============================================================================
-- ALL MIGRATIONS COMBINED — paste into the Supabase SQL Editor and run once.
-- Generated from supabase/migrations/0001~0012. Order matters.
-- ============================================================================


-- ────────────────────────── supabase/migrations/0001_tenancy.sql ──────────────────────────

-- ============================================================================
-- 0001 — Tenancy core
--
-- Structural decision A2: single database, hotel_id on every tenant-owned
-- table, Supabase RLS for isolation. A hotel is resolved from the request
-- host via hotel_domains.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- hotels — the tenant root. Everything else hangs off hotels.id.
-- ---------------------------------------------------------------------------
create table public.hotels (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique
                 check (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'),
  -- Localized strings are jsonb objects keyed by locale: {"ko": "...", "en": "..."}
  name           jsonb not null default '{}'::jsonb,
  default_locale text  not null default 'ko',
  locales        text[] not null default array['ko'],
  currency       text  not null default 'KRW',
  timezone       text  not null default 'Asia/Seoul',
  -- Design tokens (colors/fonts/radius). Shape documented in src/lib/theme.
  theme          jsonb not null default '{}'::jsonb,
  -- phone / email / address (localized) / geo {lat,lng} / checkin-checkout times
  contact        jsonb not null default '{}'::jsonb,
  -- default meta title/description per locale, og image, gtag id …
  seo            jsonb not null default '{}'::jsonb,
  settings       jsonb not null default '{}'::jsonb,
  status         text  not null default 'draft'
                 check (status in ('draft', 'live', 'suspended')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (default_locale = any (locales))
);

-- ---------------------------------------------------------------------------
-- hotel_domains — host → tenant resolution. One hotel may hold several
-- domains (apex + www + vercel preview); exactly one is primary and is used
-- as the canonical origin for SEO.
-- ---------------------------------------------------------------------------
create table public.hotel_domains (
  id          uuid primary key default gen_random_uuid(),
  hotel_id    uuid not null references public.hotels (id) on delete cascade,
  -- normalized: lowercase, no scheme, no port, no trailing dot
  domain      text not null unique
              check (domain = lower(domain) and domain !~ '[:/ ]'),
  is_primary  boolean not null default false,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);

create unique index hotel_domains_primary_uq
  on public.hotel_domains (hotel_id)
  where is_primary;

create index hotel_domains_hotel_idx on public.hotel_domains (hotel_id);

-- ---------------------------------------------------------------------------
-- hotel_members — staff access. RLS anchor for every admin-side policy.
-- ---------------------------------------------------------------------------
create table public.hotel_members (
  hotel_id   uuid not null references public.hotels (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'editor'
             check (role in ('owner', 'manager', 'editor')),
  created_at timestamptz not null default now(),
  primary key (hotel_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- security definer so RLS policies on other tables can consult membership
-- without opening hotel_members itself.
create or replace function public.is_hotel_member(p_hotel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hotel_members m
    where m.hotel_id = p_hotel_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_hotel_role(p_hotel_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hotel_members m
    where m.hotel_id = p_hotel_id
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger hotels_set_updated_at
  before update on public.hotels
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.hotels        enable row level security;
alter table public.hotel_domains enable row level security;
alter table public.hotel_members enable row level security;

-- Public site renders live hotels; staff can always see their own hotel.
create policy hotels_public_read on public.hotels
  for select using (status = 'live' or public.is_hotel_member(id));

create policy hotels_member_update on public.hotels
  for update using (public.has_hotel_role(id, array['owner', 'manager']));

-- Hotel creation is a platform operation (service role bypasses RLS): no
-- insert policy on purpose.

create policy hotel_domains_public_read on public.hotel_domains
  for select using (true);

-- Domain attach/verify is a PLATFORM operation (service role only): letting
-- hotel staff write here would allow squatting on another hotel's domain
-- before they connect it. No insert/update/delete policies on purpose.

create policy hotel_members_self_read on public.hotel_members
  for select using (user_id = auth.uid() or public.has_hotel_role(hotel_id, array['owner']));

create policy hotel_members_owner_write on public.hotel_members
  for all using (public.has_hotel_role(hotel_id, array['owner']));

-- ────────────────────────── supabase/migrations/0002_events.sql ──────────────────────────

-- ============================================================================
-- 0002 — Event spine (outbox)
--
-- Structural decision: every domain fact (reservation created, inventory
-- changed, inquiry received …) is appended here in the same transaction that
-- produced it. Consumers (notifications, pricing engine, channel manager,
-- UniChat/Hermes adapters) attach later as subscribers polling or streaming
-- this table — modules never call each other directly.
-- ============================================================================

create table public.events (
  id             bigint generated always as identity primary key,
  hotel_id       uuid not null references public.hotels (id) on delete cascade,
  -- dot-namespaced: 'reservation.created', 'reservation.cancelled',
  -- 'inventory.adjusted', 'inquiry.received', 'message.sent', 'page.published'
  type           text not null,
  aggregate_type text not null,
  aggregate_id   text not null,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  -- set by a consumer once handled; null = pending
  processed_at   timestamptz
);

create index events_pending_idx on public.events (id) where processed_at is null;
create index events_hotel_idx   on public.events (hotel_id, created_at desc);
create index events_type_idx    on public.events (type, created_at desc);

alter table public.events enable row level security;

-- Staff may inspect their hotel's event stream; all writes go through
-- server-side functions / service role.
create policy events_member_read on public.events
  for select using (public.is_hotel_member(hotel_id));

-- Convenience for triggers/functions in later migrations.
create or replace function public.emit_event(
  p_hotel_id uuid,
  p_type text,
  p_aggregate_type text,
  p_aggregate_id text,
  p_payload jsonb default '{}'::jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.events (hotel_id, type, aggregate_type, aggregate_id, payload)
  values (p_hotel_id, p_type, p_aggregate_type, p_aggregate_id, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- security definer + callable by anon would let anyone forge events for any
-- hotel; only server-side functions/triggers (and the service role) may emit.
revoke execute on function public.emit_event(uuid, text, text, text, jsonb)
  from public, anon, authenticated;

-- ────────────────────────── supabase/migrations/0003_cms.sql ──────────────────────────

-- ============================================================================
-- 0003 — Content model
--
-- Structural decision B: a page is an ordered array of section instances.
-- Section instance shape (validated in the app layer with zod):
--   {
--     "id":      "uuid-ish string, stable per instance",
--     "type":    "hero" | "rooms-showcase" | "gallery" | ...,
--     "version": 1,                      -- schema version of that section type
--     "props":   { ... }                 -- localized values are {"ko": .., "en": ..}
--   }
-- Versioning rule: renderers keep every published version renderable;
-- breaking prop changes bump `version` and ship with a migration script
-- (scripts/section-migrations/) that rewrites instances in place.
-- ============================================================================

create table public.pages (
  id           uuid primary key default gen_random_uuid(),
  hotel_id     uuid not null references public.hotels (id) on delete cascade,
  -- '/' for home; nested custom paths like '/facilities/spa'
  path         text not null
               check (path ~ '^/(?:[a-z0-9-]+(?:/[a-z0-9-]+)*)?$'),
  -- 'system' pages (rooms list, room detail, booking, contact) are rendered by
  -- dedicated routes; 'custom' pages render purely from sections.
  kind         text not null default 'custom'
               check (kind in ('home', 'custom')),
  sections     jsonb not null default '[]'::jsonb
               check (jsonb_typeof(sections) = 'array'),
  -- {"ko": {"title": .., "description": .., "ogImage": ..}, "en": {...}}
  seo          jsonb not null default '{}'::jsonb,
  status       text not null default 'draft'
               check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (hotel_id, path)
);

create index pages_hotel_idx on public.pages (hotel_id) where status = 'published';

create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();

-- Full snapshot per save: cheap undo + audit trail for the editor.
create table public.page_revisions (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.pages (id) on delete cascade,
  hotel_id   uuid not null references public.hotels (id) on delete cascade,
  sections   jsonb not null,
  seo        jsonb not null default '{}'::jsonb,
  saved_by   uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index page_revisions_page_idx on public.page_revisions (page_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.pages          enable row level security;
alter table public.page_revisions enable row level security;

create policy pages_public_read on public.pages
  for select using (
    (status = 'published'
      and exists (select 1 from public.hotels h where h.id = hotel_id and h.status = 'live'))
    or public.is_hotel_member(hotel_id)
  );

create policy pages_member_write on public.pages
  for insert with check (public.is_hotel_member(hotel_id));
create policy pages_member_update on public.pages
  for update using (public.is_hotel_member(hotel_id));
create policy pages_member_delete on public.pages
  for delete using (public.has_hotel_role(hotel_id, array['owner', 'manager']));

create policy page_revisions_member_read on public.page_revisions
  for select using (public.is_hotel_member(hotel_id));
create policy page_revisions_member_write on public.page_revisions
  for insert with check (public.is_hotel_member(hotel_id));

-- ────────────────────────── supabase/migrations/0004_booking.sql ──────────────────────────

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

-- ────────────────────────── supabase/migrations/0005_inbox.sql ──────────────────────────

-- ============================================================================
-- 0005 — Guest communication (inbox)
--
-- Structural decision E: MVP is thread-per-inquiry (web form → staff reply).
-- `channel` and the event emissions are shaped so messaging channels
-- (Kakao 알림톡, WhatsApp, LINE, email) attach later as adapters consuming
-- the event stream — no schema change required.
-- ============================================================================

create table public.threads (
  id              uuid primary key default gen_random_uuid(),
  hotel_id        uuid not null references public.hotels (id) on delete cascade,
  reservation_id  uuid references public.reservations (id) on delete set null,
  channel         text not null default 'webform'
                  check (channel in ('webform', 'email', 'kakao', 'whatsapp', 'line')),
  subject         text,
  -- {"name": .., "email": .., "phone": .., "locale": ..}
  guest           jsonb not null,
  status          text not null default 'open'
                  check (status in ('open', 'answered', 'closed', 'spam')),
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);

create index threads_hotel_idx on public.threads (hotel_id, last_message_at desc nulls last);

create table public.messages (
  id             uuid primary key default gen_random_uuid(),
  thread_id      uuid not null references public.threads (id) on delete cascade,
  hotel_id       uuid not null references public.hotels (id) on delete cascade,
  sender         text not null check (sender in ('guest', 'staff', 'system')),
  body           text not null check (length(body) between 1 and 10000),
  author_user_id uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index messages_thread_idx on public.messages (thread_id, created_at);

-- keep the thread's activity timestamp fresh + emit the outbox event
create or replace function public.on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.threads
  set last_message_at = new.created_at,
      status = case
        when new.sender = 'staff' then 'answered'
        when status = 'answered' then 'open'
        else status
      end
  where id = new.thread_id;

  perform public.emit_event(
    new.hotel_id,
    case when new.sender = 'guest' then 'inquiry.received' else 'message.sent' end,
    'message', new.id::text,
    jsonb_build_object('threadId', new.thread_id, 'sender', new.sender)
  );

  return new;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.on_message_insert();

-- ---------------------------------------------------------------------------
-- RLS — guests never touch these tables directly; the inquiry API route
-- (service role) creates threads/messages after validation.
-- ---------------------------------------------------------------------------
alter table public.threads  enable row level security;
alter table public.messages enable row level security;

create policy threads_member_read on public.threads
  for select using (public.is_hotel_member(hotel_id));
create policy threads_member_update on public.threads
  for update using (public.is_hotel_member(hotel_id));

create policy messages_member_read on public.messages
  for select using (public.is_hotel_member(hotel_id));
create policy messages_member_insert on public.messages
  for insert with check (
    public.is_hotel_member(hotel_id)
    and sender = 'staff'
    -- the thread must belong to the same hotel, or a member could mutate
    -- another tenant's thread through the definer trigger
    and exists (
      select 1 from public.threads t
      where t.id = thread_id and t.hotel_id = messages.hotel_id
    )
  );

-- ────────────────────────── supabase/migrations/0006_booking_extensions.sql ──────────────────────────

-- ============================================================================
-- 0006 — Booking extensions
--
-- Absorbed from the goodmorning-hotel-sokcho project + market research:
--  * extra-guest fees (기준 인원 초과 요금) — standard Korean hotel practice
--  * promotions (장기숙박/얼리버드/프로모 코드) — packages & promos are the
--    #1 direct-booking weapon (can't be price-compared on OTAs)
--  * booking modes (decision G): 'instant' | 'hold_payment' | 'request'
--    selected per hotel via hotels.settings.bookingMode; pending holds get
--    an expiry so abandoned checkouts release inventory.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extra-guest fee: charged per person per night beyond occupancy_base.
-- ---------------------------------------------------------------------------
alter table public.room_types
  add column extra_guest_fee numeric(12, 2) not null default 0
  check (extra_guest_fee >= 0);

-- ---------------------------------------------------------------------------
-- promotions — automatic discounts and promo codes.
-- Pricing precedence at quote time (application layer):
--   daily_rates override > rate_plan base_price, then promotions apply on top.
-- ---------------------------------------------------------------------------
create table public.promotions (
  id               uuid primary key default gen_random_uuid(),
  hotel_id         uuid not null references public.hotels (id) on delete cascade,
  -- null = automatic (applies when conditions match); set = guest enters code
  code             text check (code ~ '^[A-Z0-9-]{3,24}$'),
  name             jsonb not null default '{}'::jsonb,
  kind             text not null default 'code'
                   check (kind in ('long_stay', 'early_bird', 'last_minute', 'code')),
  -- exactly one of percent / amount
  discount_percent numeric(5, 2) check (discount_percent > 0 and discount_percent <= 100),
  discount_amount  numeric(12, 2) check (discount_amount > 0),
  min_nights       int not null default 1 check (min_nights >= 1),
  -- early_bird: booked at least N days ahead / last_minute: at most N days
  min_advance_days int,
  max_advance_days int,
  -- applicable stay window (null = always)
  stay_from        date,
  stay_to          date,
  -- null = all room types
  room_type_ids    uuid[],
  status           text not null default 'active'
                   check (status in ('active', 'paused', 'ended')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (num_nonnulls(discount_percent, discount_amount) = 1),
  unique (hotel_id, code)
);

create index promotions_hotel_idx on public.promotions (hotel_id) where status = 'active';

create trigger promotions_set_updated_at
  before update on public.promotions
  for each row execute function public.set_updated_at();

alter table public.promotions enable row level security;

-- automatic promos are shown on the site; code promos are validated
-- server-side, but their existence isn't a secret worth an extra policy
create policy promotions_public_read on public.promotions
  for select using (
    (status = 'active'
      and exists (select 1 from public.hotels h where h.id = hotel_id and h.status = 'live'))
    or public.is_hotel_member(hotel_id)
  );
create policy promotions_member_write on public.promotions
  for all using (public.has_hotel_role(hotel_id, array['owner', 'manager']));

-- ---------------------------------------------------------------------------
-- Reservation holds (booking mode B: hold + payment).
-- A 'pending' reservation created before payment carries expires_at; an
-- expiry worker (events consumer / cron) cancels overdue holds and releases
-- the ledger. Modes:
--   instant      → create as 'confirmed' (current default)
--   hold_payment → create as 'pending' + expires_at(now + ~15min) → PG →
--                  confirm_reservation on payment success
--   request      → create as 'pending', no expiry → staff approves/declines
--                  (sokcho-style request flow; approval emits the event that
--                  triggers the guest notification)
-- ---------------------------------------------------------------------------
alter table public.reservations
  add column expires_at timestamptz;

create index reservations_pending_expiry_idx
  on public.reservations (expires_at)
  where status = 'pending' and expires_at is not null;

-- Applied discount snapshot (audit: which promo produced the price).
alter table public.reservations
  add column promotion_id uuid references public.promotions (id) on delete set null,
  add column discount_amount numeric(12, 2) not null default 0
    check (discount_amount >= 0);

-- ────────────────────────── supabase/migrations/0007_cms_extensions.sql ──────────────────────────

-- ============================================================================
-- 0007 — Content model extensions
--
-- WordPress lessons, kept deliberately narrow:
--  * posts    — dated content (공지/프로모션/매거진). Content-SEO is the
--               long-term direct-booking traffic engine. Bodies reuse the
--               section model — no second rendering system.
--  * offers   — packages/프로모션 상품. First-class (not a page kind) because
--               they carry booking semantics (validity windows, price-from,
--               a rate plan deep-link) and feed the offers-grid section.
--  * redirects— URL is a permanent contract; when staff rename a path the
--               console writes a 301 here automatically. Checked on 404.
--  * media    — media library (upload once, reuse everywhere, alt per locale).
--  * pages.publish_at — scheduled publishing ("금요일 0시에 공개").
-- ============================================================================

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
create table public.posts (
  id            uuid primary key default gen_random_uuid(),
  hotel_id      uuid not null references public.hotels (id) on delete cascade,
  slug          text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'),
  kind          text not null default 'article'
                check (kind in ('notice', 'promo', 'article')),
  title         jsonb not null default '{}'::jsonb,
  excerpt       jsonb not null default '{}'::jsonb,
  cover_image   text,
  -- same section-instance array as pages.sections
  body_sections jsonb not null default '[]'::jsonb
                check (jsonb_typeof(body_sections) = 'array'),
  seo           jsonb not null default '{}'::jsonb,
  status        text not null default 'draft'
                check (status in ('draft', 'pending_review', 'published', 'archived')),
  -- scheduled publishing: visible when status='published' AND
  -- (publish_at is null OR publish_at <= now())
  publish_at    timestamptz,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (hotel_id, slug)
);

create index posts_hotel_published_idx
  on public.posts (hotel_id, published_at desc)
  where status = 'published';

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- offers — packages & promotions as bookable marketing objects
-- ---------------------------------------------------------------------------
create table public.offers (
  id            uuid primary key default gen_random_uuid(),
  hotel_id      uuid not null references public.hotels (id) on delete cascade,
  slug          text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'),
  title         jsonb not null default '{}'::jsonb,
  summary       jsonb not null default '{}'::jsonb,
  image         text,
  -- ["조식 2인", "레이트 체크아웃", ...] localized: {"ko": [...], "en": [...]}
  perks         jsonb not null default '{}'::jsonb,
  price_from    numeric(12, 2) check (price_from >= 0),
  -- booking window (when the offer can be BOOKED)
  valid_from    date,
  valid_to      date,
  -- stay window (when the stay can HAPPEN)
  stay_from     date,
  stay_to       date,
  -- deep link into the booking flow with this plan pre-selected
  rate_plan_id  uuid references public.rate_plans (id) on delete set null,
  -- optional long-form detail page content (section instances)
  body_sections jsonb not null default '[]'::jsonb
                check (jsonb_typeof(body_sections) = 'array'),
  sort          int not null default 0,
  status        text not null default 'draft'
                check (status in ('draft', 'published', 'archived')),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (hotel_id, slug)
);

create index offers_hotel_idx on public.offers (hotel_id, sort) where status = 'published';

create trigger offers_set_updated_at
  before update on public.offers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- redirects — automatic 301s when paths change (SEO permanence)
-- ---------------------------------------------------------------------------
create table public.redirects (
  id          uuid primary key default gen_random_uuid(),
  hotel_id    uuid not null references public.hotels (id) on delete cascade,
  -- locale-independent site paths, e.g. '/offers' → '/promotions'
  from_path   text not null check (from_path ~ '^/'),
  to_path     text not null check (to_path ~ '^/'),
  status_code int not null default 301 check (status_code in (301, 302, 308)),
  created_at  timestamptz not null default now(),
  unique (hotel_id, from_path),
  check (from_path <> to_path)
);

-- ---------------------------------------------------------------------------
-- media_assets — media library (Supabase Storage backed)
-- ---------------------------------------------------------------------------
create table public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  hotel_id     uuid not null references public.hotels (id) on delete cascade,
  storage_path text not null,
  url          text not null,
  kind         text not null default 'image' check (kind in ('image', 'video')),
  alt          jsonb not null default '{}'::jsonb,
  width        int,
  height       int,
  bytes        bigint,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (hotel_id, storage_path)
);

create index media_assets_hotel_idx on public.media_assets (hotel_id, created_at desc);

-- ---------------------------------------------------------------------------
-- pages: scheduled publishing
-- ---------------------------------------------------------------------------
alter table public.pages
  add column publish_at timestamptz;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.posts        enable row level security;
alter table public.offers       enable row level security;
alter table public.redirects    enable row level security;
alter table public.media_assets enable row level security;

create policy posts_public_read on public.posts
  for select using (
    (status = 'published'
      and (publish_at is null or publish_at <= now())
      and exists (select 1 from public.hotels h where h.id = hotel_id and h.status = 'live'))
    or public.is_hotel_member(hotel_id)
  );
create policy posts_member_write on public.posts
  for insert with check (public.is_hotel_member(hotel_id));
create policy posts_member_update on public.posts
  for update using (public.is_hotel_member(hotel_id));
create policy posts_member_delete on public.posts
  for delete using (public.has_hotel_role(hotel_id, array['owner', 'manager']));

create policy offers_public_read on public.offers
  for select using (
    (status = 'published'
      and exists (select 1 from public.hotels h where h.id = hotel_id and h.status = 'live'))
    or public.is_hotel_member(hotel_id)
  );
create policy offers_member_write on public.offers
  for insert with check (public.is_hotel_member(hotel_id));
create policy offers_member_update on public.offers
  for update using (public.is_hotel_member(hotel_id));
create policy offers_member_delete on public.offers
  for delete using (public.has_hotel_role(hotel_id, array['owner', 'manager']));

create policy redirects_public_read on public.redirects
  for select using (true);
create policy redirects_member_write on public.redirects
  for all using (public.has_hotel_role(hotel_id, array['owner', 'manager']));

create policy media_assets_public_read on public.media_assets
  for select using (true);
create policy media_assets_member_write on public.media_assets
  for insert with check (public.is_hotel_member(hotel_id));
create policy media_assets_member_delete on public.media_assets
  for delete using (public.is_hotel_member(hotel_id));

-- ────────────────────────── supabase/migrations/0008_connections.sql ──────────────────────────

-- ============================================================================
-- 0008 — Connection layer ("홈페이지 = 연결")
--
-- The homepage is the meeting point of every channel a hotel runs. Two
-- tables make that structural:
--
--  * hotel_connections — one row per external account/feed a hotel links
--    (카카오 채널, 네이버 톡톡/블로그, Instagram, Google Place, RSS, …).
--    Buttons (kakao/talktalk) render straight from config; feed-shaped
--    connections are synced by workers.
--
--  * feed_items — the platform-wide feed cache. Research verdict (2026):
--    ALWAYS fetch server-side on a schedule and render natively from this
--    cache; never load third-party widget scripts per page view. A broken
--    token degrades to "last known items", not an empty section.
--
-- Sync workers are event-spine citizens: each run upserts feed_items and
-- emits 'connection.synced' / 'connection.error' — the console alerts on
-- error events (Instagram tokens WILL break; reconnect UX is a feature).
-- ============================================================================

create table public.hotel_connections (
  id             uuid primary key default gen_random_uuid(),
  hotel_id       uuid not null references public.hotels (id) on delete cascade,
  kind           text not null check (kind in (
                   'kakao_channel',   -- {publicId}
                   'naver_talktalk',  -- {talkId}
                   'naver_blog',      -- {blogId}            (RSS, no auth)
                   'rss',             -- {feedUrl, label}
                   'instagram',       -- {username, source: 'manual'|'behold'|'graph', feedUrl?, token?…}
                   'facebook_page',   -- {pageUrl}
                   'youtube',         -- {channelId | videoIds[]}
                   'google_place',    -- {placeId}           (reviews, 5-max + attribution)
                   'tripadvisor'      -- {locationId}
                 )),
  config         jsonb not null default '{}'::jsonb,
  status         text not null default 'active'
                 check (status in ('active', 'error', 'disconnected')),
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- most kinds are one-per-hotel; rss/youtube may repeat (managed in console)
create index hotel_connections_hotel_idx on public.hotel_connections (hotel_id, kind);

create trigger hotel_connections_set_updated_at
  before update on public.hotel_connections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- feed_items — normalized cache of synced external content
-- ---------------------------------------------------------------------------
create table public.feed_items (
  id            uuid primary key default gen_random_uuid(),
  hotel_id      uuid not null references public.hotels (id) on delete cascade,
  connection_id uuid not null references public.hotel_connections (id) on delete cascade,
  -- stable id within the source (post id, RSS guid, review id…)
  external_id   text not null,
  url           text,
  -- normalized payload: {title, text, imageUrl, author, rating?, …}
  content       jsonb not null default '{}'::jsonb,
  published_at  timestamptz,
  fetched_at    timestamptz not null default now(),
  unique (connection_id, external_id)
);

create index feed_items_hotel_idx
  on public.feed_items (hotel_id, published_at desc nulls last);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.hotel_connections enable row level security;
alter table public.feed_items        enable row level security;

-- config may hold tokens → NEVER publicly readable. Sections that need
-- public bits (kakao publicId, talk id) read them via the data-source layer
-- (service role) which strips secrets before rendering.
create policy hotel_connections_member_read on public.hotel_connections
  for select using (public.is_hotel_member(hotel_id));
create policy hotel_connections_member_write on public.hotel_connections
  for all using (public.has_hotel_role(hotel_id, array['owner', 'manager']));

-- cached feed content is public by nature (it came from public feeds)
create policy feed_items_public_read on public.feed_items
  for select using (
    exists (select 1 from public.hotels h where h.id = hotel_id and h.status = 'live')
    or public.is_hotel_member(hotel_id)
  );
-- writes: sync workers only (service role bypasses RLS)

-- ────────────────────────── supabase/migrations/0009_property_types.sql ──────────────────────────

-- ============================================================================
-- 0009 — Property types: the platform serves ALL lodging, not just hotels.
--
-- property_type drives (in the app layer): wizard copy tone, theme preset
-- defaults, realistic price baselines, schema.org type (Hotel/Motel/Resort/
-- LodgingBusiness), and section composition defaults.
--
-- NOTE — 모텔 대실 (day-use / hourly slots) is deliberately NOT modeled yet.
-- It adds a slot dimension to the inventory ledger (same room sellable as
-- day-use AND overnight in one calendar day). Design direction when it
-- lands: a `day_use_slots` table keyed (room_type_id, date, slot) with its
-- own create_dayuse_reservation RPC, sharing the overnight ledger's
-- concurrency pattern. Overnight bookings for motels work today as-is.
-- ============================================================================

alter table public.hotels
  add column property_type text not null default 'hotel'
  check (property_type in ('hotel', 'motel', 'resort', 'pension', 'guesthouse'));

-- ────────────────────────── supabase/migrations/0010_content_pillars.sql ──────────────────────────

-- ============================================================================
-- 0010 — Content pillars: 콘텐츠 > 글 공장
--
-- Two informational pillars join the post kinds:
--   hotel_guide — 호텔 정보성 (이용 안내, 시설 활용, 객실 선택 가이드).
--                 Grounded in the property's actual data.
--   local_guide — 지역 정보성 (주변 가이드, 계절 코스). Grounded in the
--                 owner's notes — the AI may not invent local facts.
-- ============================================================================

alter table public.posts
  drop constraint posts_kind_check;

alter table public.posts
  add constraint posts_kind_check
  check (kind in ('notice', 'promo', 'article', 'hotel_guide', 'local_guide'));

-- ────────────────────────── supabase/migrations/0011_read_policy_tightening.sql ──────────────────────────

-- ============================================================================
-- 0011 — 읽기 정책 좁히기 (anonymous read hardening)
--
-- Several public-read RLS policies were broader than the site actually needs,
-- so the anon key could see rows that never appear on a live site. Each
-- policy below is REPLACED (drop + recreate) with a tighter `using` clause;
-- member reads (is_hotel_member) are always preserved so the console is
-- unaffected. No table shape changes — policy definitions only.
--
--   media_assets / redirects : `using (true)` leaked every tenant's rows
--     (incl. draft/suspended hotels). Gate on the owning hotel being live,
--     matching room_types/rate_plans/posts/offers.
--   promotions : anon could enumerate ALL active promos of a live hotel,
--     including code-gated ones — the discount `code` was readable without
--     entering it. Public read now covers automatic promos only (code null);
--     code promos are validated server-side (service role) and never exposed.
--   daily_rates : gated only on hotel-live, so nightly prices for HIDDEN
--     rate plans / room types were still readable. Require the parent rate
--     plan AND its room type to be active too.
-- ============================================================================

-- media_assets -------------------------------------------------------------
drop policy if exists media_assets_public_read on public.media_assets;
create policy media_assets_public_read on public.media_assets
  for select using (
    exists (select 1 from public.hotels h where h.id = hotel_id and h.status = 'live')
    or public.is_hotel_member(hotel_id)
  );

-- redirects ----------------------------------------------------------------
drop policy if exists redirects_public_read on public.redirects;
create policy redirects_public_read on public.redirects
  for select using (
    exists (select 1 from public.hotels h where h.id = hotel_id and h.status = 'live')
    or public.is_hotel_member(hotel_id)
  );

-- promotions ---------------------------------------------------------------
-- automatic promos (code is null) are surfaced on the site; code promos are
-- never anon-readable — knowing a code exists is half of redeeming it.
drop policy if exists promotions_public_read on public.promotions;
create policy promotions_public_read on public.promotions
  for select using (
    (status = 'active'
      and code is null
      and exists (select 1 from public.hotels h where h.id = hotel_id and h.status = 'live'))
    or public.is_hotel_member(hotel_id)
  );

-- daily_rates --------------------------------------------------------------
-- a nightly price is public only when its rate plan AND room type are active
-- and the hotel is live — hidden plans/rooms must not leak prices to anon.
drop policy if exists daily_rates_public_read on public.daily_rates;
create policy daily_rates_public_read on public.daily_rates
  for select using (
    exists (
      select 1
      from public.rate_plans rp
      join public.room_types rt on rt.id = rp.room_type_id
      join public.hotels h on h.id = rp.hotel_id
      where rp.id = daily_rates.rate_plan_id
        and rp.status = 'active'
        and rt.status = 'active'
        and h.status = 'live'
    )
    or public.is_hotel_member(daily_rates.hotel_id)
  );

-- ────────────────────────── supabase/migrations/0012_reservation_pricing.sql ──────────────────────────

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
  order by 2 desc
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
