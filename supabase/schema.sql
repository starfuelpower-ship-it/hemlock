-- Hemlock v1 schema (minimal)
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  premium boolean not null default false,
  level int not null default 1,
  risk_state text not null default 'Protected',
  created_at timestamptz not null default now()
);

create table if not exists public.resource_state (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  gold bigint not null default 0,
  vigor int not null default 10,
  vigor_updated_at timestamptz not null default now()
);

create table if not exists public.actions (
  id text primary key,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  target_id uuid null,
  vigor_cost int not null,
  gold_delta_min int not null,
  gold_delta_max int not null,
  duration_seconds int not null,
  status text not null default 'QUEUED',
  resolves_at timestamptz not null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now()
);

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

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('world','court','system')),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_channel_created_at_idx
on public.chat_messages(channel, created_at);

alter table public.profiles enable row level security;
alter table public.resource_state enable row level security;
alter table public.actions enable row level security;
alter table public.reports enable row level security;
alter table public.chat_messages enable row level security;

create policy "profiles_read_all" on public.profiles for select using (true);
create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id);

create policy "resource_read_self" on public.resource_state for select using (auth.uid() = player_id);
create policy "resource_insert_self" on public.resource_state for insert with check (auth.uid() = player_id);
create policy "resource_update_self" on public.resource_state for update using (auth.uid() = player_id);

create policy "actions_read_self" on public.actions for select using (auth.uid() = actor_id);
create policy "actions_insert_self" on public.actions for insert with check (auth.uid() = actor_id);
create policy "actions_update_self" on public.actions for update using (auth.uid() = actor_id);

create policy "reports_read_self" on public.reports for select using (auth.uid() = recipient_id);
create policy "reports_insert_self" on public.reports for insert with check (auth.uid() = recipient_id);
create policy "reports_update_self" on public.reports for update using (auth.uid() = recipient_id);

create policy "chat_read_all" on public.chat_messages for select using (true);
create policy "chat_insert_authed" on public.chat_messages for insert with check (auth.uid() = sender_id);
