import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const SCHEMA_SQL = `-- Hemlock Supabase schema (v1)
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

`;

function codeClass() {
  return "mt-3 rounded-xl border border-zinc-700/30 bg-black/40 p-3 text-xs text-zinc-200 whitespace-pre-wrap";
}

export default function Setup() {
  const [status, setStatus] = useState<"idle"|"checking"|"ok"|"err">("idle");
  const [detail, setDetail] = useState<string>("");

  const configured = isSupabaseConfigured && !!supabase;

  async function check() {
    if (!configured) return;
    setStatus("checking");
    setDetail("");
    try {
      const { data: sess, error: sessErr } = await supabase!.auth.getSession();
      if (sessErr) throw sessErr;
      if (!sess.session) {
        setStatus("ok");
        setDetail("Supabase is reachable. (No active session — sign in to fully verify RLS.)");
        return;
      }
      const { error: e1 } = await supabase!.from("profiles").select("id").limit(1);
      if (e1) throw e1;
      const { error: e2 } = await supabase!.from("chat_messages").select("id").limit(1);
      if (e2) throw e2;
      setStatus("ok");
      setDetail("✅ Connected and tables look accessible under your current session.");
    } catch (e: any) {
      setStatus("err");
      setDetail(e?.message ?? String(e ?? "Unknown error"));
    }
  }

  useEffect(() => { if (configured) check(); }, [configured]);

  const banner = useMemo(() => {
    if (!configured) {
      return {
        title: "Offline Mode",
        body: "Supabase env vars are not configured, so Hemlock runs offline-first. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable online auth + realtime chat."
      };
    }
    if (status === "checking") return { title: "Checking Supabase…", body: "Testing connection and table access." };
    if (status === "ok") return { title: "Supabase OK", body: detail || "Connected." };
    if (status === "err") return { title: "Supabase Error", body: detail || "Could not verify." };
    return { title: "Supabase Setup", body: "Run the schema below in Supabase SQL Editor, then reload." };
  }, [configured, status, detail]);

  return (
    <div className="min-h-screen g-noise">
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Online Setup</div>
            <div className="text-xs text-zinc-400">Auth + Profiles + Realtime Chat prerequisites</div>
          </div>
          <Link className="g-btn" to="/home">Back</Link>
        </div>

        <div className="mt-4 g-panel p-4">
          <div className="text-sm font-semibold">{banner.title}</div>
          <div className="mt-1 text-xs text-zinc-300">{banner.body}</div>

          {configured ? (
            <div className="mt-3 flex gap-2">
              <button className="g-btn" onClick={check} disabled={status==="checking"}>Test Connection</button>
              <Link className="g-btn" to="/">Go to Sign In</Link>
            </div>
          ) : null}
        </div>

        <div className="mt-5 g-panel p-4">
          <div className="text-sm font-semibold">SQL Schema</div>
          <div className="text-xs text-zinc-400 mt-1">
            Copy/paste into Supabase → SQL Editor → Run. Then come back and hit “Test Connection”.
          </div>
          <div className={codeClass()}>-- Hemlock (minimal) Supabase schema
-- Run this in Supabase SQL Editor.
-- Tables: profiles, chat_messages, reports, actions, domain_state, resource_state, offline_adventures, inventory_items
-- NOTE: This is intentionally minimal and safe for iteration.

-- PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now(),
  last_seen timestamptz
);

alter table public.profiles enable row level security;

create policy "profiles are readable by all" on public.profiles
for select using (true);

create policy "users can insert their own profile" on public.profiles
for insert with check (auth.uid() = id);

create policy "users can update their own profile" on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

-- CHAT MESSAGES
create table if not exists public.chat_messages (
  id bigserial primary key,
  channel text not null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_channel_created_at
  on public.chat_messages(channel, created_at);

alter table public.chat_messages enable row level security;

create policy "chat is readable by all authed users" on public.chat_messages
for select using (auth.role() = 'authenticated');

create policy "chat insert by authed users" on public.chat_messages
for insert with check (auth.role() = 'authenticated' and auth.uid() = sender_id);

-- REPORTS
create table if not exists public.reports (
  id bigserial primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  meta jsonb,
  is_read boolean not null default false,
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
for update using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

-- ACTIONS (log of gameplay actions, minimal)
create table if not exists public.actions (
  id bigserial primary key,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists actions_actor_created_at
  on public.actions(actor_id, created_at);

alter table public.actions enable row level security;

create policy "actions are readable by owner" on public.actions
for select using (auth.uid() = actor_id);

create policy "actions insert by owner" on public.actions
for insert with check (auth.uid() = actor_id);

-- RESOURCE STATE (simple per-user counters)
create table if not exists public.resource_state (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  gold integer not null default 0,
  vigor integer not null default 10,
  last_vigor_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.resource_state enable row level security;

create policy "resource readable by owner" on public.resource_state
for select using (auth.uid() = owner_id);

create policy "resource upsert by owner" on public.resource_state
for insert with check (auth.uid() = owner_id);

create policy "resource update by owner" on public.resource_state
for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- DOMAIN STATE
create table if not exists public.domain_state (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  tier integer not null default 0,
  defensive_rating integer not null default 1,
  stored_gold integer not null default 0,
  protection_state text not null default 'Protected',
  updated_at timestamptz not null default now()
);

alter table public.domain_state enable row level security;

create policy "domain readable by owner" on public.domain_state
for select using (auth.uid() = owner_id);

create policy "domain upsert by owner" on public.domain_state
for insert with check (auth.uid() = owner_id);

create policy "domain update by owner" on public.domain_state
for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
</div>
        </div>

        <div className="mt-5 g-panel p-4">
          <div className="text-sm font-semibold">Quick checklist</div>
          <ul className="mt-2 text-xs text-zinc-300 list-disc pl-5 space-y-1">
            <li>Create a Supabase project</li>
            <li>Set env vars in Vercel (and local .env): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY</li>
            <li>Run the SQL schema above</li>
            <li>Open Hemlock, sign up, then visit Home → Chat</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
