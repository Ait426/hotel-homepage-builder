-- ============================================================================
-- Seed: demo tenant "Aurora Bay Hotel & Spa" for a live Supabase project.
-- Mirrors src/lib/data/demo/content.ts (the TS file is the richer reference —
-- this seed keeps page sections slightly trimmed).
-- Idempotent-ish: deletes the demo hotel first.
-- ============================================================================

delete from public.hotels where slug = 'aurora-bay';

insert into public.hotels (id, slug, name, default_locale, locales, currency, timezone, theme, contact, seo, status)
values (
  '11111111-1111-4111-8111-111111111111',
  'aurora-bay',
  '{"ko": "오로라 베이 호텔 & 스파", "en": "Aurora Bay Hotel & Spa", "ja": "オーロラベイ ホテル＆スパ"}',
  'ko',
  array['ko', 'en', 'ja'],
  'KRW',
  'Asia/Seoul',
  '{"colors": {"brand": "#16302e", "brandInk": "#f7f4ec", "accent": "#bf9b5e", "canvas": "#faf8f3", "surface": "#ffffff", "ink": "#1d2321", "inkMuted": "#65706c"}, "radius": "0.125rem"}',
  '{"phone": "+82-31-000-0000", "email": "stay@aurorabay.example", "address": {"ko": "경기도 평택시 현덕면 바닷가길 1", "en": "1 Badatga-gil, Hyeondeok-myeon, Pyeongtaek-si, Korea"}, "geo": {"lat": 36.9421, "lng": 126.8272}, "checkIn": "15:00", "checkOut": "11:00"}',
  '{"title": {"ko": "오로라 베이 호텔 & 스파 | 서해를 품은 오션프런트 리조트", "en": "Aurora Bay Hotel & Spa | Oceanfront Resort on the West Sea"}, "description": {"ko": "전 객실 오션뷰, 인피니티 풀과 시그니처 스파. 공식 홈페이지 예약 시 최저가를 보장합니다.", "en": "All-ocean-view rooms, an infinity pool and a signature spa. Best rate guaranteed when you book direct."}}',
  'live'
);

insert into public.hotel_domains (hotel_id, domain, is_primary, verified_at)
values ('11111111-1111-4111-8111-111111111111', 'demo.staybook.local', true, now());

insert into public.room_types (id, hotel_id, slug, code, sort, content, images, amenities, size_sqm, occupancy_base, occupancy_max, total_rooms)
values
  ('21111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'deluxe-ocean', 'DLX-O', 10,
   '{"ko": {"name": "디럭스 오션", "tagline": "서해 일몰이 창을 가득 채우는 객실"}, "en": {"name": "Deluxe Ocean", "tagline": "A room filled with the West Sea sunset"}, "ja": {"name": "デラックスオーシャン"}}',
   '[{"url": "https://images.unsplash.com/photo-1611892440504-42a792e24d32?q=80&w=1800&auto=format&fit=crop"}]',
   array['wifi', 'oceanview', 'espresso', 'bathtub', 'minibar'], 38, 2, 3, 12),
  ('22111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'premier-terrace', 'PRM-T', 20,
   '{"ko": {"name": "프리미어 테라스", "tagline": "프라이빗 테라스에서 즐기는 바다"}, "en": {"name": "Premier Terrace"}, "ja": {"name": "プレミアテラス"}}',
   '[{"url": "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?q=80&w=1800&auto=format&fit=crop"}]',
   array['wifi', 'terrace', 'oceanview', 'espresso', 'bathtub'], 45, 2, 3, 8),
  ('23111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'family-suite', 'FAM-S', 30,
   '{"ko": {"name": "패밀리 스위트", "tagline": "침실 두 개, 온 가족의 바다"}, "en": {"name": "Family Suite"}, "ja": {"name": "ファミリースイート"}}',
   '[{"url": "https://images.unsplash.com/photo-1591088398332-8a7791972843?q=80&w=1800&auto=format&fit=crop"}]',
   array['wifi', 'kitchenette', 'oceanview', 'kids', 'bathtub'], 62, 4, 5, 6),
  ('24111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'presidential-suite', 'PRS-S', 40,
   '{"ko": {"name": "프레지덴셜 스위트", "tagline": "최상층 전체를 하나의 객실로"}, "en": {"name": "Presidential Suite"}, "ja": {"name": "プレジデンシャルスイート"}}',
   '[{"url": "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?q=80&w=1800&auto=format&fit=crop"}]',
   array['wifi', 'jacuzzi', 'butler', 'oceanview', 'dining'], 120, 2, 4, 1);

