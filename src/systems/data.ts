import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { ensureMyProfile, pingLastSeen } from "../lib/profiles";
import { Action, ActionKind, ChatMessage, Profile, Report, Resources, InventoryState, VaultState, Item } from "../types";
import { loadOfflineState, saveOfflineState, offlineNowIso, offlineUid } from "./offlineStore";
import { computeVigorRules, applyVigorRegen } from "./vigor";
import { ACTIONS, queueAction, resolveActionToReport } from "./actions";
import { makeChatMessage } from "./chat";
import { applyGoldDelta, addProcessed, hasProcessed } from "./economy";
import { collectDomainIncome as domainsCollectDomainIncome, applyDomainIncome } from "./domains";
import { collectDomainVault } from "./domains";
import { getVaultState, setVaultState, addVaultItem, removeVaultItem } from "./vault";

/** Offline: apply regen + resolve due queued actions */
function ensureOfflineTick() {
  const st = loadOfflineState();
  const now = new Date();
  const last = new Date(st.last_tick_iso);

  const rules = computeVigorRules(st.profile);
  const resources: Resources = { ...st.resources, ...rules };
  const regen = applyVigorRegen(resources, last, now);

  const actions = st.actions.map((a) => ({ ...a }));
  const reports = st.reports.map((r) => ({ ...r }));
  let gold = regen.gold;

  for (const a of actions) {
    if (a.status === "QUEUED" && new Date(a.resolves_at).getTime() <= now.getTime()) {
      const { goldDelta, report } = resolveActionToReport(a);

      // Idempotency: never apply rewards twice for the same action id.
      const pid = String(a.id);
      if (!hasProcessed(st.processed_action_ids ?? [], pid)) {
        const res = applyGoldDelta(gold, goldDelta);
        // If a delta would underflow, reject the gold change but still record the resolution.
        if (res.ok) {
          gold = res.next;
        }
        st.processed_action_ids = addProcessed(st.processed_action_ids ?? [], pid);
        reports.push(report);
      }

      a.status = "RESOLVED";
      a.resolved_at = now.toISOString();
    }
  }


  
  // Domain passive income (offline): accrue into the vault and surface as a Chronicle report.
  try {
    const ticked = applyDomainIncome(st.profile.id, st.domain);
    if (ticked.earned > 0) {
      st.domain = ticked.domain as any;
      const body = `While the city slept, your Domain harvested ${ticked.earned} gold into its vault.\n\nA quiet gain… but hoarded gold draws attention.`;
      reports.push({
        id: offlineUid("rep"),
        recipient_id: st.profile.id,
        kind: "SYSTEM",
        title: "The Domain Stirs",
        body,
        payload: { kind: "DOMAIN_INCOME", earned: ticked.earned, tier: ticked.domain.tier },
        is_unread: true,
        created_at: offlineNowIso(),
      } as any);
    }
  } catch {
    // ignore
  }

const next: any = {
    ...st,
    resources: { ...regen, gold },
    actions,
    reports,
    last_tick_iso: now.toISOString(),
  };

  saveOfflineState(next);
}

export async function getProfile(): Promise<Profile> {
  if (!isSupabaseConfigured || !supabase) {
    ensureOfflineTick();
    return loadOfflineState().profile;
  }

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    // Should be blocked by RequireAuth, but keep safe.
    return { id: "guest", username: "Guest", premium: false, level: 1, risk_state: "Protected" };
  }

  const profile = await ensureMyProfile(user);
  pingLastSeen(profile.id);
  return profile;
}

