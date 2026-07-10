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
