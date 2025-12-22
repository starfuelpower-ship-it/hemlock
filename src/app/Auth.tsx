import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

function friendlyErr(e: any) {
  const msg = e?.message ?? String(e ?? "");
  if (/Invalid login credentials/i.test(msg)) return "Email or password is incorrect.";
  if (/Email not confirmed/i.test(msg)) return "Please confirm your email, then try again.";
  if (/User already registered/i.test(msg)) return "That email is already registered. Try signing in.";
  return msg || "Something went wrong.";
}

export default function AuthPage() {
  const nav = useNavigate();
  const loc = useLocation() as any;
  const { configured, user, loading } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const from = useMemo(() => loc?.state?.from ?? "/home", [loc]);

  useEffect(() => {
    if (!configured) {
      // offline build: skip auth entirely
      nav("/home", { replace: true });
      return;
    }
    if (!loading && user) nav(from, { replace: true });
  }, [configured, loading, user, nav, from]);

  async function onSignIn() {
    if (!supabase || !isSupabaseConfigured) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      if (!email.trim()) throw new Error("Email is required.");
      if (!password) throw new Error("Password is required.");
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (error) throw error;
      setMsg("Welcome back.");
      nav(from, { replace: true });
    } catch (e: any) {
      setErr(friendlyErr(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSignUp() {
    if (!supabase || !isSupabaseConfigured) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      if (!email.trim()) throw new Error("Email is required.");
      if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");
      if (!username.trim() || username.trim().length < 3) throw new Error("Username must be at least 3 characters.");
      const uname = username.trim();
      const redirectTo = `${window.location.origin}/`;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: redirectTo, data: { username: uname } }
      });
      if (error) throw error;

      // If we got a session immediately (email confirmations disabled), create profile row now.
      const uid = data.user?.id;
      if (uid) {
        const ins = await supabase.from("profiles").insert({
          id: uid,
          username: uname,
          premium: false,
          level: 1,
          risk_state: "Protected"
        });
        if (ins.error) {
          // Most common: username conflict. Show a human message.
          if (String(ins.error.message).toLowerCase().includes("duplicate")) {
            throw new Error("That username is taken. Try another.");
          }
          throw ins.error;
        }
      }

      setMsg("Account created. Check your email if confirmation is required.");
      // If we have a session, redirect. Otherwise keep on sign-in mode.
      if (data.session) nav(from, { replace: true });
      else setMode("signin");
    } catch (e: any) {
      setErr(friendlyErr(e));
    } finally {
      setBusy(false);
    }
  }

  async function onForgot() {
    if (!supabase || !isSupabaseConfigured) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      if (!email.trim()) throw new Error("Enter your email first.");
      const redirectTo = `${window.location.origin}/reset`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setMsg("Password reset email sent. Check your inbox.");
      setMode("signin");
    } catch (e: any) {
      setErr(friendlyErr(e));
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || (configured && loading);

  return (
    <div className="min-h-screen g-noise relative overflow-hidden">
      <div className="g-fog pointer-events-none" />
      <div className="absolute inset-0 -z-10 opacity-60" style={{
        background:
          "radial-gradient(900px 500px at 50% 20%, rgba(168,85,247,.16), transparent 55%)," +
          "radial-gradient(900px 550px at 20% 80%, rgba(217,70,239,.10), transparent 55%)," +
          "linear-gradient(180deg, rgba(9,9,11,.92), rgba(9,9,11,.96))"
      }} />

      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md g-panel p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-2xl font-semibold g-emboss tracking-wide">Hemlock</div>
              <div className="mt-1 text-sm text-zinc-300">Enter the fog. Claim your place in the Chronicle.</div>
            </div>
            <div className="text-xs text-zinc-400 text-right">
              {configured ? "Online" : "Offline"}
            </div>
          </div>

          {!configured ? (
            <div className="mt-4 text-sm text-yellow-200/90">
              Supabase is not configured. Add <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_ANON_KEY</b> to your environment, then reload.
              <div className="mt-3">
                <Link className="g-btn" to="/home">Continue Offline</Link>
              </div>
            </div>
          ) : null}

          {msg ? <div className="mt-4 text-sm text-emerald-200/90">{msg}</div> : null}
          {err ? <div className="mt-4 text-sm text-red-200/90">{err}</div> : null}

          {configured ? (
            <>
              <div className="mt-4 flex gap-2 text-xs">
                <button className={`g-btn ${mode==="signin" ? "border-purple-400/60" : ""}`} onClick={() => { setMode("signin"); setErr(null); setMsg(null); }} disabled={disabled}>Sign in</button>
                <button className={`g-btn ${mode==="signup" ? "border-purple-400/60" : ""}`} onClick={() => { setMode("signup"); setErr(null); setMsg(null); }} disabled={disabled}>Create account</button>
                <button className={`g-btn ${mode==="forgot" ? "border-purple-400/60" : ""}`} onClick={() => { setMode("forgot"); setErr(null); setMsg(null); }} disabled={disabled}>Forgot password</button>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <div className="text-xs text-zinc-300 mb-1">Email</div>
                  <input
                    className="w-full rounded-lg border border-zinc-700/40 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-purple-400/60"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    autoComplete="email"
                    inputMode="email"
                    disabled={disabled}
                  />
                </label>

                {mode === "signup" ? (
                  <label className="block">
                    <div className="text-xs text-zinc-300 mb-1">Username</div>
                    <input
                      className="w-full rounded-lg border border-zinc-700/40 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-purple-400/60"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Choose a name"
                      autoComplete="username"
                      maxLength={20}
                      disabled={disabled}
                    />
                  </label>
                ) : null}

                {mode !== "forgot" ? (
                  <label className="block">
                    <div className="text-xs text-zinc-300 mb-1">Password</div>
                    <input
                      className="w-full rounded-lg border border-zinc-700/40 bg-zinc-950/40 px-3 py-2 text-sm outline-none focus:border-purple-400/60"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      type="password"
                      disabled={disabled}
                      onKeyDown={(e) => { if (e.key === "Enter") { mode==="signin" ? onSignIn() : onSignUp(); } }}
                    />
                  </label>
                ) : null}

                {mode === "signin" ? (
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={disabled} />
                    Remember me
                  </label>
                ) : null}

                <div className="pt-1 flex gap-2">
                  {mode === "signin" ? (
                    <button className="g-btn-primary flex-1" onClick={onSignIn} disabled={disabled}>
                      {busy ? "Signing in…" : "Sign in"}
                    </button>
                  ) : null}

                  {mode === "signup" ? (
                    <button className="g-btn-primary flex-1" onClick={onSignUp} disabled={disabled}>
                      {busy ? "Creating…" : "Create account"}
                    </button>
                  ) : null}

                  {mode === "forgot" ? (
                    <button className="g-btn-primary flex-1" onClick={onForgot} disabled={disabled}>
                      {busy ? "Sending…" : "Send reset link"}
                    </button>
                  ) : null}
                </div>

                <div className="text-xs text-zinc-400 leading-relaxed">
                  By continuing, you agree to keep your blade sheathed until the fog lifts.
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
