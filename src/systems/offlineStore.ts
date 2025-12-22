import { Action, ChatMessage, DomainState, Profile, Report, Resources } from "../types";

const KEY = "hemlock_offline_v1";
type OfflineState = {
  profile: Profile;
  resources: Resources;
  actions: Action[];
  reports: Report[];
  chat: ChatMessage[];
  domain: DomainState;
  last_tick_iso: string;
};

function nowIso() { return new Date().toISOString(); }
function uid(prefix: string) { return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`; }

export function loadOfflineState(): OfflineState {
  const raw = localStorage.getItem(KEY);
  if (raw) { try { return JSON.parse(raw) as OfflineState; } catch {} }

  const seed: OfflineState = {
    profile: { id: "offline-player", username: "Wanderer", premium: false, level: 1, risk_state: "Protected" },
    resources: { gold: 1000, vigor: 10, vigor_cap: 10, vigor_regen_minutes: 15 },
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
    last_tick_iso: nowIso(),
  };

  saveOfflineState(seed);
  return seed;
}

export function saveOfflineState(state: OfflineState) { localStorage.setItem(KEY, JSON.stringify(state)); }
export function offlineUid(prefix: string) { return uid(prefix); }
export function offlineNowIso() { return nowIso(); }