export async function getResources(): Promise<Resources> {
  if (!isSupabaseConfigured || !supabase) {
    ensureOfflineTick();
    return loadOfflineState().resources;
  }

  const profile = await getProfile();
  const rules = computeVigorRules(profile);

  const { data: sessionRes } = await supabase.auth.getSession();
  const uid = sessionRes.session?.user.id;
  if (!uid) return { gold: 0, xp: 0, vigor: rules.vigor_cap, vigor_cap: rules.vigor_cap, vigor_regen_minutes: rules.vigor_regen_minutes };

  await resolveDueActionsOnline(uid);

  await supabase.rpc("ensure_resource_state");
  const { data, error } = await supabase.from("resource_state").select("*").eq("player_id", uid).maybeSingle();
  if (error) throw error;

  const nowIso = new Date().toISOString();

  if (!data) {
    const ins = await supabase.from("resource_state").insert({
      player_id: uid,
      gold: 1000,
      xp: 0,
      vigor: rules.vigor_cap,
      vigor_updated_at: nowIso,
    });
    if (ins.error) throw ins.error;
    return { gold: 1000, xp: 0, vigor: rules.vigor_cap, vigor_cap: rules.vigor_cap, vigor_regen_minutes: rules.vigor_regen_minutes };
  }

  const last = new Date(String((data as any).vigor_updated_at));
  const now = new Date();
  const regen = applyVigorRegen(
    { gold: Number((data as any).gold), xp: Number((data as any).xp ?? 0), vigor: Number((data as any).vigor), ...rules },
    last,
    now
  );

  if (regen.vigor !== Number((data as any).vigor)) {
    await supabase.from("resource_state").update({ vigor: regen.vigor, vigor_updated_at: nowIso }).eq("player_id", uid);
  }

  return regen;
}

export async function listReports(limit = 40): Promise<Report[]> {
  if (!isSupabaseConfigured || !supabase) {
    ensureOfflineTick();
    const st = loadOfflineState();
    return [...st.reports].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit);
  }

  const { data: sessionRes } = await supabase.auth.getSession();
  const uid = sessionRes.session?.user.id;
  if (!uid) return [];

  await resolveDueActionsOnline(uid);

  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("recipient_id", uid)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as any;
}

export async function listMyActions(limit: number = 50): Promise<Action[]> {
  if (!isSupabaseConfigured || !supabase) {
    ensureOfflineTick();
    const st = loadOfflineState();
    return [...st.actions].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit);
  }

  const { data: sessionRes } = await supabase.auth.getSession();
  const uid = sessionRes.session?.user.id;
  if (!uid) return [];

  await resolveDueActionsOnline(uid);

  const { data, error } = await supabase
    .from("actions")
    .select("*")
    .eq("actor_id", uid)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as any;
}

export async function queuePlayerAction(kind: ActionKind, target_id?: string | null): Promise<Action> {
  if (!isSupabaseConfigured || !supabase) {
    ensureOfflineTick();
    const st = loadOfflineState();

    const t = ACTIONS[kind];
    if (st.resources.vigor < t.vigor_cost) throw new Error("Not enough Vigor.");
    // Safety cooldown: prevent queuing the same action kind while one is already active.
    if (st.actions.some((a) => a.kind === kind && a.status === "QUEUED")) {
      throw new Error("Action already in progress.");
    }

    const action = queueAction(st.profile.id, kind, target_id);
    const next = {
      ...st,
      resources: { ...st.resources, vigor: st.resources.vigor - t.vigor_cost },
      actions: [action, ...st.actions],
    };
    saveOfflineState(next);
    return action;
  }

  const profile = await getProfile();
  const uid = profile.id;

  // Make sure due actions are resolved before spending
  await resolveDueActionsOnline(uid);

  const resources = await getResources();
  const t = ACTIONS[kind];
  if (resources.vigor < t.vigor_cost) throw new Error("Not enough Vigor.");

  // Safety cooldown: prevent queuing the same action kind while one is already active.
  const { data: activeSame, error: activeErr } = await supabase
    .from("actions")
    .select("id")
    .eq("actor_id", uid)
    .eq("kind", kind)
    .eq("status", "QUEUED")
    .limit(1);
  if (activeErr) throw activeErr;
  if (activeSame && activeSame.length > 0) throw new Error("Action already in progress.");

  const action = queueAction(uid, kind, target_id);

  // Insert action
  const ins = await supabase.from("actions").insert({
    id: action.id,
    actor_id: uid,
    kind,
    target_id: target_id ?? null,
    vigor_cost: t.vigor_cost,
    gold_delta_min: t.gold_delta_min,
    gold_delta_max: t.gold_delta_max,
    duration_seconds: t.duration_seconds,
    status: "QUEUED",
    resolves_at: action.resolves_at,
    resolved_at: null,
    created_at: action.created_at,
  });
  if (ins.error) throw ins.error;

  // Spend vigor immediately
  const nowIso = new Date().toISOString();
  const up = await supabase
    .from("resource_state")
    .update({ vigor: Math.max(0, resources.vigor - t.vigor_cost), vigor_updated_at: nowIso })
    .eq("player_id", uid);
  if (up.error) throw up.error;

  return action;
}