insert into public.rate_plans (id, hotel_id, room_type_id, code, name, meal_plan, cancellation_policy, base_price)
select
  (overlay(rt.id::text placing plan.prefix from 1 for 1))::uuid,
  rt.hotel_id, rt.id,
  rt.code || plan.suffix,
  plan.name::jsonb,
  plan.meal,
  '{"freeUntilDaysBefore": 3, "penaltyPercent": 100, "text": {"ko": "체크인 3일 전까지 무료 취소", "en": "Free cancellation until 3 days before check-in"}}'::jsonb,
  case rt.code
    when 'DLX-O' then 280000 when 'PRM-T' then 380000
    when 'FAM-S' then 520000 else 1800000
  end + plan.surcharge
from public.room_types rt
cross join (values
  ('3', '-BAR', '{"ko": "룸 온리", "en": "Room Only", "ja": "室料のみ"}', 'room_only', 0),
  ('4', '-BB',  '{"ko": "조식 포함", "en": "Breakfast Included", "ja": "朝食付き"}', 'breakfast', 60000)
) as plan(prefix, suffix, name, meal, surcharge)
where rt.hotel_id = '11111111-1111-4111-8111-111111111111';

-- open the next 365 nights for sale
insert into public.room_inventory (hotel_id, room_type_id, date, total)
select rt.hotel_id, rt.id, gs::date, rt.total_rooms
from public.room_types rt
cross join generate_series(current_date, current_date + interval '364 days', interval '1 day') gs
where rt.hotel_id = '11111111-1111-4111-8111-111111111111';

-- weekend pricing (+25%) as daily_rates overrides
insert into public.daily_rates (hotel_id, rate_plan_id, date, price)
select rp.hotel_id, rp.id, gs::date, round(rp.base_price * 1.25, -3)
from public.rate_plans rp
cross join generate_series(current_date, current_date + interval '364 days', interval '1 day') gs
where rp.hotel_id = '11111111-1111-4111-8111-111111111111'
  and extract(dow from gs) in (5, 6);

-- home page (trimmed sections; full reference in src/lib/data/demo/content.ts)
insert into public.pages (hotel_id, path, kind, status, published_at, seo, sections)
values (
  '11111111-1111-4111-8111-111111111111', '/', 'home', 'published', now(),
  '{"ko": {"title": "오로라 베이 호텔 & 스파"}, "en": {"title": "Aurora Bay Hotel & Spa"}}',
  '[
    {"id": "home-hero", "type": "hero", "version": 1, "props": {
      "image": "https://images.unsplash.com/photo-1571896349842-33c89424de2d?q=80&w=2400&auto=format&fit=crop",
      "eyebrow": {"ko": "OCEANFRONT · PYEONGTAEK", "en": "OCEANFRONT · PYEONGTAEK"},
      "heading": {"ko": "서해의 빛을 담은\n조용한 휴식", "en": "Quiet luxury,\nlit by the West Sea"},
      "subheading": {"ko": "전 객실 오션뷰 · 인피니티 풀 · 시그니처 스파", "en": "All-ocean-view rooms · Infinity pool · Signature spa"},
      "cta": {"label": {"ko": "객실 둘러보기", "en": "Explore Rooms"}, "href": "/rooms"},
      "showBookingBar": true
    }},
    {"id": "home-rooms", "type": "rooms-showcase", "version": 1, "props": {
      "heading": {"ko": "객실", "en": "Rooms & Suites"},
      "subheading": {"ko": "모든 객실이 바다를 향해 열려 있습니다", "en": "Every room opens to the sea"},
      "limit": 4
    }},
    {"id": "home-cta", "type": "cta-banner", "version": 1, "props": {
      "heading": {"ko": "공식 홈페이지 최저가 보장", "en": "Best rate, only when you book direct"},
      "cta": {"label": {"ko": "지금 예약하기", "en": "Book Now"}, "href": "/booking"}
    }}
  ]'
);
