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
  xp integer not null default 0,
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


-- Ensure domain economy columns exist
alter table public.domain_state add column if not exists last_collected_at timestamptz not null default now();
alter table public.domain_state add column if not exists income_per_hour integer not null default 25;
alter table public.domain_state enable row level security;

create policy "domain readable by owner" on public.domain_state
for select using (auth.uid() = player_id);

create policy "domain upsert by owner" on public.domain_state
for insert with check (auth.uid() = player_id);

create policy "domain update by owner" on public.domain_state
for update using (auth.uid() = player_id);


-- INVENTORY ITEMS (one row per item)
create table if not exists public.inventory_items (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  item_key text not null,
  item_name text not null,
  rarity text not null,
  value integer not null default 0,
  obtained_from text,
  obtained_at timestamptz not null default now()
);

create index if not exists inventory_items_owner_obtained_at
  on public.inventory_items(owner_id, obtained_at desc);

alter table public.inventory_items enable row level security;

create policy "inventory items readable by owner" on public.inventory_items
for select using (auth.uid() = owner_id);

create policy "inventory items insert by owner" on public.inventory_items
for insert with check (auth.uid() = owner_id);

create policy "inventory items update by owner" on public.inventory_items
for update using (auth.uid() = owner_id);

create policy "inventory items delete by owner" on public.inventory_items
for delete using (auth.uid() = owner_id);



-- OFFLINE ADVENTURES (one active row per player, history can be added later)
create table if not exists public.offline_adventures (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  adventure_id text not null,
  started_at timestamptz not null,
  duration_sec integer not null,
  gold_total integer not null,
  xp_total integer not null,
  status text not null default 'ACTIVE',
  idempotency_key text not null,
  resolved_at timestamptz
);

create index if not exists offline_adventures_status
  on public.offline_adventures(player_id, status);

alter table public.offline_adventures enable row level security;

create policy "offline adventures readable by owner" on public.offline_adventures
for select using (auth.uid() = player_id);

create policy "offline adventures insert by owner" on public.offline_adventures
for insert with check (auth.uid() = player_id);

create policy "offline adventures update by owner" on public.offline_adventures
for update using (auth.uid() = player_id);

create policy "offline adventures delete by owner" on public.offline_adventures
for delete using (auth.uid() = player_id);



-- ============================================================
-- Phase 3+4: Market v1 + Clans/Courts v1 (server-authoritative)
-- ============================================================

create extension if not exists pgcrypto;

