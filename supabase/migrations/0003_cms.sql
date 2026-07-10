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
