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
