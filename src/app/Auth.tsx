import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

function friendlyErr(e: any) {
  const msg = e?.message ?? String(e ?? "");
  if (/Invalid login credentials/i.test(msg)) return "Email or password is incorrect.";
  if (/Email not confirmed/i.test(msg)) return "Please confirm your email, then try again.";
  if (/User already registered/i.test(msg)) return "That email is already registered. Try signing in.";
  if (/duplicate/i.test(msg)) return "That username is taken. Try another.";
  return msg || "Something went wrong.";
}

export default function AuthPage() {
  const nav = useNavigate();
  const loc = useLocation() as any;
  const { user, loading } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const from = useMemo(() => {
    const f = loc?.state?.from?.pathname;
    return typeof f === "string" ? f : "/city";
  }, [loc]);

  useEffect(() => {
    if (!loading && user) nav(from, { replace: true });
  }, [loading, user, from, nav]);

  const disabledAll = busy || loading;

  async function onSignIn() {
    if (!supabase || !isSupabaseConfigured) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      if (!email.trim()) throw new Error("Email is required.");
      if (!password) throw new Error("Password is required.");

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      setMsg("Welcome back.");
      // If remember is off, best-effort temporary session behavior.
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
      if (!password) throw new Error("Password is required.");
      if (password.length < 6) throw new Error("Password must be at least 6 characters.");
      if (!username.trim()) throw new Error("Username is required.");

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: username.trim() },
        }
      });
      if (error) throw error;

      // Create profile row if session exists (RLS should allow self insert via trigger/policy).
      try {
        const uid = data.user?.id;
        if (uid) {
          const ins = await supabase.from("profiles").insert({
            id: uid,
            email: email.trim(),
            username: username.trim(),
          });
          if (ins.error) throw ins.error;
        }
      } catch (e: any) {
        // Common: duplicate username. Convert to a friendly message.
        throw new Error(friendlyErr(e));
      }

      setMsg("Account created. Check your email if confirmation is required.");
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
    } catch (e: any) {
      setErr(friendlyErr(e));
    } finally {
      setBusy(false);
    }
  }

  const modeTitle =
    mode === "signin" ? "Welcome back" :
    mode === "signup" ? "Create account" :
    "Reset password";

  const primaryLabel =
    busy ? "Please wait…" :
    mode === "signin" ? "Log in" :
    mode === "signup" ? "Create account" :
    "Send reset email";

  return (
    <div className="hemlock-login">
      <div className="hemlock-login__bg" aria-hidden="true" />
      <div className="hemlock-login__vignette" aria-hidden="true" />

      <div className="hemlock-login__wrap">
        <div className="hemlock-login__panel" role="group" aria-label="Hemlock authentication">
          <div className="hemlock-login__header">
            <div className="hemlock-login__kicker">
              {mode === "signin" ? "Sign in" : mode === "signup" ? "New servant" : "Recovery"}
            </div>
            <div className="hemlock-login__modeTitle">{modeTitle}</div>
          </div>

          <div className="hemlock-login__form">
            <div>
              <label className="hemlock-login__label" htmlFor="hemlock-email">Email</label>
              <input
                id="hemlock-email"
                className="hemlock-login__input"
                type="email"
                autoComplete={mode === "signin" ? "email" : "email"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={disabledAll}
                placeholder="you@example.com"
              />
            </div>

            {mode !== "forgot" && (
              <div>
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
              </div>
            )}

            {mode === "signup" && (
              <div>
                <label className="hemlock-login__label" htmlFor="hemlock-username">Username</label>
                <input
                  id="hemlock-username"
                  className="hemlock-login__input"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={disabledAll}
                  placeholder="Your public name"
                />
              </div>
            )}

            <div className="hemlock-login__row">
              <label className="hemlock-login__check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  disabled={disabledAll || mode !== "signin"}
                />
                Remember me
              </label>
            </div>

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
              disabled={disabledAll || (!isSupabaseConfigured && mode !== "signin")}
            >
              {primaryLabel}
            </button>

            <div className="hemlock-login__links">
              {mode !== "signin" && (
                <button type="button" className="hemlock-login__link" onClick={() => { setErr(null); setMsg(null); setMode("signin"); }}>
                  Back to sign in
                </button>
              )}

              {mode === "signin" && (
                <>
                  <button type="button" className="hemlock-login__link" onClick={() => { setErr(null); setMsg(null); setMode("signup"); }}>
                    Create account
                  </button>
                  <button type="button" className="hemlock-login__link" onClick={() => { setErr(null); setMsg(null); setMode("forgot"); }}>
                    Forgot password?
                  </button>
                </>
              )}
            </div>

            {!isSupabaseConfigured && (
              <div className="hemlock-login__serverWarn" role="note" aria-label="Server not configured">
                <div className="hemlock-login__serverWarnTitle">Server not configured</div>
                <div className="hemlock-login__serverWarnBody">
                  Supabase environment variables are missing. You can still enter Offline Mode, but accounts will not work until the server is configured.
                </div>
                <div className="hemlock-login__serverWarnActions">
                  <button type="button" className="hemlock-login__smallBtn" onClick={() => nav("/home", { replace: true })}>
                    Enter Offline Mode
                  </button>
                  <button type="button" className="hemlock-login__smallBtn" onClick={() => nav("/setup")}>
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
