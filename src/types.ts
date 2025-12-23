export type RiskState = "Protected" | "Scouted" | "Vulnerable" | "UnderRaid";

export type Profile = {
  id: string;
  username: string;
  premium: boolean;
  level: number;
  xp?: number;
  risk_state: RiskState;
  created_at?: string;
  last_seen?: string;
};
export type LeaderboardEntry = Profile & { gold?: number };

export type ItemRarity = "Common" | "Uncommon" | "Rare" | "Epic";

export type Item = {
  id: string;
  key: string;
  name: string;
  rarity: ItemRarity;
  value: number;
  obtained_from?: string;
  obtained_at?: string;
};

export type InventoryState = {
  player_id: string;
  max_slots: number;
  items: Item[];
  updated_at?: string;
};

export type VaultState = {
  player_id: string;
  max_slots: number;
  items: Item[];
  updated_at?: string;
};

export type MarketListingStatus = "ACTIVE" | "SOLD" | "CANCELED";

export type MarketListing = {
  id: string;
  seller_id: string;
  seller_name: string;
  item: Item;
  price_gold: number;
  status: MarketListingStatus;
  created_at: string;
  updated_at?: string;
  buyer_id?: string | null;
};

export type Clan = {
  id: string;
  name: string;
  treasury_gold: number;
  tax_pct: number; // 0..0.10
  created_at?: string;
  updated_at?: string;
};

export type ClanMember = {
  clan_id: string;
  player_id: string;
  role: "LEADER" | "OFFICER" | "MEMBER";
  joined_at?: string;
};



export type CourtProjectStatus = "ACTIVE" | "COMPLETED";

export type CourtProject = {
  id: string;
  clan_id: string;
  title: string;
  goal_gold: number;
  funded_gold: number;
  status: CourtProjectStatus;
  created_at?: string;
  updated_at?: string;
};

export type OfflineDurationHours = 1 | 4 | 8 | 12;

export type OfflineAdventureStatus = "ACTIVE" | "CLAIMED" | "CANCELED";

export type OfflineAdventure = {
  player_id: string;
  adventure_id: string;
  started_at: string;
  duration_sec: number;
  gold_total: number;
  xp_total: number;
  status: OfflineAdventureStatus;
  idempotency_key: string;
  resolved_at?: string | null;
};




export type Resources = { gold: number; xp: number; vigor: number; vigor_cap: number; vigor_regen_minutes: number };

export type ActionKind = "HUNT" | "STALK_RIVAL" | "BREACH_DOMAIN";
export type ActionStatus = "QUEUED" | "RESOLVED" | "CANCELLED";

export type Action = {
  id: string;
  actor_id: string;
  kind: ActionKind;
  target_id?: string | null;
  vigor_cost: number;
  gold_delta_min: number;
  gold_delta_max: number;
  duration_seconds: number;
  status: ActionStatus;
  created_at: string;
  resolves_at: string;
  resolved_at?: string | null;
};

export type ReportKind = "SYSTEM" | "PVE" | "PVP" | "RAID" | "CHRONICLE";
export type Report = {
  id: string;
  recipient_id: string;
  kind: ReportKind;
  title: string;
  body: string;
  payload: any;
  is_unread: boolean;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  channel: "world" | "court" | "system";
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: string;
};

export type DomainState = {
  player_id: string;
  tier: number;
  defensive_rating: number;
  stored_gold: number;
  protection_state: RiskState;
  /** Local-only (or derived) income tracking. Online mode uses localStorage fallback to avoid requiring DB migrations. */
  last_collected_at?: string;
  income_per_hour?: number;
  updated_at?: string;
};

