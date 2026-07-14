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
