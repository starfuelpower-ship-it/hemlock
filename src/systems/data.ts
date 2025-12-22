import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { ensureMyProfile, pingLastSeen } from "../lib/profiles";
import { Action, ActionKind, ChatMessage, Profile, Report, Resources } from "../types";
import { loadOfflineState, saveOfflineState, offlineNowIso, offlineUid } from "./offlineStore";
import { computeVigorRules, applyVigorRegen } from "./vigor";
import { ACTIONS, queueAction, resolveActionToReport } from "./actions";
import { makeChatMessage } from "./chat";
import { applyDomainIncome } from "./domains";
import { collectDomainVault } from "./domains";

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
      a.status = "RESOLVED";
      a.resolved_at = now.toISOString();
      gold += goldDelta;
      reports.push(report);
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

async function resolveDueActionsOnline(uid: string) {
  if (!isSupabaseConfigured || !supabase) return;

  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("actions")
    .select("*")
    .eq("actor_id", uid)
    .eq("status", "QUEUED")
    .lte("resolves_at", nowIso);

  if (error) throw error;
  if (!due || due.length === 0) return;

  // Current resource state
  const { data: rs, error: rsErr } = await supabase.from("resource_state").select("*").eq("player_id", uid).maybeSingle();
  if (rsErr) throw rsErr;
  let gold = Number(rs?.gold ?? 0);

  for (const row of due as any[]) {
    const action: Action = {
      id: String(row.id),
      actor_id: String(row.actor_id),
      kind: row.kind as ActionKind,
      target_id: row.target_id ? String(row.target_id) : null,
      vigor_cost: Number(row.vigor_cost),
      gold_delta_min: Number(row.gold_delta_min),
      gold_delta_max: Number(row.gold_delta_max),
      duration_seconds: Number(row.duration_seconds),
      status: row.status as any,
      created_at: String(row.created_at),
      resolves_at: String(row.resolves_at),
      resolved_at: row.resolved_at ? String(row.resolved_at) : null,
    };

    const { goldDelta, report } = resolveActionToReport(action);
    gold += goldDelta;

    // Update action
    const upd = await supabase.from("actions").update({ status: "RESOLVED", resolved_at: nowIso }).eq("id", action.id);
    if (upd.error) throw upd.error;

    // Insert report
    const ins = await supabase.from("reports").insert({
      id: report.id,
      recipient_id: uid,
      kind: report.kind,
      title: report.title,
      body: report.body,
      payload: report.payload ?? {},
      is_unread: true,
      created_at: report.created_at,
    });
    if (ins.error) throw ins.error;
  }

  // Update gold after processing
  const upGold = await supabase.from("resource_state").update({ gold }).eq("player_id", uid);
  if (upGold.error) throw upGold.error;
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
  if (!uid) return { gold: 0, vigor: rules.vigor_cap, vigor_cap: rules.vigor_cap, vigor_regen_minutes: rules.vigor_regen_minutes };

  await resolveDueActionsOnline(uid);

  const { data, error } = await supabase.from("resource_state").select("*").eq("player_id", uid).maybeSingle();
  if (error) throw error;

  const nowIso = new Date().toISOString();

  if (!data) {
    const ins = await supabase.from("resource_state").insert({
      player_id: uid,
      gold: 1000,
      vigor: rules.vigor_cap,
      vigor_updated_at: nowIso,
    });
    if (ins.error) throw ins.error;
    return { gold: 1000, vigor: rules.vigor_cap, vigor_cap: rules.vigor_cap, vigor_regen_minutes: rules.vigor_regen_minutes };
  }

  const last = new Date(String((data as any).vigor_updated_at));
  const now = new Date();
  const regen = applyVigorRegen(
    { gold: Number((data as any).gold), vigor: Number((data as any).vigor), ...rules },
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

    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return;

    const st = loadOfflineState() as any;
    if (!st?.profile?.id) {
      localStorage.setItem(MIGRATE_KEY, "1");
      return;
    }

    // If offline id equals online id, nothing to do.
    if (st.profile.id === uid) {
      localStorage.setItem(MIGRATE_KEY, "1");
      return;
    }

    const title = "Legacy Echoes";
    const body =
      `An old name clings to your coat.\n\n` +
      `Offline identity: ${st.profile.username} (${st.profile.id}).\n` +
      `Domain Tier: ${st.domain?.tier ?? 1}. Vaulted Gold: ${st.domain?.stored_gold ?? 0}.\n` +
      `Local Gold: ${st.resources?.gold ?? 0}. Unread Reports: ${(st.reports || []).filter((r: any) => r.is_unread).length}.\n\n` +
      `These echoes are recorded, but not imported as power. Hemlock remembers — without letting the past break the balance.`;

    const report = {
      recipient_id: uid,
      kind: "SYSTEM",
      title,
      body,
      payload: { kind: "OFFLINE_SNAPSHOT" },
      is_unread: true,
      created_at: new Date().toISOString(),
    };

    const ins = await supabase.from("reports").insert(report);
    if (ins.error) throw ins.error;

    localStorage.setItem(MIGRATE_KEY, "1");
  } catch {
    // non-critical
  }
}


export async function collectDomainGold(): Promise<{ amount: number }> {
  const res = await collectDomainVault();
  const amount = res.amount;

  if (amount > 0) {
    // Create a Chronicle report (offline or online depending on mode)
    if (!isSupabaseConfigured || !supabase) {
      const st = loadOfflineState() as any;
      const rep: Report = {
        id: offlineUid("rep"),
        recipient_id: st.profile.id,
        kind: "SYSTEM",
        title: "The Vault Opens",
        body: `You unsealed the hush of your Domain. ${amount} gold was transferred to your purse.\n\nSpend it… or fortify the quiet.`,
        payload: { kind: "DOMAIN_COLLECT", amount },
        is_unread: true,
        created_at: offlineNowIso(),
      };
      saveOfflineState({ ...st, reports: [rep, ...st.reports].slice(0, 200) });
    } else {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user.id;
        if (uid) {
          await supabase.from("reports").insert({
            recipient_id: uid,
            kind: "SYSTEM",
            title: "The Vault Opens",
            body: `You unsealed the hush of your Domain. ${amount} gold was transferred to your purse.\n\nSpend it… or fortify the quiet.`,
            payload: { kind: "DOMAIN_COLLECT", amount },
            is_unread: true,
            created_at: new Date().toISOString(),
          });
        }
      } catch {
        // ignore
      }
    }
  }

  return { amount };
}
