import { supabase, isSupabaseConfigured } from "../lib/supabase";
import type { MarketListing, Item } from "../types";
import { MARKET_LISTING_FEE_GOLD, MARKET_SALES_TAX_PCT } from "./economyConfig";
import { applyGoldDelta } from "./economy";
import { loadOfflineState, saveOfflineState, offlineUid, offlineNowIso } from "./offlineStore";

const OFFLINE_LISTINGS_KEY = "hemlock:market:listings";

function clampPrice(n: number) {
  const v = Math.floor(Number.isFinite(n) ? n : 0);
  return Math.max(1, Math.min(1_000_000, v));
}

export function computeTax(priceGold: number): number {
  return Math.max(0, Math.floor(clampPrice(priceGold) * MARKET_SALES_TAX_PCT));
}

export function loadOfflineListings(): MarketListing[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_LISTINGS_KEY) || "[]") as MarketListing[];
  } catch {
    return [];
  }
}

function saveOfflineListings(listings: MarketListing[]) {
  localStorage.setItem(OFFLINE_LISTINGS_KEY, JSON.stringify(listings));
}


function rowToListing(row: any): MarketListing {
  const item: Item = {
    id: row.item_id,
    key: row.item_key,
    name: row.item_name,
    rarity: row.rarity,
    value: row.value ?? 0,
  };
  return {
    id: row.id,
    seller_id: row.seller_id,
    seller_name: row.seller_name,
    item,
    price_gold: row.price_gold,
    status: row.status,
    buyer_id: row.buyer_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Market v1:
 * - List an item for a price (listing fee sink)
 * - Buy an item (sales tax sink; seller receives net)
 * - Cancel listing (returns item; listing fee not refunded)
 *
 * Online mode uses RPCs (server-authoritative). Offline mode uses localStorage + offline state.
 */

export async function listMarketListings(limit: number = 50): Promise<MarketListing[]> {
  if (!isSupabaseConfigured || !supabase) {
    return loadOfflineListings().slice(0, limit);
  }
  const { data, error } = await supabase
    .from("market_listings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  // DB rows are compatible with MarketListing
  return (data || []).map(rowToListing);
}

export async function createListing(itemId: string, priceGold: number): Promise<MarketListing> {
  const price = clampPrice(priceGold);

  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState();
    const itemIdx = st.inventory.items.findIndex((it) => it.id === itemId);
    if (itemIdx < 0) throw new Error("ITEM_NOT_FOUND");

    // Pay listing fee (sink)
    const feeRes = applyGoldDelta(st.resources.gold, -MARKET_LISTING_FEE_GOLD);
    if (!feeRes.ok) throw new Error("INSUFFICIENT_GOLD");
    st.resources.gold = feeRes.next;

    const [item] = st.inventory.items.splice(itemIdx, 1);
    const now = offlineNowIso();
    const listing: MarketListing = {
      id: offlineUid("lst"),
      seller_id: st.profile.id,
      seller_name: st.profile.username,
      item,
      price_gold: price,
      status: "ACTIVE",
      created_at: now,
      updated_at: now,
      buyer_id: null,
    };

    const arr = loadOfflineListings();
    arr.unshift(listing);
    saveOfflineListings(arr);
    saveOfflineState(st);
    return listing;
  }

  const { data, error } = await supabase.rpc("market_create_listing", {
    p_item_id: itemId,
    p_price_gold: price,
  });
  if (error) throw error;
  return rowToListing(data);
}

export async function cancelListing(listingId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState();
    const arr = loadOfflineListings();
    const idx = arr.findIndex((l) => l.id === listingId);
    if (idx < 0) throw new Error("LISTING_NOT_FOUND");
    const listing = arr[idx];
    if (listing.seller_id !== st.profile.id) throw new Error("FORBIDDEN");
    if (listing.status !== "ACTIVE") return;

    // return item to inventory
    st.inventory.items.unshift(listing.item);
    arr[idx] = { ...listing, status: "CANCELED", updated_at: offlineNowIso() };
    saveOfflineListings(arr);
    saveOfflineState(st);
    return;
  }

  const { error } = await supabase.rpc("market_cancel_listing", { p_listing_id: listingId });
  if (error) throw error;
}

export async function buyListing(listingId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState();
    const arr = loadOfflineListings();
    const idx = arr.findIndex((l) => l.id === listingId);
    if (idx < 0) throw new Error("LISTING_NOT_FOUND");
    const listing = arr[idx];
    if (listing.status !== "ACTIVE") throw new Error("NOT_FOR_SALE");
    if (listing.seller_id === st.profile.id) throw new Error("CANNOT_BUY_OWN");

    const price = clampPrice(listing.price_gold);
    const tax = computeTax(price);
    const sellerNet = Math.max(0, price - tax);

    const payRes = applyGoldDelta(st.resources.gold, -price);
    if (!payRes.ok) throw new Error("INSUFFICIENT_GOLD");
    st.resources.gold = payRes.next;

    // transfer item
    st.inventory.items.unshift(listing.item);

    // mark sold (we don't credit seller in offline mode; it's a sandbox)
    arr[idx] = { ...listing, status: "SOLD", buyer_id: st.profile.id, updated_at: offlineNowIso() };
    saveOfflineListings(arr);
    saveOfflineState(st);
    return;
  }

  const { error } = await supabase.rpc("market_buy_listing", { p_listing_id: listingId });
  if (error) throw error;
}

/**
 * Convenience helpers for UI: list my active listings
 */
export async function listMyActiveListings(limit: number = 25): Promise<MarketListing[]> {
  if (!isSupabaseConfigured || !supabase) {
    const st = loadOfflineState();
    return loadOfflineListings().filter((l) => l.seller_id === st.profile.id && l.status === "ACTIVE").slice(0, limit);
  }
  const { data, error } = await supabase
    .from("market_listings")
    .select("*")
    .eq("seller_id", (await supabase.auth.getUser()).data.user?.id || "")
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(rowToListing);
}
