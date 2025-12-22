import { supabase, isSupabaseConfigured } from "../lib/supabase";
import type { Clan, ClanMember, CourtProject } from "../types";
import { CLAN_TAX_MAX_PCT, COURT_PROJECT_TEMPLATES } from "./economyConfig";
import { applyGoldDelta } from "./economy";
import { loadOfflineState, saveOfflineState, offlineUid, offlineNowIso } from "./offlineStore";

const OFFLINE_CLANS_KEY = "hemlock:clans";
const OFFLINE_MEMBERS_KEY = "hemlock:clan_members";
const OFFLINE_PROJECTS_KEY = "hemlock:court_projects";

function clampTaxPct(n: number): number {
  const v = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(CLAN_TAX_MAX_PCT, v));
}

function loadArray<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || "[]") as T[]; } catch { return []; }
}
function saveArray<T>(key: string, arr: T[]) { localStorage.setItem(key, JSON.stringify(arr)); }

function coerceClan(row: any): Clan {
  return {
    ...row,
    treasury_gold: Number(row.treasury_gold ?? 0),
    tax_pct: Number(row.tax_pct ?? 0),
  } as Clan;
}

function coerceProject(row: any): CourtProject {
  return {
    ...row,
    goal_gold: Number(row.goal_gold ?? 0),
    funded_gold: Number(row.funded_gold ?? 0),
  } as CourtProject;
}


/**
 * Clans/Courts v1:
 * - Create/join clan
 * - Treasury (gold pooled)
 * - Deposits (members -> treasury)
 * - Optional tax (0..10%) stored (used later)
 * - Court Projects (large sinks funded FROM treasury)
 *
 * Online mode uses RPCs (server-authoritative). Offline mode uses localStorage.
 */

export async function listClans(limit: number = 25): Promise<Clan[]> {
  if (!isSupabaseConfigured || !supabase) {
    return loadArray<Clan>(OFFLINE_CLANS_KEY).slice(0, limit);
  }
  const { data, error } = await supabase.from("clans").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).map(coerceClan);
}

export async function getMyClan(): Promise<{ clan: Clan; membership: ClanMember } | null> {
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState();
    const mems = loadArray<ClanMember>(OFFLINE_MEMBERS_KEY);
    const m = mems.find((x) => x.player_id === st.profile.id);
    if (!m) return null;
    const clans = loadArray<Clan>(OFFLINE_CLANS_KEY);
    const c = clans.find((x) => x.id === m.clan_id);
    if (!c) return null;
    return { clan: c, membership: m };
  }

  const { data: u } = await supabase.auth.getUser();
  const user = u.user;
  if (!user) return null;

  const { data: mem, error: memErr } = await supabase.from("clan_members").select("*").eq("player_id", user.id).limit(1).maybeSingle();
  if (memErr) throw memErr;
  if (!mem) return null;

  const { data: clan, error: cErr } = await supabase.from("clans").select("*").eq("id", mem.clan_id).maybeSingle();
  if (cErr) throw cErr;
  if (!clan) return null;

  return { clan: coerceClan(clan), membership: mem as any };
}

export async function createClan(name: string): Promise<Clan> {
  const cleaned = (name || "").trim().replace(/\s+/g, " ");
  if (cleaned.length < 3) throw new Error("NAME_TOO_SHORT");
  if (cleaned.length > 24) throw new Error("NAME_TOO_LONG");

  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState();
    const now = offlineNowIso();
    const clan: Clan = { id: offlineUid("cln"), name: cleaned, treasury_gold: 0, tax_pct: 0, created_at: now, updated_at: now };
    const clans = loadArray<Clan>(OFFLINE_CLANS_KEY);
    clans.unshift(clan);
    saveArray(OFFLINE_CLANS_KEY, clans);

    const mems = loadArray<ClanMember>(OFFLINE_MEMBERS_KEY);
    mems.unshift({ clan_id: clan.id, player_id: st.profile.id, role: "LEADER", joined_at: now });
    saveArray(OFFLINE_MEMBERS_KEY, mems);
    return clan;
  }

  const { data, error } = await supabase.rpc("clan_create", { p_name: cleaned });
  if (error) throw error;
  return coerceClan(data);
}

export async function joinClan(clanId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState();
    const mems = loadArray<ClanMember>(OFFLINE_MEMBERS_KEY);
    if (mems.some((m) => m.player_id === st.profile.id)) throw new Error("ALREADY_IN_CLAN");
    mems.unshift({ clan_id: clanId, player_id: st.profile.id, role: "MEMBER", joined_at: offlineNowIso() });
    saveArray(OFFLINE_MEMBERS_KEY, mems);
    return;
  }
  const { error } = await supabase.rpc("clan_join", { p_clan_id: clanId });
  if (error) throw error;
}

export async function leaveClan(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState();
    const mems = loadArray<ClanMember>(OFFLINE_MEMBERS_KEY).filter((m) => m.player_id !== st.profile.id);
    saveArray(OFFLINE_MEMBERS_KEY, mems);
    return;
  }
  const { error } = await supabase.rpc("clan_leave");
  if (error) throw error;
}

