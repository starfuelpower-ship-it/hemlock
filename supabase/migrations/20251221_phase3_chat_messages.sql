-- Phase 3: realtime chat backbone (idempotent)
create extension if not exists "pgcrypto";

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('world','court','system')),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null,
  message text not null check (char_length(message) between 1 and 240),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_channel_created_at_idx
on public.chat_messages(channel, created_at);

alter table public.chat_messages enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='chat_messages' and policyname='chat_read_all') then
    create policy "chat_read_all" on public.chat_messages for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='chat_messages' and policyname='chat_insert_authed') then
    create policy "chat_insert_authed" on public.chat_messages for insert with check (auth.uid() = sender_id);
  end if;
end $$;
