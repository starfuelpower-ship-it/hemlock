// Economy v1 configuration (authoritative constants)
// Keep reward/cost numbers centralized so balance isn't scattered across UI/systems.

export const OFFLINE_DURATIONS_HOURS = [1, 4, 8, 12] as const;
export type OfflineDurationHours = (typeof OFFLINE_DURATIONS_HOURS)[number];

export type OfflineRewardConfig = {
  hours: OfflineDurationHours;
  gold: number;
  xp: number;
  itemChance: number; // 0..1
};

export const OFFLINE_REWARDS: Record<OfflineDurationHours, OfflineRewardConfig> = {
  1: { hours: 1, gold: 10, xp: 20, itemChance: 0.05 },
  4: { hours: 4, gold: 45, xp: 90, itemChance: 0.12 },
  8: { hours: 8, gold: 95, xp: 190, itemChance: 0.25 },
  12: { hours: 12, gold: 140, xp: 300, itemChance: 0.40 },
};

export function offlineDurationSeconds(h: OfflineDurationHours): number {
  return h * 60 * 60;
}

// Item roll eligibility: prevent quick cancel "fishing".
export const OFFLINE_ITEM_MIN_PROGRESS = 0.5; // 50%

// Market sinks (anti-spam + inflation control)
export const MARKET_LISTING_FEE_GOLD = 2;
export const MARKET_SALES_TAX_PCT = 0.05; // 5%

// Domain progression as primary sink (costs tuned to daily gold inflow)
export const DOMAIN_UPGRADE_COSTS: Record<number, number> = {
  1: 450,   // tier 1 -> 2
  2: 1200,  // tier 2 -> 3
  3: 3200,  // tier 3 -> 4
  4: 6000,  // tier 4 -> 5 (future-facing)
};

export function domainUpgradeCostForTier(currentTier: number): number {
  return DOMAIN_UPGRADE_COSTS[Math.max(1, Math.floor(currentTier))] ?? (DOMAIN_UPGRADE_COSTS[4] + 2000 * Math.max(0, Math.floor(currentTier) - 4));
}

// Domain upkeep: small, scaling sink to prevent runaway hoarding in mid/late game.
export function domainUpkeepPerHour(tier: number): number {
  const t = Math.max(1, Math.floor(tier));
  if (t === 1) return 0;
  if (t === 2) return 1;
  if (t === 3) return 3;
  if (t === 4) return 6;
  return 8 + (t - 5) * 3;
}

// Item pricing bands (used for sell values + market guardrails)
export const PRICE_BANDS = {
  consumable_min: 2,
  consumable_max: 8,
  parts_min: 15,
  parts_max: 60,
  uncommon_min: 30,
  uncommon_max: 120,
  rare_min: 150,
  rare_max: 600,
  epic_min: 800,
  epic_max: 3000,
};

export const CLAN_TAX_MAX_PCT = 0.10; // 10%
// Court Projects (large clan sinks to prevent treasury runaway)
export type CourtProjectTemplate = { key: string; title: string; goal_gold: number };
export const COURT_PROJECT_TEMPLATES: CourtProjectTemplate[] = [
  { key: "warding_rites", title: "Warding Rites", goal_gold: 2000 },
  { key: "district_watch", title: "District Watch", goal_gold: 5000 },
  { key: "spire_observatory", title: "Spire Observatory", goal_gold: 12000 },
];

