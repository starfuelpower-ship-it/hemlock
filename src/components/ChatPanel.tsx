import { useEffect, useMemo, useRef, useState } from "react";
import { ChatMessage } from "../types";
import { listChat, sendChat } from "../systems/data";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

export default function ChatPanel(props: { channel: ChatMessage["channel"]; title: string; heightClass?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const heightClass = props.heightClass ?? "h-64";

  async function refresh() {
    try {
      setErr(null);
      const data = await listChat(props.channel, 80);
      setMessages(data);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load chat.");
    }
  }

  useEffect(() => {
    refresh();
    if (!isSupabaseConfigured || !supabase) return;

    const ch = supabase
      .channel(`chat:${props.channel}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel=eq.${props.channel}` }, () => refresh())
      .subscribe();

    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.channel]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const rendered = useMemo(() => messages, [messages]);

  async function onSend() {
    const m = draft.trim();
    if (!m) return;
    setDraft("");
    try {
      await sendChat(props.channel, m);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to send.");
    }
  }

  return (
    <div className="g-panel p-3 flex flex-col">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{props.title}</div>
        <button className="g-btn" onClick={refresh}>Refresh</button>
      </div>

      <div className={`mt-2 ${heightClass} overflow-y-auto pr-1`}>
        {rendered.map((m) => (
          <div key={m.id} className="py-1 border-b border-zinc-800/30">
            <div className="text-xs text-zinc-300">
              <b className="text-zinc-100">{m.sender_name}</b>{" "}
              <span className="text-zinc-500">({new Date(m.created_at).toLocaleTimeString()})</span>
            </div>
            <div className="text-sm text-zinc-200/90">{m.message}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {err ? <div className="mt-2 text-xs text-red-300">{err}</div> : null}

      <div className="mt-2 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-zinc-700/40 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-purple-400/60"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSend(); }}
          placeholder="Speak into the fog…"
          maxLength={280}
        />
        <button className="g-btn-primary" onClick={onSend}>Send</button>
      </div>
    </div>
  );
}
