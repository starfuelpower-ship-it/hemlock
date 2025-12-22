import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChatMessage } from "../types";
import { listChat, sendChat } from "../systems/data";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

export default function ChatPanel(props: { channel: ChatMessage["channel"]; title: string; heightClass?: string }) {
  const nav = useNavigate();
  const auth = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [onlineNames, setOnlineNames] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);
  const lastSendRef = useRef<number>(0);
  const heightClass = props.heightClass ?? "h-64";

  const onlineLabel = useMemo(() => {
    if (!isSupabaseConfigured || !supabase) return null;
    return `Online now: ${onlineNames.length}`;
  }, [onlineNames.length]);

  async function refresh() {
    try {
      setErr(null);
      const data = await listChat(props.channel, 80);
      setMessages(data);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load chat.");
    }
  }

  async function onSend() {
    const msg = draft.trim();
    if (!msg) return;

    const now = Date.now();
    if (now - lastSendRef.current < 2000) {
      setErr("Slow down — one message every 2 seconds.");
      return;
    }

    try {
      setSending(true);
      setErr(null);
      lastSendRef.current = now;
      setDraft("");
      await sendChat(props.channel, msg);
      // If realtime is configured, the insert subscription will bring it in.
      // Still refresh once for offline mode / safety.
      if (!isSupabaseConfigured || !supabase) await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  function clickName(senderId: string) {
    // Basic safety: only navigate when it looks like a UUID
    if (!senderId) return;
    nav(`/profile/${senderId}`);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.channel]);

  useEffect(() => {
    const sb = supabase;
    if (!isSupabaseConfigured || !sb) return;

    // Realtime new messages for this channel
    const ch = sb
      .channel(`chat:${props.channel}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel=eq.${props.channel}` },
        (payload) => {
          const r: any = payload.new;
          const m: ChatMessage = {
            id: String(r.id),
            channel: r.channel,
            sender_id: String(r.sender_id),
            sender_name: String(r.sender_name),
            message: String(r.message),
            created_at: String(r.created_at),
          };

          setMessages((prev) => {
            // de-dupe by id
            if (prev.some((x) => x.id === m.id)) return prev;
            const next = [...prev, m];
            // keep last 120
            return next.slice(Math.max(0, next.length - 120));
          });

          requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(ch);
    };
  }, [props.channel]);

  useEffect(() => {
    const sb = supabase;
    if (!isSupabaseConfigured || !sb) return;
    const uid = auth.user?.id;
    const unameRaw = (auth.user?.user_metadata as any)?.username;
    const username = typeof unameRaw === "string" ? unameRaw.trim().slice(0, 20) : "Wanderer";

    // Presence channel
    const presence = sb.channel(`presence:${props.channel}`, {
      config: { presence: { key: uid ?? `guest-${Math.random().toString(16).slice(2)}` } },
    });

    presence
      .on("presence", { event: "sync" }, () => {
        const state = presence.presenceState() as Record<string, any[]>;
        const names: string[] = [];
        Object.values(state).forEach((arr) => {
          (arr || []).forEach((meta: any) => {
            if (meta?.u && typeof meta.u === "string") names.push(meta.u);
          });
        });
        // unique + limit to keep UI light
        const uniq = Array.from(new Set(names)).slice(0, 8);
        setOnlineNames(uniq);
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await presence.track({ u: username });
      });

    return () => {
      sb.removeChannel(presence);
    };
  }, [auth.user?.id, props.channel]);

  return (
    <div className="g-panel p-3 flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{props.title}</div>
          {onlineLabel ? <div className="text-xs text-zinc-400">{onlineLabel}{onlineNames.length ? ` • ${onlineNames.join(", ")}` : ""}</div> : null}
        </div>
        <button className="g-btn" onClick={refresh}>Refresh</button>
      </div>

      {err ? <div className="mt-2 text-xs text-red-300">{err}</div> : null}

      <div className={"mt-3 rounded-xl border border-zinc-700/30 bg-black/20 px-3 py-2 overflow-y-auto " + heightClass}>
        {messages.length === 0 ? (
          <div className="text-xs text-zinc-400">No messages yet.</div>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => (
              <div key={m.id} className="text-sm leading-snug">
                <div className="text-[10px] text-zinc-500 mb-0.5">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                <button className="text-purple-200 hover:text-purple-100 font-semibold" onClick={() => clickName(m.sender_id)} type="button">
                  {m.sender_name}
                </button>
                <span className="text-zinc-400">:</span>{" "}
                <span className="text-zinc-100">{m.message}</span>
              </div>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-2 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-zinc-700/30 bg-black/30 px-3 py-2 text-sm outline-none focus:border-purple-400/60"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSend(); }}
          placeholder="Speak into the fog…"
          maxLength={240}
          disabled={sending}
        />
        <button className="g-btn-primary" onClick={onSend} disabled={sending || !draft.trim()}>
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
