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
        <div className="hemlock-login__panel" role="group" aria-label="Hemlock authentication">
          <div className="hemlock-login__panelArt" aria-hidden="true" />
          <div className="hemlock-login__panelHotspots">
            <div className="hemlock-login__hot" style={{ left: "32.55%", top: "29.30%", width: "34.51%", height: "4.88%" }}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={disabledAll}
                aria-label="Email"
              />
            </div>

            <div className="hemlock-login__hot" style={{ left: "32.55%", top: "41.02%", width: "34.51%", height: "4.88%" }}>
              <input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={disabledAll}
                aria-label="Password"
              />
            </div>

            <button
              type="button"
              className="hemlock-login__hot"
              style={{ left: "31.58%", top: "51.27%", width: "1.95%", height: "2.93%" }}
              onClick={() => setRemember((v) => !v)}
              disabled={disabledAll}
              aria-label={remember ? "Remember me on this device" : "Do not remember me"}
            />
            <button
              type="button"
              className="hemlock-login__hot hemlock-login__link"
              style={{ left: "33.85%", top: "50.78%", width: "19.54%", height: "3.91%" }}
              onClick={() => setRemember((v) => !v)}
              disabled={disabledAll}
              aria-label="Toggle remember me"
            />

            <button
              type="button"
              className="hemlock-login__hot hemlock-login__btn"
              style={{ left: "37.76%", top: "59.57%", width: "24.74%", height: "7.81%" }}
              onClick={mode === "signin" ? onSignIn : mode === "signup" ? onSignUp : onForgot}
              disabled={disabledAll}
              aria-label={mode === "signin" ? "Log in" : mode === "signup" ? "Create account" : "Send reset email"}
            />

            <button
              type="button"
              className="hemlock-login__hot hemlock-login__link"
              style={{ left: "40.36%", top: "72.75%", width: "20.19%", height: "3.91%" }}
              onClick={() => { setErr(null); setMsg(null); setMode("signup"); }}
              disabled={disabledAll}
              aria-label="Create account"
            />

            <button
              type="button"
              className="hemlock-login__hot hemlock-login__link"
              style={{ left: "40.36%", top: "78.12%", width: "22.14%", height: "3.42%" }}
              onClick={() => { setErr(null); setMsg(null); setMode("forgot"); }}
              disabled={disabledAll}
              aria-label="Forgot password"
            />
          </div>
        </div>

        <div className="hemlock-login__notice" role="status" aria-live="polite">
          <div className="hemlock-login__noticeTitle">
            {configured ? (mode === "signin" ? "Enter Hemlock" : mode === "signup" ? "Create your account" : "Recover access") : "Server not configured"}
          </div>

          {!configured ? (
            <>
              <div className="hemlock-login__noticeText">
                Supabase environment variables are missing. You can still enter Offline Mode, but accounts will not work until the server is configured.
              </div>
              <div className="hemlock-login__noticeActions">
                <button className="hemlock-login__smallBtn" onClick={() => nav("/home", { replace: true })}>
                  Enter Offline Mode
                </button>
                <button className="hemlock-login__smallBtn" onClick={() => nav("/setup")}>
                  View Setup
                </button>
              </div>
            </>
          ) : (
            <>
              {err && <div className="hemlock-login__noticeText" style={{ color: "rgba(255,160,160,0.95)" }}>{err}</div>}
              {msg && <div className="hemlock-login__noticeText" style={{ color: "rgba(190,255,220,0.95)" }}>{msg}</div>}

              {mode === "signup" && (
                <div style={{ marginTop: 10 }}>
                  <div className="hemlock-login__noticeText" style={{ marginBottom: 6 }}>
                    Username (required)
                  </div>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={disabled}
                    placeholder="Choose a name (3+ chars)"
                    autoComplete="username"
                    style={{
                      width: "100%",
                      background: "rgba(10, 8, 14, 0.45)",
                      border: "1px solid rgba(188, 120, 255, 0.22)",
                      borderRadius: 12,
                      padding: "10px 12px",
                      color: "rgba(246, 240, 255, 0.98)",
                      outline: "none"
                    }}
                  />
                  <div className="hemlock-login__noticeActions">
                    <button className="hemlock-login__smallBtn" onClick={() => { setMode("signin"); setErr(null); setMsg(null); }}>
                      Back to login
                    </button>
                  </div>
                </div>
              )}

              {mode === "forgot" && (
                <div className="hemlock-login__noticeActions">
                  <button className="hemlock-login__smallBtn" onClick={() => { setMode("signin"); setErr(null); setMsg(null); }}>
                    Back to login
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}