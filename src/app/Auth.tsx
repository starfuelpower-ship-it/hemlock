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
    <div className="hemlock-login">
      <div className="hemlock-login__bg" aria-hidden="true" />
      <div className="hemlock-login__vignette" aria-hidden="true" />
      <div className="hemlock-login__fog" aria-hidden="true" />

      <div className="hemlock-login__topbar">
        <div className="hemlock-login__welcome">WELCOME</div>

        <div className="hemlock-login__accountBtn">
          <button
            className="g-btn"
            onClick={() => setMode((m) => (m === "signup" ? "signin" : "signup"))}
            title={mode === "signup" ? "Switch to Sign in" : "Switch to Create account"}
            type="button"
          >
            ACCOUNT
          </button>
        </div>
      </div>

      <div className="hemlock-login__wrap">
        <div className="hemlock-login__panelFrame">
          <img src="/artpack/login/login_panel_ref.webp" alt="Hemlock login panel" className="hemlock-login__panelRef" draggable={false} />
          <div className="hemlock-login__panelOverlay">
          <div className="hemlock-login__brand">
            <h1 className="hemlock-login__title">HEMLOCK</h1>
            <div className="hemlock-login__subtitle">A gothic browser MMO of eternal night.</div>
          </div>

          {mode === "signup" && (
            <>
              <div className="hemlock-login__fieldLabel">Username</div>
              <input
                className="hemlock-login__input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Choose a name"
              />
            </>
          )}

          <div className="hemlock-login__fieldLabel">E-mail</div>
          <input
            className="hemlock-login__input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            placeholder="you@domain.com"
          />

          {mode !== "forgot" && (
            <>
              <div className="hemlock-login__fieldLabel">Password</div>
              <input
                className="hemlock-login__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="••••••••"
                type="password"
              />

              <div className="hemlock-login__row">
                <label className="hemlock-login__remember">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Remember me
                </label>

                <button
                  type="button"
                  className="hemlock-login__linkBtn"
                  onClick={() => {
                    setErr(null);
                    setMsg(null);
                    setMode("forgot");
                  }}
                >
                  Forgot password?
                </button>
              </div>
            </>
          )}

          <div className="hemlock-login__cta">
            {mode === "signin" && (
              <button
                className="hemlock-login__primaryBtn"
                onClick={onSignIn}
                disabled={busy}
                aria-busy={busy ? "true" : "false"}
              >
                {busy ? "Entering…" : "Enter"}
              </button>
            )}

            {mode === "signup" && (
              <button
                className="hemlock-login__primaryBtn"
                onClick={onSignUp}
                disabled={busy}
                aria-busy={busy ? "true" : "false"}
              >
                {busy ? "Creating…" : "Create account"}
              </button>
            )}

            {mode === "forgot" && (
              <button
                className="hemlock-login__primaryBtn"
                onClick={onForgot}
                disabled={busy}
                aria-busy={busy ? "true" : "false"}
              >
                {busy ? "Sending…" : "Send reset email"}
              </button>
            )}
          </div>

          {err && <div className="hemlock-login__error">{err}</div>}
          {msg && <div className="hemlock-login__hint">{msg}</div>}

          <div className="hemlock-login__links">
            {mode !== "signup" && (
              <button
                type="button"
                className="hemlock-login__linkBtn"
                onClick={() => {
                  setErr(null);
                  setMsg(null);
                  setMode("signup");
                }}
              >
                Create account
              </button>
            )}

            {mode === "forgot" && (
              <button
                type="button"
                className="hemlock-login__linkBtn"
                onClick={() => {
                  setErr(null);
                  setMsg(null);
                  setMode("signin");
                }}
              >
                Back to login
              </button>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );}
