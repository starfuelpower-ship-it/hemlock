-- Phase 4: Public profiles + rankings support (safe, idempotent-ish)

-- Ensure profiles table exists and has required columns.
-- If your project already has this table, these ALTERs will be no-ops where possible.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  premium boolean not null default false,
  level int not null default 1,
  risk_state text not null default 'Protected',
  created_at timestamptz not null default now(),
  last_seen timestamptz
);

alter table public.profiles add column if not exists premium boolean not null default false;
alter table public.profiles add column if not exists level int not null default 1;
alter table public.profiles add column if not exists risk_state text not null default 'Protected';
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists last_seen timestamptz;

-- Basic index to support leaderboards.
create index if not exists profiles_level_idx on public.profiles(level desc);
create index if not exists profiles_last_seen_idx on public.profiles(last_seen desc);

-- RLS: allow authenticated users to read public profiles (needed for rankings + profile viewing).
alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_all_auth'
  ) then
    create policy profiles_select_all_auth
      on public.profiles
      for select
      to authenticated
      using (true);
  end if;
end$$;

-- Keep existing self-only insert/update policies if you already have them.
-- If not present, create minimal safe ones.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert_self'
  ) then
    create policy profiles_insert_self
      on public.profiles
      for insert
      to authenticated
      with check (id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_self'
  ) then
    create policy profiles_update_self
      on public.profiles
      for update
      to authenticated
      using (id = auth.uid())
      with check (id = auth.uid());
  end if;
end$$;
