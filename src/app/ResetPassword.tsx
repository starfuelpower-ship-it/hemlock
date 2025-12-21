import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

function friendlyErr(e: any) {
  return e?.message ?? "Something went wrong.";
}

export default function ResetPassword() {
  const nav = useNavigate();
  const { configured } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) nav("/", { replace: true });
  }, [configured, nav]);

  async function onUpdate() {
    if (!supabase || !isSupabaseConfigured) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMsg("Password updated. You can sign in now.");
      setTimeout(() => nav("/", { replace: true }), 800);
    } catch (e: any) {
      setErr(friendlyErr(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen g-noise flex items-center justify-center p-6">
      <div className="g-panel p-6 w-full max-w-md">
        <div className="text-xl font-semibold g-emboss">Set new password</div>
        <div className="mt-1 text-sm text-zinc-300">Choose a new password to re-enter the fog.</div>

        {msg ? <div className="mt-4 text-sm text-emerald-200/90">{msg}</div> : null}
        {err ? <div className="mt-4 text-sm text-red-200/90">{err}</div> : null}

        <div className="mt-4">
          <div className="text-xs text-zinc-300 mb-1">New password</div>
          <input
            className="w-full rounded-lg border border-zinc-700/40 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-purple-400/60"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            type="password"
            disabled={busy}
            onKeyDown={(e) => { if (e.key === "Enter") onUpdate(); }}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <button className="g-btn" onClick={() => nav("/", { replace: true })} disabled={busy}>Back</button>
          <button className="g-btn-primary flex-1" onClick={onUpdate} disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </div>
      </div>
    </div>
  );
}