export async function depositToTreasury(amountGold: number): Promise<void> {
  const amt = Math.max(1, Math.floor(Number.isFinite(amountGold) ? amountGold : 0));
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState();
    const res = applyGoldDelta(st.resources.gold, -amt);
    if (!res.ok) throw new Error("INSUFFICIENT_GOLD");
    st.resources.gold = res.next;

    const ctx = await getMyClan();
    if (!ctx) throw new Error("NO_CLAN");
    const clans = loadArray<Clan>(OFFLINE_CLANS_KEY);
    const idx = clans.findIndex((c) => c.id === ctx.clan.id);
    if (idx >= 0) {
      clans[idx] = { ...clans[idx], treasury_gold: (clans[idx].treasury_gold || 0) + amt, updated_at: offlineNowIso() };
      saveArray(OFFLINE_CLANS_KEY, clans);
    }
    saveOfflineState(st);
    return;
  }

  const { error } = await supabase.rpc("clan_deposit", { p_amount_gold: amt });
  if (error) throw error;
}

export async function setClanTaxPct(clanId: string, taxPct: number): Promise<void> {
  const pct = clampTaxPct(taxPct);
  if (!isSupabaseConfigured || !supabase) {
    const clans = loadArray<Clan>(OFFLINE_CLANS_KEY);
    const idx = clans.findIndex((c) => c.id === clanId);
    if (idx >= 0) {
      clans[idx] = { ...clans[idx], tax_pct: pct, updated_at: offlineNowIso() };
      saveArray(OFFLINE_CLANS_KEY, clans);
    }
    return;
  }

  const { error } = await supabase.rpc("clan_set_tax", { p_clan_id: clanId, p_tax_pct: pct });
  if (error) throw error;
}

export async function listCourtProjects(clanId: string, limit: number = 25): Promise<CourtProject[]> {
  if (!isSupabaseConfigured || !supabase) {
    return loadArray<CourtProject>(OFFLINE_PROJECTS_KEY).filter((p) => p.clan_id === clanId).slice(0, limit);
  }
  const { data, error } = await supabase
    .from("court_projects")
    .select("*")
    .eq("clan_id", clanId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(coerceProject);
}

export async function createCourtProject(clanId: string, templateKey: string): Promise<CourtProject> {
  const tpl = COURT_PROJECT_TEMPLATES.find((t) => t.key === templateKey);
  if (!tpl) throw new Error("INVALID_TEMPLATE");

  if (!isSupabaseConfigured || !supabase) {
    const now = offlineNowIso();
    const pr: CourtProject = {
      id: offlineUid("prj"),
      clan_id: clanId,
      title: tpl.title,
      goal_gold: tpl.goal_gold,
      funded_gold: 0,
      status: "ACTIVE",
      created_at: now,
      updated_at: now,
    };
    const arr = loadArray<CourtProject>(OFFLINE_PROJECTS_KEY);
    arr.unshift(pr);
    saveArray(OFFLINE_PROJECTS_KEY, arr);
    return pr;
  }

  const { data, error } = await supabase.rpc("clan_create_project", {
    p_clan_id: clanId,
    p_template_key: tpl.key,
    p_title: tpl.title,
    p_goal_gold: tpl.goal_gold,
  });
  if (error) throw error;
  return coerceProject(data);
}

export async function fundProjectFromTreasury(projectId: string, amountGold: number): Promise<void> {
  const amt = Math.max(1, Math.floor(Number.isFinite(amountGold) ? amountGold : 0));
  if (!isSupabaseConfigured || !supabase) {
    // offline: subtract from clan treasury and burn it into project
    const st = loadOfflineState();
    const ctx = await getMyClan();
    if (!ctx) throw new Error("NO_CLAN");

    const clans = loadArray<Clan>(OFFLINE_CLANS_KEY);
    const cIdx = clans.findIndex((c) => c.id === ctx.clan.id);
    if (cIdx < 0) throw new Error("NO_CLAN");
    if ((clans[cIdx].treasury_gold || 0) < amt) throw new Error("INSUFFICIENT_TREASURY");

    clans[cIdx] = { ...clans[cIdx], treasury_gold: clans[cIdx].treasury_gold - amt, updated_at: offlineNowIso() };
    saveArray(OFFLINE_CLANS_KEY, clans);

    const projects = loadArray<CourtProject>(OFFLINE_PROJECTS_KEY);
    const pIdx = projects.findIndex((p) => p.id === projectId);
    if (pIdx < 0) throw new Error("PROJECT_NOT_FOUND");
    const nextFund = (projects[pIdx].funded_gold || 0) + amt;
    const status = nextFund >= projects[pIdx].goal_gold ? "COMPLETED" : "ACTIVE";
    projects[pIdx] = { ...projects[pIdx], funded_gold: nextFund, status, updated_at: offlineNowIso() };
    saveArray(OFFLINE_PROJECTS_KEY, projects);

    saveOfflineState(st);
    return;
  }

  const { error } = await supabase.rpc("clan_fund_project", { p_project_id: projectId, p_amount_gold: amt });
  if (error) throw error;
}