export async function listChat(channel: ChatMessage["channel"], limit = 80): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured || !supabase) {
    ensureOfflineTick();
    const st = loadOfflineState();
    const msgs = st.chat.filter((m) => m.channel === channel);
    return msgs.slice(-limit);
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("channel", channel)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = (data ?? []) as any[];
  // display oldest -> newest
  return rows.reverse().map((r) => ({
    id: String(r.id),
    channel: r.channel,
    sender_id: String(r.sender_id),
    sender_name: String(r.sender_name),
    message: String(r.message),
    created_at: String(r.created_at),
  }));
}

export async function sendChat(channel: ChatMessage["channel"], message: string): Promise<void> {
  const msg = (message ?? "").trim();
  if (!msg) return;

  if (!isSupabaseConfigured || !supabase) {
    ensureOfflineTick();
    const st = loadOfflineState();
    const m = makeChatMessage({ channel, sender_id: st.profile.id, sender_name: st.profile.username, message: msg });
    saveOfflineState({ ...st, chat: [...st.chat, m] });
    return;
  }

  const profile = await getProfile();
  const uid = profile.id;

  const ins = await supabase.from("chat_messages").insert({
    channel,
    sender_id: uid,
    sender_name: profile.username,
    message: msg.slice(0, 240),
  });

  if (ins.error) throw ins.error;
}


export async function getProfileById(id: string): Promise<Profile | null> {
  if (!id) return null;
  if (!isSupabaseConfigured || !supabase) {
    ensureOfflineTick();
    const st = loadOfflineState();
    return st.profile.id === id ? st.profile : null;
  }

  const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as any) ?? null;
}


export async function markReportRead(id: string): Promise<void> {
  if (!id) return;
  if (!isSupabaseConfigured || !supabase) {
    ensureOfflineTick();
    const st = loadOfflineState();
    const nextReports = st.reports.map((r) => (r.id === id ? { ...r, is_unread: false } : r));
    saveOfflineState({ ...st, reports: nextReports });
    return;
  }

  const { data: sessionRes } = await supabase.auth.getSession();
  const uid = sessionRes.session?.user.id;
  if (!uid) return;

  const upd = await supabase.from("reports").update({ is_unread: false }).eq("id", id).eq("recipient_id", uid);
  if (upd.error) throw upd.error;
}


export async function listLeaderboard(limit: number = 50) {
  if (!isSupabaseConfigured || !supabase) {
    ensureOfflineTick();
    const st = loadOfflineState();
    return [
      {
        ...st.profile,
        gold: st.resources.gold,
      },
    ];
  }

  // Online: rank by level desc, then last_seen desc (best-effort), then username.
  const { data: profs, error } = await supabase
    .from("profiles")
    .select("id, username, premium, level, risk_state, created_at, last_seen")
    .order("level", { ascending: false })
    .order("last_seen", { ascending: false, nullsFirst: false })
    .order("username", { ascending: true })
    .limit(limit);

  if (error) throw error;

  const ids = (profs || []).map((p: any) => p.id).filter(Boolean);
  let goldById: Record<string, number> = {};

  if (ids.length) {
    const rs = await supabase.from("resource_state").select("player_id, gold").in("player_id", ids);
    if (!rs.error && rs.data) {
      goldById = Object.fromEntries(rs.data.map((r: any) => [r.player_id, r.gold]));
    }
  }

  return (profs || []).map((p: any) => ({
    id: p.id,
    username: p.username,
    premium: !!p.premium,
    level: p.level ?? 1,
    risk_state: (p.risk_state ?? "Protected"),
    created_at: p.created_at ?? undefined,
    last_seen: p.last_seen ?? undefined,
    gold: typeof goldById[p.id] === "number" ? goldById[p.id] : undefined,
  }));
}

