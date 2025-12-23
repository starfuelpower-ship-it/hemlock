import type { Item, VaultState } from "../types";
import { loadOfflineState, saveOfflineState } from "./offlineStore";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

const KEY = (uid: string) => `hemlock.vault.v1.${uid || "offline-player"}`;

function nowIso() {
  return new Date().toISOString();
}

function clampSlots(n: number, fallback: number) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(120, v);
}

function normalize(state: any, uid: string): VaultState {
  const player_id = uid || "offline-player";
  const max_slots = clampSlots(state?.max_slots, 24);
  const items: Item[] = Array.isArray(state?.items) ? state.items : [];
  return { player_id, max_slots, items, updated_at: String(state?.updated_at ?? nowIso()) };
}

export async function getVaultState(): Promise<VaultState> {
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState() as any;
    if (!st.vault) {
      st.vault = { player_id: st.profile?.id ?? "offline-player", max_slots: 24, items: [], updated_at: nowIso() };
      saveOfflineState(st);
    }
    return normalize(st.vault, st.profile?.id ?? "offline-player");
  }

  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("AUTH_REQUIRED");

  const raw = localStorage.getItem(KEY(uid));
  if (!raw) {
    const seed: VaultState = { player_id: uid, max_slots: 24, items: [], updated_at: nowIso() };
    localStorage.setItem(KEY(uid), JSON.stringify(seed));
    return seed;
  }

  try {
    const parsed = JSON.parse(raw);
    const normalized = normalize(parsed, uid);
    localStorage.setItem(KEY(uid), JSON.stringify(normalized));
    return normalized;
  } catch {
    const seed: VaultState = { player_id: uid, max_slots: 24, items: [], updated_at: nowIso() };
    localStorage.setItem(KEY(uid), JSON.stringify(seed));
    return seed;
  }
}

export async function setVaultState(next: VaultState): Promise<void> {
  const stamped = { ...next, updated_at: nowIso() };

  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState() as any;
    st.vault = stamped;
    saveOfflineState(st);
    return;
  }

  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("AUTH_REQUIRED");
  localStorage.setItem(KEY(uid), JSON.stringify({ ...stamped, player_id: uid }));
}

export async function removeVaultItem(itemId: string): Promise<Item | null> {
  const vault = await getVaultState();
  const idx = vault.items.findIndex((it) => it.id === itemId);
  if (idx < 0) return null;
  const [item] = vault.items.splice(idx, 1);
  await setVaultState(vault);
  return item;
}

export async function addVaultItem(item: Item): Promise<void> {
  const vault = await getVaultState();
  vault.items.unshift(item);
  await setVaultState(vault);
}
