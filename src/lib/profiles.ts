import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";
import type { Profile } from "../types";

/**
 * Ensures a `profiles` row exists for the authenticated user.
 * - Prefers username from auth metadata: user.user_metadata.username
 * - Falls back to a unique username derived from uid.
 * - Safe to call multiple times.
 */
const LAST_SEEN_KEY = "hemlock:last_seen_ping";
const LAST_SEEN_MINUTES = 5;

function uniqueFallbackUsername(uid: string) {
  const compact = (uid || "").replace(/[^a-f0-9]/gi, "").slice(0, 6);
  return `wanderer-${compact || "000000"}`;
}

function pickUsernameFromMetadata(user: User): string | null {
  const u = (user.user_metadata as any)?.username;
  if (typeof u === "string") {
    const cleaned = u.trim().replace(/\s+/g, " ");
    if (cleaned.length >= 3 && cleaned.length <= 20) return cleaned;
  }
  return null;
}

async function tryInsertProfile(uid: string, username: string): Promise<Profile> {
  const { data, error } = await supabase!
    .from("profiles")
    .insert({ id: uid, username })
    .select("*")
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function ensureMyProfile(user: User): Promise<Profile> {
  if (!isSupabaseConfigured || !supabase) {
    // This should not be called in offline mode, but keep it safe.
    return {
      id: user.id,
      username: "Wanderer",
      premium: false,
      level: 1,
      risk_state: "Protected",
    };
  }

  const uid = user.id;

  // Read existing profile
  const existing = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as Profile;

  // Create missing profile
  const preferred = pickUsernameFromMetadata(user);
  const fallback = uniqueFallbackUsername(uid);

  // Try preferred first, then fallback if username is taken
  try {
    return await tryInsertProfile(uid, preferred ?? fallback);
  } catch (e: any) {
    // If preferred conflicted, fallback to unique fallback
    if (preferred && String(e?.message ?? "").toLowerCase().includes("duplicate")) {
      return await tryInsertProfile(uid, fallback);
    }
    // For other failures, still try fallback once
    if (preferred) {
      return await tryInsertProfile(uid, fallback);
    }
    throw e;
  }
}

/**
 * Non-critical: track last_seen for the current user (throttled).
 */
export async function pingLastSeen(uid: string) {
  if (!isSupabaseConfigured || !supabase) return;

  try {
    const now = Date.now();
    const last = Number(localStorage.getItem(LAST_SEEN_KEY) ?? "0");
    if (last && now - last < LAST_SEEN_MINUTES * 60_000) return;

    localStorage.setItem(LAST_SEEN_KEY, String(now));
    await supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", uid);
  } catch {
    // ignore (non-critical)
  }
}