export type LegendEntry = {
  id: string;
  username: string;
  level: number;
  premium: boolean;
  risk_state: string;
  created_at?: string;
  last_seen?: string;
  gold?: number;
  domain_tier?: number;
  chronicle_count?: number;
};

/**
 * Legends of Hemlock (v1)
 * Sort order: Domain Tier desc, then Gold desc, then Chronicle Count desc, then Username.
 * Offline mode returns a single local entry.
 */
export async function listLegends(limit: number = 50): Promise<LegendEntry[]> {
  if (!isSupabaseConfigured || !supabase) {
    ensureOfflineTick();
    const st = loadOfflineState();
    const domain = st.domain;
    return [{
      id: st.profile.id,
      username: st.profile.username,
      level: st.profile.level,
      premium: !!st.profile.premium,
      risk_state: st.profile.risk_state,
      created_at: st.profile.created_at,
      last_seen: st.profile.last_seen,
      gold: st.resources.gold,
      domain_tier: domain?.tier ?? 1,
      chronicle_count: st.reports.length,
    }];
  }

  // Base profiles
  const { data: profs, error } = await supabase
    .from("profiles")
    .select("id, username, premium, level, risk_state, created_at, last_seen")
    .order("username", { ascending: true })
    .limit(limit);

  if (error) throw error;

  const ids = (profs || []).map((p: any) => p.id).filter(Boolean);

  // Gold
  let goldById: Record<string, number> = {};
  if (ids.length) {
    const rs = await supabase.from("resource_state").select("player_id, gold").in("player_id", ids);
    if (!rs.error && rs.data) goldById = Object.fromEntries(rs.data.map((r: any) => [r.player_id, Number(r.gold ?? 0)]));
  }

  // Domain tiers
  let tierById: Record<string, number> = {};
  if (ids.length) {
    const ds = await supabase.from("domain_state").select("player_id, tier").in("player_id", ids);
    if (!ds.error && ds.data) tierById = Object.fromEntries(ds.data.map((r: any) => [r.player_id, Number(r.tier ?? 1)]));
  }

  // Chronicle counts (best-effort): pull recent reports for listed ids and count locally.
  let chronById: Record<string, number> = {};
  if (ids.length) {
    const rep = await supabase.from("reports").select("recipient_id").in("recipient_id", ids).limit(1000);
    if (!rep.error && rep.data) {
      for (const r of rep.data as any[]) {
        const k = String((r as any).recipient_id);
        chronById[k] = (chronById[k] ?? 0) + 1;
      }
    }
  }

  const rows: LegendEntry[] = (profs || []).map((p: any) => ({
    id: p.id,
    username: p.username,
    premium: !!p.premium,
    level: p.level ?? 1,
    risk_state: (p.risk_state ?? "Protected"),
    created_at: p.created_at ?? undefined,
    last_seen: p.last_seen ?? undefined,
    gold: typeof goldById[p.id] === "number" ? goldById[p.id] : undefined,
    domain_tier: typeof tierById[p.id] === "number" ? tierById[p.id] : undefined,
    chronicle_count: typeof chronById[p.id] === "number" ? chronById[p.id] : 0,
  }));

  // Sort
  rows.sort((a, b) => {
    const ta = a.domain_tier ?? 1, tb = b.domain_tier ?? 1;
    if (tb !== ta) return tb - ta;
    const ga = a.gold ?? 0, gb = b.gold ?? 0;
    if (gb !== ga) return gb - ga;
    const ca = a.chronicle_count ?? 0, cb = b.chronicle_count ?? 0;
    if (cb !== ca) return cb - ca;
    return String(a.username).localeCompare(String(b.username));
  });

  return rows;
}


const MIGRATE_KEY = "hemlock:offline_migrated_v1";

/**
 * Records a one-time “legacy snapshot” report online if the player previously used the offline prototype.
 * This does NOT import resources or power (anti-exploit). It simply preserves narrative continuity.
 */
