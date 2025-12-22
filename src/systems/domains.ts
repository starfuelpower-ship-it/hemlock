import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { DomainState, RiskState } from "../types";
import { loadOfflineState, saveOfflineState } from "./offlineStore";

export function domainUpgradeCost(currentTier: number) {
  // Tier 1 -> 2: 500, then 1000, 1500...
  return 500 * Math.max(1, currentTier);
}

function normalizeRiskState(value: any): RiskState {
  if (value === "Protected" || value === "Scouted" || value === "Vulnerable" || value === "UnderRaid") return value;
  return "Protected";
}



function computeIncomePerHour(tier: number) {
  const t = Math.max(1, Math.floor(tier || 1));
  const table = [0, 25, 40, 60, 85, 115];
  return t < table.length ? table[t] : 115 + (t - 5) * 25;
}

function lsKey(uid: string) {
  return `hemlock:domain:last_collect:${uid}`;
}

function parseIso(s?: string | null) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function hoursBetween(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 3_600_000);
}

export function setDomainLastCollected(uid: string, iso: string) {
  localStorage.setItem(lsKey(uid || "offline-player"), iso);
}

/**
 * Applies passive income into Domain.stored_gold (vault), based on elapsed time since last collection.
 * Uses localStorage to avoid requiring DB migrations.
 */
export function applyDomainIncome(uid: string, domain: DomainState): { domain: DomainState; earned: number } {
  const id = uid || "offline-player";
  const now = new Date();
  const lastIso = localStorage.getItem(lsKey(id)) || domain.last_collected_at || domain.updated_at || now.toISOString();
  const last = parseIso(lastIso) || new Date(now.getTime());

  const perHour = computeIncomePerHour(domain.tier);
  const earnedRaw = Math.floor(hoursBetween(last, now) * perHour);
  if (earnedRaw <= 0) {
    return { domain: { ...domain, income_per_hour: perHour, last_collected_at: last.toISOString() }, earned: 0 };
  }

  // Cap to ~3 days worth
  const cap = Math.max(250, perHour * 24 * 3);
  const prevStored = Math.max(0, Number(domain.stored_gold ?? 0));
  const nextStored = Math.min(cap, prevStored + earnedRaw);
  const earned = Math.max(0, nextStored - prevStored);

  // Advance last by consumed time so we don't “double pay” on refresh
  const consumedHours = earned / perHour;
  const nextLast = new Date(last.getTime() + consumedHours * 3_600_000);
  setDomainLastCollected(id, nextLast.toISOString());

  return {
    domain: {
      ...domain,
      stored_gold: nextStored,
      income_per_hour: perHour,
      last_collected_at: nextLast.toISOString(),
      updated_at: now.toISOString(),
    },
    earned,
  };
}
function ensureOfflineDomain(): DomainState {
  const st = loadOfflineState() as any;

  const existing: DomainState | null = st.domain ? (st.domain as DomainState) : null;
  const base: DomainState = existing ?? {
    player_id: st.profile.id,
    tier: 1,
    defensive_rating: 10,
    stored_gold: 0,
    protection_state: st.profile.risk_state ?? "Protected",
    last_collected_at: new Date().toISOString(),
    income_per_hour: 25,
    updated_at: new Date().toISOString(),
  };

  const ticked = applyDomainIncome(st.profile.id, base);
  st.domain = ticked.domain;
  saveOfflineState(st);
  return ticked.domain;
}

export async function getMyDomain(): Promise<DomainState> {
  if (!isSupabaseConfigured || !supabase) {
    return ensureOfflineDomain();
  }

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    // Should be blocked by RequireAuth, but keep safe.
    return {
      player_id: "guest",
      tier: 1,
      defensive_rating: 10,
      stored_gold: 0,
      protection_state: "Protected",
      updated_at: new Date().toISOString(),
    };
  }

  const { data: row, error } = await supabase.from("domain_state").select("*").eq("player_id", user.id).maybeSingle();
  if (error) throw error;

  if (row) {
    return {
      player_id: String((row as any).player_id),
      tier: Number((row as any).tier ?? 1),
      defensive_rating: Number((row as any).defensive_rating ?? 10),
      stored_gold: Number((row as any).stored_gold ?? 0),
      protection_state: normalizeRiskState((row as any).protection_state),
      updated_at: String((row as any).updated_at ?? new Date().toISOString()),
    };
  }

  const created: DomainState = {
    player_id: user.id,
    tier: 1,
    defensive_rating: 10,
    stored_gold: 0,
    protection_state: "Protected",
    updated_at: new Date().toISOString(),
  };

  const ins = await supabase.from("domain_state").insert({
    player_id: user.id,
    tier: created.tier,
    defensive_rating: created.defensive_rating,
    stored_gold: created.stored_gold,
    protection_state: created.protection_state,
    updated_at: created.updated_at,
  });
  if (ins.error) throw ins.error;

  setDomainLastCollected(user.id, created.updated_at || new Date().toISOString());
  return { ...created, income_per_hour: computeIncomePerHour(created.tier), last_collected_at: localStorage.getItem(lsKey(user.id)) ?? created.updated_at };
}

