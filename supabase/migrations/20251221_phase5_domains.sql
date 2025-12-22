-- Phase 5: Domains foundation

-- Enable gen_random_uuid if needed
create extension if not exists pgcrypto;

create table if not exists public.domain_state (
  player_id uuid primary key references auth.users(id) on delete cascade,
  tier integer not null default 1,
  defensive_rating integer not null default 10,
  stored_gold integer not null default 0,
  protection_state text not null default 'Protected',
  updated_at timestamptz not null default now()
);

create index if not exists domain_state_updated_at_idx on public.domain_state (updated_at desc);

alter table public.domain_state enable row level security;

-- Owner can read their own domain
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='domain_state' and policyname='domain_state_select_own'
  ) then
    create policy domain_state_select_own
      on public.domain_state
      for select
      to authenticated
      using (player_id = auth.uid());
  end if;
end $$;

-- Owner can insert their own domain (first-time seed)
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='domain_state' and policyname='domain_state_insert_own'
  ) then
    create policy domain_state_insert_own
      on public.domain_state
      for insert
      to authenticated
      with check (player_id = auth.uid());
  end if;
end $$;

-- Owner can update their own domain (upgrades, vault changes)
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='domain_state' and policyname='domain_state_update_own'
  ) then
    create policy domain_state_update_own
      on public.domain_state
      for update
      to authenticated
      using (player_id = auth.uid())
      with check (player_id = auth.uid());
  end if;
end $$;
