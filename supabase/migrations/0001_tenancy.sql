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

create policy hotel_domains_owner_write on public.hotel_domains
  for all using (public.has_hotel_role(hotel_id, array['owner', 'manager']));

create policy hotel_members_self_read on public.hotel_members
  for select using (user_id = auth.uid() or public.has_hotel_role(hotel_id, array['owner']));

create policy hotel_members_owner_write on public.hotel_members
  for all using (public.has_hotel_role(hotel_id, array['owner']));