-- Idempotency keys (prevents replayed rewards / purchases)
create table if not exists public.idempotency_keys (
  key text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.idempotency_keys enable row level security;

drop policy if exists "idempotency_keys_select_own" on public.idempotency_keys;
create policy "idempotency_keys_select_own"
  on public.idempotency_keys for select
  using (owner_id = auth.uid());

drop policy if exists "idempotency_keys_insert_own" on public.idempotency_keys;
create policy "idempotency_keys_insert_own"
  on public.idempotency_keys for insert
  with check (owner_id = auth.uid());

-- Helper: ensure a resource_state row exists for current user
create or replace function public.ensure_resource_state()
returns public.resource_state
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  row public.resource_state;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into public.resource_state(player_id)
  values (uid)
  on conflict (player_id) do nothing;

  select * into row from public.resource_state where player_id = uid;
  return row;
end;
$$;

-- Economy apply: safe gold/xp mutation + receipt, idempotent by key.
create or replace function public.economy_apply(
  p_delta_gold integer,
  p_delta_xp integer,
  p_idempotency_key text,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb
)
returns public.resource_state
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  row public.resource_state;
  new_gold integer;
  new_xp integer;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  perform public.ensure_resource_state();

  -- idempotency: if already processed, no-op and return current state
  if p_idempotency_key is not null and length(p_idempotency_key) > 0 then
    begin
      insert into public.idempotency_keys(key, owner_id) values (p_idempotency_key, uid);
    exception when unique_violation then
      select * into row from public.resource_state where player_id = uid;
      return row;
    end;
  end if;

  select * into row from public.resource_state where player_id = uid for update;

  new_gold := row.gold + coalesce(p_delta_gold,0);
  new_xp := row.xp + coalesce(p_delta_xp,0);

  if new_gold < 0 then
    raise exception 'INSUFFICIENT_GOLD';
  end if;

  if new_gold > 1000000000 then
    new_gold := 1000000000;
  end if;
  if new_xp < 0 then
    new_xp := 0;
  end if;

  update public.resource_state
    set gold = new_gold,
        xp = new_xp,
        updated_at = now()
    where player_id = uid;

  -- receipt report
  insert into public.reports(id, recipient_id, kind, title, body, payload)
  values (
    'r_' || encode(gen_random_bytes(10),'hex'),
    uid,
    'RECEIPT',
    coalesce(p_title,'Receipt'),
    coalesce(p_body,''),
    coalesce(p_payload,'{}'::jsonb)
  );

  select * into row from public.resource_state where player_id = uid;
  return row;
end;
$$;

-- =========================
-- Market v1
-- =========================

create table if not exists public.market_listings (
  id text primary key,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  seller_name text not null,
  item_id text not null,
  item_key text not null,
  item_name text not null,
  rarity text not null,
  value integer not null default 0,
  price_gold integer not null,
  status text not null default 'ACTIVE',
  buyer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_market_listings_status_created
  on public.market_listings(status, created_at desc);

alter table public.market_listings enable row level security;

drop policy if exists "market_listings_select_auth" on public.market_listings;
create policy "market_listings_select_auth"
  on public.market_listings for select
  using (auth.uid() is not null);

drop policy if exists "market_listings_insert_own" on public.market_listings;
create policy "market_listings_insert_own"
  on public.market_listings for insert
  with check (seller_id = auth.uid());

drop policy if exists "market_listings_update_own" on public.market_listings;
create policy "market_listings_update_own"
  on public.market_listings for update
  using (seller_id = auth.uid());

create or replace function public.market_create_listing(p_item_id text, p_price_gold integer)
returns public.market_listings
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  inv public.inventory_items;
  listing public.market_listings;
  price integer := greatest(1, least(coalesce(p_price_gold,1), 1000000));
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- charge listing fee (sink) + receipt
  perform public.economy_apply(-2, 0, 'list_' || p_item_id, 'Market Listing Fee', 'Paid listing fee.', jsonb_build_object('fee',2,'itemId',p_item_id));

  -- remove item from seller inventory
  delete from public.inventory_items
  where id = p_item_id and owner_id = uid
  returning * into inv;

  if inv.id is null then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  insert into public.market_listings(
    id, seller_id, seller_name, item_id, item_key, item_name, rarity, value,
    price_gold, status, buyer_id, created_at, updated_at
  ) values (
    'lst_' || encode(gen_random_bytes(10),'hex'),
    uid,
    (select username from public.profiles where id = uid),
    inv.id, inv.item_key, inv.item_name, inv.rarity, inv.value,
    price,
    'ACTIVE',
    null,
    now(), now()
  )
  returning * into listing;

  return listing;
end;
$$;

create or replace function public.market_cancel_listing(p_listing_id text)
returns void
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  lst public.market_listings;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into lst from public.market_listings where id = p_listing_id for update;
  if lst.id is null then raise exception 'LISTING_NOT_FOUND'; end if;
  if lst.seller_id <> uid then raise exception 'FORBIDDEN'; end if;
  if lst.status <> 'ACTIVE' then return; end if;

  -- return item to inventory
  insert into public.inventory_items(id, owner_id, item_key, item_name, rarity, value, obtained_from)
  values (
    'itm_' || encode(gen_random_bytes(10),'hex'),
    uid,
    lst.item_key, lst.item_name, lst.rarity, lst.value,
    'market_cancel'
  );

  update public.market_listings
    set status = 'CANCELED', updated_at = now()
    where id = lst.id;

  insert into public.reports(id, recipient_id, kind, title, body, payload)
  values (
    'r_' || encode(gen_random_bytes(10),'hex'),
    uid,
    'RECEIPT',
    'Market Listing Canceled',
    'Canceled listing and returned item.',
    jsonb_build_object('listingId', lst.id, 'itemKey', lst.item_key)
  );
end;
$$;

create or replace function public.market_buy_listing(p_listing_id text)
returns void
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  lst public.market_listings;
  buyer public.resource_state;
  seller public.resource_state;
  price integer;
  tax integer;
  net integer;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into lst from public.market_listings where id = p_listing_id for update;
  if lst.id is null then raise exception 'LISTING_NOT_FOUND'; end if;
  if lst.status <> 'ACTIVE' then raise exception 'NOT_FOR_SALE'; end if;
  if lst.seller_id = uid then raise exception 'CANNOT_BUY_OWN'; end if;

  price := greatest(1, least(coalesce(lst.price_gold,1), 1000000));
  tax := greatest(0, floor(price * 0.05));
  net := greatest(0, price - tax);

  -- debit buyer (idempotent)
  perform public.economy_apply(-price, 0, 'buy_' || p_listing_id, 'Market Purchase', 'Bought an item.', jsonb_build_object('listingId',lst.id,'price',price,'tax',tax,'itemKey',lst.item_key));

  -- credit seller net (direct; receipt for seller)
  insert into public.resource_state(player_id) values (lst.seller_id) on conflict do nothing;
  select * into seller from public.resource_state where player_id = lst.seller_id for update;

  update public.resource_state set gold = gold + net, updated_at = now() where player_id = lst.seller_id;

  insert into public.reports(id, recipient_id, kind, title, body, payload)
  values (
    'r_' || encode(gen_random_bytes(10),'hex'),
    lst.seller_id,
    'RECEIPT',
    'Market Sale',
    'Sold an item.',
    jsonb_build_object('listingId',lst.id,'gross',price,'tax',tax,'net',net,'itemKey',lst.item_key)
  );

  -- transfer item to buyer
  insert into public.inventory_items(id, owner_id, item_key, item_name, rarity, value, obtained_from)
  values (
    'itm_' || encode(gen_random_bytes(10),'hex'),
    uid,
    lst.item_key, lst.item_name, lst.rarity, lst.value,
    'market_buy'
  );

  -- mark listing sold
  update public.market_listings
    set status = 'SOLD', buyer_id = uid, updated_at = now()
    where id = lst.id;

end;
$$;

-- =========================
-- Clans/Courts v1
-- =========================

create table if not exists public.clans (
  id text primary key,
  name text not null unique,
  treasury_gold integer not null default 0,
  tax_pct numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clan_members (
  clan_id text not null references public.clans(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'MEMBER',
  joined_at timestamptz not null default now(),
  primary key (clan_id, player_id)
);

create index if not exists idx_clan_members_player on public.clan_members(player_id);

alter table public.clans enable row level security;
alter table public.clan_members enable row level security;

drop policy if exists "clans_select_auth" on public.clans;
create policy "clans_select_auth" on public.clans for select using (auth.uid() is not null);

drop policy if exists "clan_members_select_auth" on public.clan_members;
create policy "clan_members_select_auth" on public.clan_members for select using (auth.uid() is not null);

-- projects (treasury sinks)
create table if not exists public.court_projects (
  id text primary key,
  clan_id text not null references public.clans(id) on delete cascade,
  title text not null,
  goal_gold integer not null,
  funded_gold integer not null default 0,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.court_projects enable row level security;

drop policy if exists "court_projects_select_auth" on public.court_projects;
create policy "court_projects_select_auth" on public.court_projects for select using (auth.uid() is not null);

create or replace function public._clan_role(p_clan_id text, p_user uuid)
returns text
language sql
stable
as $$
  select role from public.clan_members where clan_id = p_clan_id and player_id = p_user;
$$;

create or replace function public.clan_create(p_name text)
returns public.clans
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  cleaned text := trim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g'));
  c public.clans;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(cleaned) < 3 then raise exception 'NAME_TOO_SHORT'; end if;
  if length(cleaned) > 24 then raise exception 'NAME_TOO_LONG'; end if;

  insert into public.clans(id, name, treasury_gold, tax_pct, created_at, updated_at)
  values ('cln_' || encode(gen_random_bytes(10),'hex'), cleaned, 0, 0, now(), now())
  returning * into c;

  insert into public.clan_members(clan_id, player_id, role)
  values (c.id, uid, 'LEADER');

  insert into public.reports(id, recipient_id, kind, title, body, payload)
  values ('r_' || encode(gen_random_bytes(10),'hex'), uid, 'RECEIPT', 'Court Created', 'Created a court.', jsonb_build_object('clanId',c.id,'name',c.name));

  return c;
end;
$$;

create or replace function public.clan_join(p_clan_id text)
returns void
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  -- only one clan per player
  if exists (select 1 from public.clan_members where player_id = uid) then
    raise exception 'ALREADY_IN_CLAN';
  end if;

  insert into public.clan_members(clan_id, player_id, role)
  values (p_clan_id, uid, 'MEMBER');

  insert into public.reports(id, recipient_id, kind, title, body, payload)
  values ('r_' || encode(gen_random_bytes(10),'hex'), uid, 'RECEIPT', 'Joined Court', 'Joined a court.', jsonb_build_object('clanId',p_clan_id));
end;
$$;

create or replace function public.clan_leave()
returns void
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  m public.clan_members;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into m from public.clan_members where player_id = uid limit 1;
  if m.player_id is null then return; end if;
  if m.role = 'LEADER' then
    raise exception 'LEADER_CANNOT_LEAVE';
  end if;

  delete from public.clan_members where clan_id = m.clan_id and player_id = uid;

  insert into public.reports(id, recipient_id, kind, title, body, payload)
  values ('r_' || encode(gen_random_bytes(10),'hex'), uid, 'RECEIPT', 'Left Court', 'Left a court.', jsonb_build_object('clanId',m.clan_id));
end;
$$;

create or replace function public.clan_deposit(p_amount_gold integer)
returns void
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  m public.clan_members;
  amt integer := greatest(1, coalesce(p_amount_gold,1));
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into m from public.clan_members where player_id = uid limit 1;
  if m.player_id is null then raise exception 'NO_CLAN'; end if;

  -- debit player (idempotent) + receipt
  perform public.economy_apply(-amt, 0, 'clan_deposit_' || encode(gen_random_bytes(6),'hex'), 'Court Deposit', 'Deposited gold to treasury.', jsonb_build_object('amount',amt,'clanId',m.clan_id));

  -- credit treasury
  update public.clans
    set treasury_gold = treasury_gold + amt,
        updated_at = now()
    where id = m.clan_id;
end;
$$;

create or replace function public.clan_set_tax(p_clan_id text, p_tax_pct numeric)
returns void
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  role text;
  pct numeric := greatest(0, least(coalesce(p_tax_pct,0), 0.10));
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  role := public._clan_role(p_clan_id, uid);
  if role is null then raise exception 'FORBIDDEN'; end if;
  if role not in ('LEADER','OFFICER') then raise exception 'FORBIDDEN'; end if;

  update public.clans set tax_pct = pct, updated_at = now() where id = p_clan_id;

  insert into public.reports(id, recipient_id, kind, title, body, payload)
  values ('r_' || encode(gen_random_bytes(10),'hex'), uid, 'RECEIPT', 'Court Tax Updated', 'Updated court tax.', jsonb_build_object('clanId',p_clan_id,'taxPct',pct));
end;
$$;

create or replace function public.clan_create_project(p_clan_id text, p_template_key text, p_title text, p_goal_gold integer)
returns public.court_projects
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  role text;
  pr public.court_projects;
  goal integer := greatest(1, coalesce(p_goal_gold,1));
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  role := public._clan_role(p_clan_id, uid);
  if role is null then raise exception 'FORBIDDEN'; end if;
  if role not in ('LEADER','OFFICER') then raise exception 'FORBIDDEN'; end if;

  insert into public.court_projects(id, clan_id, title, goal_gold, funded_gold, status, created_at, updated_at)
  values ('prj_' || encode(gen_random_bytes(10),'hex'), p_clan_id, coalesce(p_title,'Project'), goal, 0, 'ACTIVE', now(), now())
  returning * into pr;

  insert into public.reports(id, recipient_id, kind, title, body, payload)
  values ('r_' || encode(gen_random_bytes(10),'hex'), uid, 'RECEIPT', 'Court Project Started', 'Started a court project.', jsonb_build_object('projectId',pr.id,'clanId',p_clan_id,'goal',goal,'template',p_template_key));

  return pr;
end;
$$;

create or replace function public.clan_fund_project(p_project_id text, p_amount_gold integer)
returns void
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
  pr public.court_projects;
  role text;
  amt integer := greatest(1, coalesce(p_amount_gold,1));
  new_funded integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into pr from public.court_projects where id = p_project_id for update;
  if pr.id is null then raise exception 'PROJECT_NOT_FOUND'; end if;

  role := public._clan_role(pr.clan_id, uid);
  if role is null then raise exception 'FORBIDDEN'; end if;
  if role not in ('LEADER','OFFICER') then raise exception 'FORBIDDEN'; end if;

  -- spend from treasury (sink)
  update public.clans
    set treasury_gold = treasury_gold - amt,
        updated_at = now()
    where id = pr.clan_id and treasury_gold >= amt;

  if not found then
    raise exception 'INSUFFICIENT_TREASURY';
  end if;

  new_funded := pr.funded_gold + amt;

  update public.court_projects
    set funded_gold = new_funded,
        status = case when new_funded >= pr.goal_gold then 'COMPLETED' else 'ACTIVE' end,
        updated_at = now()
    where id = pr.id;

  insert into public.reports(id, recipient_id, kind, title, body, payload)
  values (
    'r_' || encode(gen_random_bytes(10),'hex'),
    uid,
    'RECEIPT',
    'Court Project Funded',
    'Funded a court project from treasury.',
    jsonb_build_object('projectId',pr.id,'amount',amt,'newFunded',new_funded,'goal',pr.goal_gold)
  );
end;
$$;

