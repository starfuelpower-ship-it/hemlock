import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

type AuthState = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  error: string | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider(props: { children: React.ReactNode }) {
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      setSession(null);
      setUser(null);
      setError(null);
      return;
    }
    try {
      setError(null);
      setLoading(true);
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to restore session.");
      setSession(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      setError(null);
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to sign out.");
    }
  }

  useEffect(() => {
    // initial restore + realtime auth changes
    refresh();
    if (!isSupabaseConfigured || !supabase) return;

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess ?? null);
      setUser(sess?.user ?? null);
      setLoading(false);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupabaseConfigured]);

  const value = useMemo<AuthState>(() => ({
    configured: isSupabaseConfigured,
    loading,
    session,
    user,
    error,
    signOut,
    refresh
  }), [loading, session, user, error]);

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) {
    return {
      configured: isSupabaseConfigured,
      loading: false,
      session: null,
      user: null,
      error: "AuthProvider not mounted.",
      signOut: async () => {},
      refresh: async () => {}
    };
  }
  return v;
}
