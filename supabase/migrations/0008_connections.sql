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