export async function upgradeMyDomain(): Promise<DomainState> {
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState() as any;
    const domain = ensureOfflineDomain();
    const cost = domainUpgradeCost(domain.tier);
    if (st.resources.gold < cost) throw new Error("Not enough gold to upgrade your Domain.");
    const next: DomainState = {
      ...domain,
      tier: domain.tier + 1,
      defensive_rating: domain.defensive_rating + 10,
      updated_at: new Date().toISOString(),
    };
    st.resources.gold = st.resources.gold - cost;
    st.domain = next;
    saveOfflineState(st);
    return next;
  }

  const domain = await getMyDomain();
  const cost = domainUpgradeCost(domain.tier);

  const { data: sessionRes } = await supabase.auth.getSession();
  const uid = sessionRes.session?.user.id;
  if (!uid) throw new Error("Not signed in.");

  // Read current gold
  const { data: rs, error: rsErr } = await supabase.from("resource_state").select("*").eq("player_id", uid).maybeSingle();
  if (rsErr) throw rsErr;
  const gold = Number((rs as any)?.gold ?? 0);
  if (gold < cost) throw new Error("Not enough gold to upgrade your Domain.");

  const next: DomainState = {
    ...domain,
    tier: domain.tier + 1,
    defensive_rating: domain.defensive_rating + 10,
    updated_at: new Date().toISOString(),
  };

  // Update domain + gold
  const updDom = await supabase
    .from("domain_state")
    .update({
      tier: next.tier,
      defensive_rating: next.defensive_rating,
      updated_at: next.updated_at,
    })
    .eq("player_id", uid);
  if (updDom.error) throw updDom.error;

  const updGold = await supabase.from("resource_state").update({ gold: gold - cost }).eq("player_id", uid);
  if (updGold.error) throw updGold.error;

  return next;
}


export async function collectDomainVault(): Promise<{ amount: number; domain: DomainState }> {
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState() as any;
    const domain = ensureOfflineDomain();
    const amount = Math.max(0, Math.floor(Number(domain.stored_gold ?? 0)));
    if (amount <= 0) return { amount: 0, domain };

    const next: DomainState = { ...domain, stored_gold: 0, updated_at: new Date().toISOString() };
    saveOfflineState({ ...st, resources: { ...st.resources, gold: Number(st.resources.gold ?? 0) + amount }, domain: next });
    setDomainLastCollected(st.profile?.id ?? "offline-player", new Date().toISOString());
    return { amount, domain: next };
  }

  const domain = await getMyDomain();
  const amount = Math.max(0, Math.floor(Number(domain.stored_gold ?? 0)));
  if (amount <= 0) return { amount: 0, domain };

  const { data: sessionRes } = await supabase.auth.getSession();
  const uid = sessionRes.session?.user.id;
  if (!uid) throw new Error("Not signed in.");

  // Set vault to 0 (best-effort).
  const upd = await supabase.from("domain_state").update({ stored_gold: 0, updated_at: new Date().toISOString() }).eq("player_id", uid);
  if (upd.error) throw upd.error;

  const { data: rs, error: rsErr } = await supabase.from("resource_state").select("*").eq("player_id", uid).maybeSingle();
  if (rsErr) throw rsErr;
  const gold = Number((rs as any)?.gold ?? 0);
  const updGold = await supabase.from("resource_state").update({ gold: gold + amount }).eq("player_id", uid);
  if (updGold.error) throw updGold.error;

  setDomainLastCollected(uid, new Date().toISOString());
  const next: DomainState = { ...domain, stored_gold: 0, updated_at: new Date().toISOString() };
  return { amount, domain: next };
}
