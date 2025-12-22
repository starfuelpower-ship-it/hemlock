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
    if (!configured) return;
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
      if (!remember) {
        try {
          sessionStorage.setItem("hemlock_temp_session", "1");
          window.addEventListener("beforeunload", () => {
            supabase?.auth.signOut();
            sessionStorage.removeItem("hemlock_temp_session");
          }, { once: true });
        } catch {
          // ignore
        }
      }
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


  const disabledAll = disabled || !configured;

  
  return (
    <div className="hemlock-login">
      <div className="hemlock-login__bg" aria-hidden="true" />
      <div className="hemlock-login__wrap">
        <div className="hemlock-login__panelOverlay hemlock-login__panelOverlay--auth" role="group" aria-label="Hemlock authentication">
          <div className="hemlock-login__brand">HEMLOCK</div>
          <div className="hemlock-login__welcome">
            {mode === "signin" && "WELCOME BACK"}
            {mode === "signup" && "NEW SERVANT"}
            {mode === "forgot" && "RECOVERY"}
          </div>

          <div className="hemlock-login__form">
            <label className="hemlock-login__label" htmlFor="hemlock-email">E-mail</label>
            <input
              id="hemlock-email"
              className="hemlock-login__input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={disabledAll}
              placeholder="you@example.com"
            />

            {mode !== "forgot" && (
              <>
                <label className="hemlock-login__label" htmlFor="hemlock-password">Password</label>
                <input
                  id="hemlock-password"
                  className="hemlock-login__input"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={disabledAll}
                  placeholder="••••••••"
                />
              </>
            )}

            {mode === "signup" && (
              <>
                <label className="hemlock-login__label" htmlFor="hemlock-username">Username</label>
                <input
                  id="hemlock-username"
                  className="hemlock-login__input"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={disabledAll}
                  placeholder="Choose a name"
                />
              </>
            )}

            {mode !== "forgot" && (
              <label className="hemlock-login__row">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  disabled={disabledAll}
                />
                <span>Remember me</span>
              </label>
            )}

            {err && <div className="hemlock-login__err" role="alert">{err}</div>}
            {msg && <div className="hemlock-login__msg" role="status">{msg}</div>}

            <button
              type="button"
              className="hemlock-login__primaryBtn"
              onClick={() => {
                if (mode === "signin") return onSignIn();
                if (mode === "signup") return onSignUp();
                return onForgot();
              }}
              disabled={disabledAll}
            >
              {busy ? "Please wait..." : (mode === "signin" ? "Log in" : mode === "signup" ? "Create account" : "Send reset link")}
            </button>

            <div className="hemlock-login__links">
              {mode !== "signin" && (
                <button type="button" className="hemlock-login__linkBtn" onClick={() => { setMode("signin"); setErr(null); setMsg(null); }} disabled={disabledAll}>
                  Back to login
                </button>
              )}
              {mode !== "signup" && (
                <button type="button" className="hemlock-login__linkBtn" onClick={() => { setMode("signup"); setErr(null); setMsg(null); }} disabled={disabledAll}>
                  Create account
                </button>
              )}
              {mode !== "forgot" && (
                <button type="button" className="hemlock-login__linkBtn" onClick={() => { setMode("forgot"); setErr(null); setMsg(null); }} disabled={disabledAll}>
                  Forgot password?
                </button>
              )}
            </div>

            {!isSupabaseConfigured && (
              <div className="hemlock-login__serverWarn" role="status" aria-live="polite">
                <div className="hemlock-login__serverWarnTitle">Server not configured</div>
                <div className="hemlock-login__serverWarnBody">
                  Supabase environment variables are missing. You can still enter Offline Mode, but accounts will not work until the server is configured.
                </div>
                <div className="hemlock-login__serverWarnActions">
                  <button type="button" className="hemlock-login__secondaryBtn" onClick={() => nav("/home", { replace: true })}>
                    Enter Offline Mode
                  </button>
                  <button type="button" className="hemlock-login__secondaryBtn" onClick={() => nav("/setup")}>
                    View Setup
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );


}