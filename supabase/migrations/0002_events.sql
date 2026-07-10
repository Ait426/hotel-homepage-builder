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
