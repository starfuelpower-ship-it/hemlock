import { Action, ChatMessage, DomainState, Profile, Report, Resources, InventoryState, OfflineAdventure } from "../types";

const KEY = "hemlock_offline_v1";
type OfflineState = {
  processed_action_ids: string[];
  profile: Profile;
  resources: Resources;
  actions: Action[];
  reports: Report[];
  chat: ChatMessage[];
  domain: DomainState;
  inventory: InventoryState;
  offline_adventure: OfflineAdventure | null;
  last_tick_iso: string;
};

function nowIso() { return new Date().toISOString(); }
function uid(prefix: string) { return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`; }

export function loadOfflineState(): OfflineState {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      const st = JSON.parse(raw) as any;
      if (!Array.isArray(st.processed_action_ids)) st.processed_action_ids = [];
      if (!st.profile) st.profile = { id: "offline-player", username: "Wanderer", premium: false, level: 1, xp: 0, risk_state: "Protected" };
      if (typeof st.profile.level !== "number") st.profile.level = 1;
      if (typeof st.profile.xp !== "number") st.profile.xp = 0;
      if (!st.resources) st.resources = { gold: 1000, xp: 0, vigor: 10, vigor_cap: 10, vigor_regen_minutes: 15 };
      if (typeof st.resources.gold !== "number") st.resources.gold = 0;
      if (typeof (st.resources as any).xp !== "number") (st.resources as any).xp = 0;
      if (typeof (st.resources as any).xp !== "number") (st.resources as any).xp = 0;
      if (!st.domain) st.domain = { player_id: st.profile.id, tier: 1, defensive_rating: 10, stored_gold: 0, protection_state: "Protected", updated_at: nowIso() };
      if (!st.inventory) st.inventory = { player_id: st.profile.id, max_slots: 30, items: [], updated_at: nowIso() };
      if (!Array.isArray(st.inventory.items)) st.inventory.items = [];
      if (typeof st.inventory.max_slots !== "number") st.inventory.max_slots = 30;
      if (typeof st.offline_adventure === "undefined") st.offline_adventure = null;
      if (!Array.isArray(st.actions)) st.actions = [];
      if (!Array.isArray(st.reports)) st.reports = [];
      if (!Array.isArray(st.chat)) st.chat = [];
      if (typeof st.last_tick_iso !== "string") st.last_tick_iso = nowIso();
      return st as OfflineState;
    } catch {
      // fall through
    }
  }

  const seed: OfflineState = {
    processed_action_ids: [],
    profile: { id: "offline-player", username: "Wanderer", premium: false, level: 1, xp: 0, risk_state: "Protected" },
    resources: { gold: 1000, xp: 0, vigor: 10, vigor_cap: 10, vigor_regen_minutes: 15 },
    actions: [],
    domain: {
      player_id: "offline-player",
      tier: 1,
      defensive_rating: 10,
      stored_gold: 0,
      protection_state: "Protected",
      last_collected_at: nowIso(),
      income_per_hour: 25,
      updated_at: nowIso(),
    },
    reports: [{
      id: uid("rep"),
      recipient_id: "offline-player",
      kind: "SYSTEM",
      title: "Awakening",
      body: "The Spire watches. Your first steps are small, but not unseen.",
      payload: {},
      is_unread: true,
      created_at: nowIso(),
    }],
    chat: [{
      id: uid("msg"),
      channel: "system",
      sender_id: "system",
      sender_name: "Spire",
      message: "The fog gathers across Bloodhaven…",
      created_at: nowIso(),
    }],
    inventory: { player_id: "offline-player", max_slots: 30, items: [], updated_at: new Date().toISOString() },
    offline_adventure: null,
    last_tick_iso: nowIso(),
  };

  saveOfflineState(seed);
  return seed;
}

export function saveOfflineState(state: OfflineState) { localStorage.setItem(KEY, JSON.stringify(state)); }
export function offlineUid(prefix: string) { return uid(prefix); }
export function offlineNowIso() { return nowIso(); }
