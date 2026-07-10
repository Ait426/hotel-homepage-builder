-- ============================================================================
-- 0005 — Guest communication (inbox)
--
-- Structural decision E: MVP is thread-per-inquiry (web form → staff reply).
-- `channel` and the event emissions are shaped so messaging channels
-- (Kakao 알림톡, WhatsApp, LINE, email) attach later as adapters consuming
-- the event stream — no schema change required.
-- ============================================================================

create table public.threads (
  id              uuid primary key default gen_random_uuid(),
  hotel_id        uuid not null references public.hotels (id) on delete cascade,
  reservation_id  uuid references public.reservations (id) on delete set null,
  channel         text not null default 'webform'
                  check (channel in ('webform', 'email', 'kakao', 'whatsapp', 'line')),
  subject         text,
  -- {"name": .., "email": .., "phone": .., "locale": ..}
  guest           jsonb not null,
  status          text not null default 'open'
                  check (status in ('open', 'answered', 'closed', 'spam')),
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);

create index threads_hotel_idx on public.threads (hotel_id, last_message_at desc nulls last);

create table public.messages (
  id             uuid primary key default gen_random_uuid(),
  thread_id      uuid not null references public.threads (id) on delete cascade,
  hotel_id       uuid not null references public.hotels (id) on delete cascade,
  sender         text not null check (sender in ('guest', 'staff', 'system')),
  body           text not null check (length(body) between 1 and 10000),
  author_user_id uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index messages_thread_idx on public.messages (thread_id, created_at);

-- keep the thread's activity timestamp fresh + emit the outbox event
create or replace function public.on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.threads
  set last_message_at = new.created_at,
      status = case
        when new.sender = 'staff' then 'answered'
        when status = 'answered' then 'open'
        else status
      end
  where id = new.thread_id;

  perform public.emit_event(
    new.hotel_id,
    case when new.sender = 'guest' then 'inquiry.received' else 'message.sent' end,
    'message', new.id::text,
    jsonb_build_object('threadId', new.thread_id, 'sender', new.sender)
  );

  return new;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.on_message_insert();

-- ---------------------------------------------------------------------------
-- RLS — guests never touch these tables directly; the inquiry API route
-- (service role) creates threads/messages after validation.
-- ---------------------------------------------------------------------------
alter table public.threads  enable row level security;
alter table public.messages enable row level security;

create policy threads_member_read on public.threads
  for select using (public.is_hotel_member(hotel_id));
create policy threads_member_update on public.threads
  for update using (public.is_hotel_member(hotel_id));

create policy messages_member_read on public.messages
  for select using (public.is_hotel_member(hotel_id));
create policy messages_member_insert on public.messages
  for insert with check (
    public.is_hotel_member(hotel_id)
    and sender = 'staff'
    -- the thread must belong to the same hotel, or a member could mutate
    -- another tenant's thread through the definer trigger
    and exists (
      select 1 from public.threads t
      where t.id = thread_id and t.hotel_id = messages.hotel_id
    )
  );
