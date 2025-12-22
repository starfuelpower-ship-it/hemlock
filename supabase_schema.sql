-- Hemlock Supabase schema (v1)
-- Run this in Supabase SQL Editor.
-- Tables: profiles, chat_messages, reports, actions, domain_state, resource_state
-- This schema matches the current Hemlock client code (offline-first, online when configured).

-- PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  premium boolean not null default false,
  level integer not null default 1,
  risk_state text not null default 'Protected',
  created_at timestamptz not null default now(),
  last_seen timestamptz
);

alter table public.profiles enable row level security;

create policy "profiles are readable by all" on public.profiles
for select using (true);

create policy "profiles insert by owner" on public.profiles
for insert with check (auth.uid() = id);

create policy "profiles update by owner" on public.profiles
for update using (auth.uid() = id);

-- CHAT MESSAGES
create table if not exists public.chat_messages (
  id text primary key,
  channel text not null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_channel_created_at
  on public.chat_messages(channel, created_at);

alter table public.chat_messages enable row level security;

create policy "chat messages readable by all" on public.chat_messages
for select using (true);

create policy "chat messages insert by authed" on public.chat_messages
for insert with check (auth.uid() = sender_id);

-- REPORTS (private inbox / chronicles)
create table if not exists public.reports (
  id text primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  is_unread boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists reports_recipient_created_at
  on public.reports(recipient_id, created_at);

alter table public.reports enable row level security;

create policy "reports are readable by owner" on public.reports
for select using (auth.uid() = recipient_id);

create policy "reports insert by owner" on public.reports
for insert with check (auth.uid() = recipient_id);

create policy "reports update by owner" on public.reports
for update using (auth.uid() = recipient_id);

-- ACTIONS (private async operations)
create table if not exists public.actions (
  id text primary key,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  target_id uuid,
  vigor_cost integer not null default 0,
  gold_delta_min integer not null default 0,
  gold_delta_max integer not null default 0,
  duration_seconds integer not null default 0,
  status text not null default 'QUEUED',
  created_at timestamptz not null default now(),
  resolves_at timestamptz not null,
  resolved_at timestamptz
);

create index if not exists actions_actor_created_at
  on public.actions(actor_id, created_at);

alter table public.actions enable row level security;

create policy "actions are readable by owner" on public.actions
for select using (auth.uid() = actor_id);

create policy "actions insert by owner" on public.actions
for insert with check (auth.uid() = actor_id);

create policy "actions update by owner" on public.actions
for update using (auth.uid() = actor_id);

-- RESOURCE STATE (per-user)
create table if not exists public.resource_state (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  gold integer not null default 1000,
  vigor integer not null default 10,
  vigor_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.resource_state enable row level security;

create policy "resource readable by owner" on public.resource_state
for select using (auth.uid() = player_id);

create policy "resource upsert by owner" on public.resource_state
for insert with check (auth.uid() = player_id);

create policy "resource update by owner" on public.resource_state
for update using (auth.uid() = player_id);

-- DOMAIN STATE (player base)
create table if not exists public.domain_state (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  tier integer not null default 1,
  defensive_rating integer not null default 10,
  stored_gold integer not null default 0,
  protection_state text not null default 'Protected',
  updated_at timestamptz not null default now()
);

alter table public.domain_state enable row level security;

create policy "domain readable by owner" on public.domain_state
for select using (auth.uid() = player_id);

create policy "domain upsert by owner" on public.domain_state
for insert with check (auth.uid() = player_id);

create policy "domain update by owner" on public.domain_state
for update using (auth.uid() = player_id);
