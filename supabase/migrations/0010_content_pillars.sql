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