export async function migrateOfflineSnapshotToOnline(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  try {
    if (localStorage.getItem(MIGRATE_KEY) === "1") return;

    const st = loadOfflineState() as any;
    const offlineId = st?.profile?.id;
    if (!offlineId) {
      localStorage.setItem(MIGRATE_KEY, "1");
      return;
    }

    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return;

    // No power import. Only a neutral receipt-like note for continuity.
    if (offlineId !== uid) {
      await supabase.from("reports").insert({
        recipient_id: uid,
        kind: "SYSTEM",
        title: "Offline Prototype Detected",
        body: `An offline identity was found (${offlineId}). No resources were imported.`,
        payload: { kind: "OFFLINE_SNAPSHOT", offlineId },
        is_unread: true,
        created_at: new Date().toISOString(),
      });
    }

    localStorage.setItem(MIGRATE_KEY, "1");
  } catch {
    // non-critical
  }
}

export async function collectDomainIncome(): Promise<{ earned: number; upkeep: number; charged: number; becameVulnerable: boolean }> {
  const res = await domainsCollectDomainIncome();
  // Offline receipts
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState() as any;
    const rep: Report = {
      id: offlineUid("rep"),
      recipient_id: st.profile.id,
      kind: "SYSTEM",
      title: "Domain Income Collected",
      body: `Earned ${res.earned} gold into vault. Upkeep ${res.upkeep}.`,
      payload: { kind: "DOMAIN_COLLECT", ...res },
      is_unread: true,
      created_at: offlineNowIso(),
    };
    saveOfflineState({ ...st, reports: [rep, ...st.reports].slice(0, 200) });
  }
  return { earned: res.earned, upkeep: res.upkeep, charged: res.charged, becameVulnerable: res.becameVulnerable };
}



export async function collectDomainGold(): Promise<{ amount: number }> {
  const res = await collectDomainVault();
  const amount = res.amount;

  // Offline: create a neutral receipt report
  if (amount > 0 && (!isSupabaseConfigured || !supabase)) {
    const st = loadOfflineState() as any;
    const rep: Report = {
      id: offlineUid("rep"),
      recipient_id: st.profile.id,
      kind: "SYSTEM",
      title: "Domain Vault Collected",
      body: `Vault transfer: +${amount} gold.`,
      payload: { kind: "DOMAIN_VAULT", amount },
      is_unread: true,
      created_at: offlineNowIso(),
    };
    saveOfflineState({ ...st, reports: [rep, ...st.reports].slice(0, 200) });
  }

  return { amount };
}


export async function getInventory(): Promise<InventoryState> {
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState();
    return st.inventory;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("AUTH_REQUIRED");

  const { data, error } = await supabase
    .from("inventory_items")
    .select("id,item_key,item_name,rarity,value,obtained_from,obtained_at")
    .eq("owner_id", user.id)
    .order("obtained_at", { ascending: false });
  if (error) throw error;

  const items: Item[] = Array.isArray(data)
    ? data.map((r: any) => ({
        id: String(r.id),
        key: String(r.item_key),
        name: String(r.item_name),
        rarity: String(r.rarity) as any,
        value: Number(r.value ?? 0),
        obtained_from: r.obtained_from ? String(r.obtained_from) : undefined,
        obtained_at: r.obtained_at ? String(r.obtained_at) : undefined,
      }))
    : [];

  return { player_id: user.id, max_slots: 30, items, updated_at: new Date().toISOString() };
}

export async function getVault(): Promise<VaultState> {
  return getVaultState();
}

export async function moveInventoryItemToVault(itemId: string): Promise<{ ok: boolean }>
{
  if (!itemId) return { ok: false };

  // OFFLINE
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState() as any;
    const idx = st.inventory.items.findIndex((it: Item) => it.id === itemId);
    if (idx < 0) return { ok: false };
    const [item] = st.inventory.items.splice(idx, 1);
    st.vault.items = Array.isArray(st.vault.items) ? st.vault.items : [];
    st.vault.items.unshift(item);
    st.inventory.updated_at = offlineNowIso();
    st.vault.updated_at = offlineNowIso();
    saveOfflineState(st);
    return { ok: true };
  }

  // ONLINE: inventory is DB-backed; vault is localStorage-backed.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("AUTH_REQUIRED");

  const inv = await getInventory();
  const idx = inv.items.findIndex((it) => it.id === itemId);
  if (idx < 0) return { ok: false };
  const [item] = inv.items.splice(idx, 1);

  const { error: delErr } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", itemId)
    .eq("owner_id", user.id);
  if (delErr) throw delErr;

  await addVaultItem(item);
  return { ok: true };
}

