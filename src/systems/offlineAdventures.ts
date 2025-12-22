import { supabase, isSupabaseConfigured } from "../lib/supabase";
import type { OfflineAdventure, OfflineDurationHours, Report } from "../types";
import { OFFLINE_REWARDS, OFFLINE_ITEM_MIN_PROGRESS, offlineDurationSeconds } from "./economyConfig";
import { loadOfflineState, saveOfflineState, offlineNowIso, offlineUid } from "./offlineStore";
import { applyGoldDelta, addProcessed, hasProcessed } from "./economy";
import { rollRandomItem, buildItemFromKey } from "./items";

type ResolveMode = "CLAIM" | "CANCEL";
export const OFFLINE_DURATIONS_HOURS: OfflineDurationHours[] = [1, 4, 8, 12];


function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function calcProportional(total: number, elapsedSec: number, durationSec: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return 0;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  const frac = clamp01(elapsedSec / durationSec);
  return Math.floor(total * frac);
}

function mkReport(playerId: string, mode: ResolveMode, hours: number, elapsedSec: number, gold: number, xp: number, itemKey?: string | null): Report {
  const elapsedHours = Math.max(0, Math.floor(elapsedSec / 3600));
  const title = mode === "CANCEL" ? "Offline Adventure (Canceled)" : "Offline Adventure (Resolved)";
  const body = `Duration: ${hours}h | Elapsed: ${elapsedHours}h | Gold: +${gold} | XP: +${xp}${itemKey ? ` | Item: ${itemKey}` : ""}`;
  return {
    id: offlineUid("rep"),
    recipient_id: playerId,
    kind: "PVE",
    title,
    body,
    payload: { hours, elapsedSec, gold, xp, itemKey, mode },
    is_unread: true,
    created_at: offlineNowIso(),
  };
}

export async function getMyOfflineAdventure(): Promise<OfflineAdventure | null> {
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState();
    return st.offline_adventure ?? null;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("offline_adventures").select("*").eq("player_id", user.id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    player_id: String((data as any).player_id),
    adventure_id: String((data as any).adventure_id),
    started_at: String((data as any).started_at),
    duration_sec: Number((data as any).duration_sec),
    gold_total: Number((data as any).gold_total),
    xp_total: Number((data as any).xp_total),
    status: String((data as any).status) as any,
    idempotency_key: String((data as any).idempotency_key),
    resolved_at: (data as any).resolved_at ? String((data as any).resolved_at) : null,
  };
}

export async function startOfflineAdventure(hours: OfflineDurationHours): Promise<OfflineAdventure> {
  const cfg = OFFLINE_REWARDS[hours];
  const now = new Date();
  const durationSec = offlineDurationSeconds(hours);

  const adv: OfflineAdventure = {
    player_id: "offline-player",
    adventure_id: `offline_${hours}h`,
    started_at: now.toISOString(),
    duration_sec: durationSec,
    gold_total: cfg.gold,
    xp_total: cfg.xp,
    status: "ACTIVE",
    idempotency_key: offlineUid("adv"),
    resolved_at: null,
  };

  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState();
    st.offline_adventure = adv;
    saveOfflineState(st);
    return adv;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("AUTH_REQUIRED");
  adv.player_id = user.id;

  // One active adventure per player (upsert)
  const { error } = await supabase
    .from("offline_adventures")
    .upsert(
      {
        player_id: user.id,
        adventure_id: adv.adventure_id,
        started_at: adv.started_at,
        duration_sec: adv.duration_sec,
        gold_total: adv.gold_total,
        xp_total: adv.xp_total,
        status: adv.status,
        idempotency_key: adv.idempotency_key,
        resolved_at: null,
      },
      { onConflict: "player_id" }
    );
  if (error) throw error;
  return adv;
}

