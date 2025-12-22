import { PRICE_BANDS } from "./economyConfig";
import type { Item, ItemRarity } from "../types";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export const ITEM_POOL: Array<{ key: string; name: string; rarity: ItemRarity; baseValue: number }> = [
  { key: "bandage", name: "Bandage", rarity: "Common", baseValue: 4 },
  { key: "reagent_minor", name: "Minor Reagent", rarity: "Common", baseValue: 6 },
  { key: "scrap_part", name: "Scrap Part", rarity: "Common", baseValue: 18 },
  { key: "ward_shard", name: "Ward Shard", rarity: "Uncommon", baseValue: 55 },
  { key: "ritual_ink", name: "Ritual Ink", rarity: "Uncommon", baseValue: 90 },
  { key: "sealed_trinket", name: "Sealed Trinket", rarity: "Rare", baseValue: 260 },
  { key: "hollow_relic", name: "Hollow Relic", rarity: "Rare", baseValue: 520 },
];

function clampValue(rarity: ItemRarity, v: number): number {
  const n = Math.max(0, Math.floor(v));
  if (rarity === "Common") return Math.min(PRICE_BANDS.parts_max, Math.max(PRICE_BANDS.consumable_min, n));
  if (rarity === "Uncommon") return Math.min(PRICE_BANDS.uncommon_max, Math.max(PRICE_BANDS.uncommon_min, n));
  if (rarity === "Rare") return Math.min(PRICE_BANDS.rare_max, Math.max(PRICE_BANDS.rare_min, n));
  if (rarity === "Epic") return Math.min(PRICE_BANDS.epic_max, Math.max(PRICE_BANDS.epic_min, n));
  return n;
}

export function sellValue(item: Item): number {
  // Default: sell for 60% of value, integer.
  const raw = Math.floor((item.value ?? 0) * 0.6);
  return Math.max(1, raw);
}

export function rollRandomItem(seedKey: string): Item {
  // Simple deterministic-ish mixing with Math.random fallback; server-side should provide deterministic seeds later.
  const idx = Math.floor(Math.random() * ITEM_POOL.length);
  const base = ITEM_POOL[Math.max(0, Math.min(ITEM_POOL.length - 1, idx))];

  const value = clampValue(base.rarity, base.baseValue);
  return {
    id: uid("itm"),
    key: base.key,
    name: base.name,
    rarity: base.rarity,
    value,
    obtained_from: seedKey,
    obtained_at: new Date().toISOString(),
  };
}


export function buildItemFromKey(key: string, obtained_from: string): Item | null {
  const base = ITEM_POOL.find((x) => x.key === key);
  if (!base) return null;
  const value = clampValue(base.rarity, base.baseValue);
  return {
    id: uid("itm"),
    key: base.key,
    name: base.name,
    rarity: base.rarity,
    value,
    obtained_from,
    obtained_at: new Date().toISOString(),
  };
}