export async function moveVaultItemToInventory(itemId: string): Promise<{ ok: boolean }>
{
  if (!itemId) return { ok: false };

  // OFFLINE
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState() as any;
    const idx = st.vault.items.findIndex((it: Item) => it.id === itemId);
    if (idx < 0) return { ok: false };
    const [item] = st.vault.items.splice(idx, 1);
    st.inventory.items = Array.isArray(st.inventory.items) ? st.inventory.items : [];
    st.inventory.items.unshift(item);
    st.inventory.updated_at = offlineNowIso();
    st.vault.updated_at = offlineNowIso();
    saveOfflineState(st);
    return { ok: true };
  }

  // ONLINE: vault localStorage -> inventory DB
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("AUTH_REQUIRED");

  const item = await removeVaultItem(itemId);
  if (!item) return { ok: false };

  const { error: insErr } = await supabase
    .from("inventory_items")
    .insert({
      owner_id: user.id,
      item_key: item.key,
      item_name: item.name,
      rarity: item.rarity,
      value: item.value,
      obtained_from: item.obtained_from ?? null,
      obtained_at: item.obtained_at ?? new Date().toISOString(),
    });
  if (insErr) throw insErr;

  return { ok: true };
}

export async function sellVaultItem(itemId: string): Promise<{ ok: boolean; goldGained: number }> {
  if (!itemId) return { ok: false, goldGained: 0 };

  // Remove from vault first (idempotent enough for UI)
  const removed = await removeVaultItem(itemId);
  if (!removed) return { ok: false, goldGained: 0 };

  const { sellValue } = await import("./items");
  const gained = sellValue(removed);

  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState() as any;
    const gRes = applyGoldDelta(st.resources.gold, gained);
    if (gRes.ok) st.resources.gold = gRes.next;
    st.reports.unshift({
      id: offlineUid("rep"),
      recipient_id: st.profile.id,
      kind: "SYSTEM",
      title: "Item Sold",
      body: `Sold ${removed.key} for ${gained} gold.`,
      payload: { itemId, gained, from: "vault" },
      is_unread: true,
      created_at: offlineNowIso(),
    });
    saveOfflineState(st);
    return { ok: true, goldGained: gained };
  }

  // ONLINE: credit gold via receipts
  const econ = await supabase.rpc("economy_apply", {
    p_delta_gold: gained,
    p_delta_xp: 0,
    p_idempotency_key: `sell_vault_${itemId}`,
    p_title: "Item Sold",
    p_body: `Sold ${removed.key} for ${gained} gold.`,
    p_payload: { itemId, gained, itemKey: removed.key, from: "vault" },
  });
  if (econ.error) throw econ.error;

  return { ok: true, goldGained: gained };
}

export async function depositGoldToVault(amount: number): Promise<{ ok: boolean; deposited: number }> {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, deposited: 0 };

  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState() as any;
    const gRes = applyGoldDelta(st.resources.gold, -n);
    if (!gRes.ok) return { ok: false, deposited: 0 };
    st.resources.gold = gRes.next;
    st.domain.stored_gold = Math.max(0, Math.floor(Number(st.domain.stored_gold ?? 0)) + n);
    saveOfflineState(st);
    return { ok: true, deposited: n };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("AUTH_REQUIRED");

  // Spend wallet gold via economy_apply
  const econ = await supabase.rpc("economy_apply", {
    p_delta_gold: -n,
    p_delta_xp: 0,
    p_idempotency_key: `vault_deposit_${user.id}_${Date.now()}`,
    p_title: "Vault Deposit",
    p_body: `Deposited ${n} gold into the vault.`,
    p_payload: { kind: "VAULT_DEPOSIT", amount: n },
  });
  if (econ.error) throw econ.error;

  // Credit domain vault
  const { data: domRow, error: domErr } = await supabase.from("domain_state").select("stored_gold").eq("player_id", user.id).maybeSingle();
  if (domErr) throw domErr;
  const prev = Math.max(0, Math.floor(Number((domRow as any)?.stored_gold ?? 0)));
  const next = prev + n;
  const upd = await supabase.from("domain_state").update({ stored_gold: next, updated_at: new Date().toISOString() }).eq("player_id", user.id);
  if (upd.error) throw upd.error;

  return { ok: true, deposited: n };
}