export async function resolveOfflineAdventure(mode: ResolveMode): Promise<{ gold: number; xp: number; itemSoldValue?: number; itemId?: string }> {
  const adv = await getMyOfflineAdventure();
  if (!adv) return { gold: 0, xp: 0 };

  if (adv.status !== "ACTIVE") {
    return { gold: 0, xp: 0 };
  }

  const now = new Date();
  const start = new Date(adv.started_at);
  const elapsedSec = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  const effectiveSec = Math.min(elapsedSec, Math.max(1, Math.floor(adv.duration_sec)));

  const gold = calcProportional(adv.gold_total, effectiveSec, adv.duration_sec);
  const xp = calcProportional(adv.xp_total, effectiveSec, adv.duration_sec);

  const progress = clamp01(effectiveSec / adv.duration_sec);
  const canRollItem = progress >= OFFLINE_ITEM_MIN_PROGRESS;

  // Idempotency: use adv.idempotency_key as processed id
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState();
    if (hasProcessed(st.processed_action_ids, adv.idempotency_key)) return { gold: 0, xp: 0 };
    st.processed_action_ids = addProcessed(st.processed_action_ids, adv.idempotency_key);

    // Apply gold
    const gRes = applyGoldDelta(st.resources.gold, gold);
    if (gRes.ok) st.resources.gold = gRes.next;

    // Apply xp + level-up (simple)
    st.profile.xp = Math.max(0, Math.floor((st.profile.xp ?? 0) + xp));
    while (st.profile.xp >= st.profile.level * 100) {
      st.profile.xp -= st.profile.level * 100;
      st.profile.level += 1;
    }

    let itemKey: string | null = null;
    let itemId: string | undefined;
    let itemSoldValue: number | undefined;
    if (canRollItem && Math.random() < (OFFLINE_REWARDS[(adv.duration_sec / 3600) as OfflineDurationHours]?.itemChance ?? 0)) {
      const item = rollRandomItem(adv.idempotency_key);
      st.inventory.items.push(item);
      itemKey = item.key;
      itemId = item.id;
    }

    st.reports.unshift(mkReport(st.profile.id, mode, adv.duration_sec / 3600, effectiveSec, gold, xp, itemKey));
    st.offline_adventure = { ...adv, status: mode === "CANCEL" ? "CANCELED" : "CLAIMED", resolved_at: offlineNowIso() };
    saveOfflineState(st);
    return { gold, xp, itemId, itemSoldValue };
  }

  // Online mode: mark resolved + credit gold/xp with basic atomicity (client-side best effort; server enforcement recommended later).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("AUTH_REQUIRED");

  // Check processed in actions table? For now, store processed ids in resource_state.processed_action_ids is not present online.
  // We enforce idempotency by setting status+resolved_at only once.
  const { error: updErr } = await supabase
    .from("offline_adventures")
    .update({ status: mode === "CANCEL" ? "CANCELED" : "CLAIMED", resolved_at: now.toISOString() })
    .eq("player_id", user.id)
    .eq("status", "ACTIVE");
  if (updErr) throw updErr;

  // Apply resources
  const { data: rrow, error: rerr } = await supabase.from("resource_state").select("*").eq("player_id", user.id).maybeSingle();
  if (rerr) throw rerr;
  const curGold = Number((rrow as any)?.gold ?? 0);
  const gRes = applyGoldDelta(curGold, gold);
  if (gRes.ok) {
    const { error } = await supabase.from("resource_state").upsert({ player_id: user.id, gold: gRes.next, updated_at: now.toISOString() }, { onConflict: "player_id" });
    if (error) throw error;
  }

  // Item roll
  let itemKey: string | null = null;
  let itemId: string | undefined;
  if (canRollItem && Math.random() < (OFFLINE_REWARDS[(adv.duration_sec / 3600) as OfflineDurationHours]?.itemChance ?? 0)) {
    const rolled = rollRandomItem(adv.idempotency_key);
    itemKey = rolled ? rolled.key : null;
  }

  // Item grant
  if (itemKey) {
    const item = buildItemFromKey(itemKey, "offline_adventure");
    if (!item) throw new Error("INVALID_ITEM");
    itemId = item.id;
    const { error: ierr } = await supabase.from("inventory_items").insert({
      id: item.id,
      owner_id: user.id,
      item_key: item.key,
      item_name: item.name,
      rarity: item.rarity,
      value: item.value,
      obtained_from: item.obtained_from ?? "offline_adventure",
      obtained_at: now.toISOString(),
    } as any);
    if (ierr) throw ierr;
  }

  // Report
  const rep = mkReport(user.id, mode, adv.duration_sec / 3600, effectiveSec, gold, xp, itemKey);
  const { error: repErr } = await supabase.from("reports").insert(rep as any);
  if (repErr) throw repErr;

  return { gold, xp, itemId };
}
