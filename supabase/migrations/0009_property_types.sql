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
