import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { Action, ActionKind, ChatMessage, Profile, Report, Resources } from "../types";
import { loadOfflineState, saveOfflineState, offlineNowIso } from "./offlineStore";
import { computeVigorRules, applyVigorRegen } from "./vigor";
import { queueAction, resolveActionToReport } from "./actions";
import { makeChatMessage } from "./chat";

function ensureOfflineTick() {
  const st = loadOfflineState();
  const now = new Date();
  const last = new Date(st.last_tick_iso);

  const rules = computeVigorRules(st.profile);
  const resources: Resources = { ...st.resources, ...rules };
  const regen = applyVigorRegen(resources, last, now);

  const actions = st.actions.map(a => ({ ...a }));
  const reports = st.reports.map(r => ({ ...r }));
  let gold = regen.gold;

  for (const a of actions) {
    if (a.status === "QUEUED" && new Date(a.resolves_at).getTime() <= now.getTime()) {
      const { goldDelta, report } = resolveActionToReport(a);
      a.status = "RESOLVED";
      a.resolved_at = now.toISOString();
      gold += goldDelta;
      reports.push(report);
    }
  }

  saveOfflineState({ ...st, resources: { ...regen, gold }, actions, reports, last_tick_iso: now.toISOString() });
}

export async function getProfile(): Promise<Profile> {
  if (!isSupabaseConfigured) { ensureOfflineTick(); return loadOfflineState().profile; }

  const { data: sessionRes } = await supabase!.auth.getSession();
  const uid = sessionRes.session?.user.id;
  if (!uid) return { id: "guest", username: "Guest", premium: false, level: 1, risk_state: "Protected" };

  const { data, error } = await supabase!.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (error) throw error;
  if (data) return data as Profile;

  const created: Profile = { id: uid, username: "Wanderer", premium: false, level: 1, risk_state: "Protected" };
  const ins = await supabase!.from("profiles").insert(created);
  if (ins.error) throw ins.error;
  return created;
}

export async function getResources(): Promise<Resources> {
  if (!isSupabaseConfigured) { ensureOfflineTick(); return loadOfflineState().resources; }

  const profile = await getProfile();
  const rules = computeVigorRules(profile);

  const { data: sessionRes } = await supabase!.auth.getSession();
  const uid = sessionRes.session?.user.id;
  if (!uid) return { gold: 0, vigor: rules.vigor_cap, vigor_cap: rules.vigor_cap, vigor_regen_minutes: rules.vigor_regen_minutes };

  const { data, error } = await supabase!.from("resource_state").select("*").eq("player_id", uid).maybeSingle();
  if (error) throw error;

  if (!data) {
    const nowIso = new Date().toISOString();
    const ins = await supabase!.from("resource_state").insert({ player_id: uid, gold: 1000, vigor: rules.vigor_cap, vigor_updated_at: nowIso });
    if (ins.error) throw ins.error;
    return { gold: 1000, vigor: rules.vigor_cap, vigor_cap: rules.vigor_cap, vigor_regen_minutes: rules.vigor_regen_minutes };
  }

  const last = new Date(data.vigor_updated_at as string);
  const now = new Date();
  const regen = applyVigorRegen({ gold: Number(data.gold), vigor: Number(data.vigor), vigor_cap: rules.vigor_cap, vigor_regen_minutes: rules.vigor_regen_minutes }, last, now);

  if (regen.vigor !== Number(data.vigor)) {
    await supabase!.from("resource_state").update({ vigor: regen.vigor, vigor_updated_at: now.toISOString() }).eq("player_id", uid);
  }
  return regen;
}

export async function queuePlayerAction(kind: ActionKind, target_id?: string | null): Promise<{ action: Action; resources: Resources }> {
  if (!isSupabaseConfigured) {
    ensureOfflineTick();
    const st = loadOfflineState();
    const t = queueAction(st.profile.id, kind, target_id);
    if (st.resources.vigor < t.vigor_cost) throw new Error("Not enough Vigor.");
    const next = { ...st, resources: { ...st.resources, vigor: st.resources.vigor - t.vigor_cost }, actions: [...st.actions, t] };
    saveOfflineState(next);
    return { action: t, resources: next.resources };
  }

  const { data: sessionRes } = await supabase!.auth.getSession();
  const uid = sessionRes.session?.user.id;
  if (!uid) throw new Error("Not signed in.");

  const cur = await getResources();
  const draft = queueAction(uid, kind, target_id);
  if (cur.vigor < draft.vigor_cost) throw new Error("Not enough Vigor.");

  const ins = await supabase!.from("actions").insert({
    id: draft.id, actor_id: uid, kind: draft.kind, target_id: draft.target_id,
    vigor_cost: draft.vigor_cost, gold_delta_min: draft.gold_delta_min, gold_delta_max: draft.gold_delta_max,
    duration_seconds: draft.duration_seconds, status: "QUEUED", resolves_at: draft.resolves_at
  });
  if (ins.error) throw ins.error;

  const nowIso = new Date().toISOString();
  const upd = await supabase!.from("resource_state").update({ vigor: cur.vigor - draft.vigor_cost, vigor_updated_at: nowIso }).eq("player_id", uid);
  if (upd.error) throw upd.error;

  return { action: draft, resources: { ...cur, vigor: cur.vigor - draft.vigor_cost } };
}

export async function listReports(): Promise<Report[]> {
  if (!isSupabaseConfigured) { ensureOfflineTick(); return loadOfflineState().reports; }
  const { data: sessionRes } = await supabase!.auth.getSession();
  const uid = sessionRes.session?.user.id;
  if (!uid) return [];
  const { data, error } = await supabase!.from("reports").select("*").eq("recipient_id", uid).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as Report[];
}

export async function markReportRead(reportId: string) {
  if (!isSupabaseConfigured) {
    ensureOfflineTick();
    const st = loadOfflineState();
    const reports = st.reports.map(r => (r.id === reportId ? { ...r, is_unread: false } : r));
    saveOfflineState({ ...st, reports });
    return;
  }
  await supabase!.from("reports").update({ is_unread: false }).eq("id", reportId);
}

export async function sendChat(channel: ChatMessage["channel"], message: string): Promise<void> {
  const trimmed = message.trim();
  if (!trimmed) return;

  if (!isSupabaseConfigured) {
    ensureOfflineTick();
    const st = loadOfflineState();
    const msg = makeChatMessage({ channel, sender_id: st.profile.id, sender_name: st.profile.username, message: trimmed });
    saveOfflineState({ ...st, chat: [...st.chat.slice(-99), msg] });
    return;
  }

  const profile = await getProfile();
  const ins = await supabase!.from("chat_messages").insert({
    channel, sender_id: profile.id, sender_name: profile.username, message: trimmed.slice(0, 280), created_at: offlineNowIso(),
  });
  if (ins.error) throw ins.error;
}

export async function listChat(channel: ChatMessage["channel"], limit = 50): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured) { ensureOfflineTick(); const st = loadOfflineState(); return st.chat.filter(m=>m.channel===channel).slice(-limit); }
  const { data, error } = await supabase!.from("chat_messages").select("*").eq("channel", channel).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).reverse() as ChatMessage[];
}