export async function withdrawGoldFromVault(amount: number): Promise<{ ok: boolean; withdrawn: number }> {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, withdrawn: 0 };

  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState() as any;
    const stored = Math.max(0, Math.floor(Number(st.domain.stored_gold ?? 0)));
    if (stored < n) return { ok: false, withdrawn: 0 };
    st.domain.stored_gold = stored - n;
    const gRes = applyGoldDelta(st.resources.gold, n);
    if (gRes.ok) st.resources.gold = gRes.next;
    saveOfflineState(st);
    return { ok: true, withdrawn: n };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("AUTH_REQUIRED");

  const { data: domRow, error: domErr } = await supabase.from("domain_state").select("stored_gold").eq("player_id", user.id).maybeSingle();
  if (domErr) throw domErr;
  const prev = Math.max(0, Math.floor(Number((domRow as any)?.stored_gold ?? 0)));
  if (prev < n) return { ok: false, withdrawn: 0 };
  const nextStored = prev - n;
  const upd = await supabase.from("domain_state").update({ stored_gold: nextStored, updated_at: new Date().toISOString() }).eq("player_id", user.id);
  if (upd.error) throw upd.error;

  const econ = await supabase.rpc("economy_apply", {
    p_delta_gold: n,
    p_delta_xp: 0,
    p_idempotency_key: `vault_withdraw_${user.id}_${Date.now()}`,
    p_title: "Vault Withdrawal",
    p_body: `Withdrew ${n} gold from the vault.`,
    p_payload: { kind: "VAULT_WITHDRAW", amount: n },
  });
  if (econ.error) throw econ.error;

  return { ok: true, withdrawn: n };
}

export async function sellInventoryItem(itemId: string): Promise<{ ok: boolean; goldGained: number }> {
  if (!itemId) return { ok: false, goldGained: 0 };

  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState();
    const idx = st.inventory.items.findIndex((it) => it.id === itemId);
    if (idx < 0) return { ok: false, goldGained: 0 };
    const [item] = st.inventory.items.splice(idx, 1);
    const { sellValue } = await import("./items");
    const gained = sellValue(item);

    const gRes = applyGoldDelta(st.resources.gold, gained);
    if (gRes.ok) st.resources.gold = gRes.next;

    st.reports.unshift({
      id: offlineUid("rep"),
      recipient_id: st.profile.id,
      kind: "SYSTEM",
      title: "Item Sold",
      body: `Sold ${item.key} for ${gained} gold.`,
      payload: { itemId, gained },
      is_unread: true,
      created_at: offlineNowIso(),
    });

    saveOfflineState(st);
    return { ok: true, goldGained: gained };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("AUTH_REQUIRED");

  const inv = await getInventory();
  const idx = inv.items.findIndex((it) => it.id === itemId);
  if (idx < 0) return { ok: false, goldGained: 0 };
  const [item] = inv.items.splice(idx, 1);

  const { sellValue } = await import("./items");
  const gained = sellValue(item);

  // Remove item from inventory_items
  const { error: delErr } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", itemId)
    .eq("owner_id", user.id);
  if (delErr) throw delErr;

// Credit gold (server-authoritative) + receipt
  const econ = await supabase.rpc("economy_apply", {
    p_delta_gold: gained,
    p_delta_xp: 0,
    p_idempotency_key: `sell_${itemId}`,
    p_title: "Item Sold",
    p_body: `Sold ${item.key} for ${gained} gold.`,
    p_payload: { itemId, gained, itemKey: item.key },
  });
  if (econ.error) throw econ.error;
return { ok: true, goldGained: gained };
}


// Pass 1 stub: online action resolution will be upgraded to RPC-backed receipts in a later pass.
async function resolveDueActionsOnline(_uid: string): Promise<void> {
  return;
}