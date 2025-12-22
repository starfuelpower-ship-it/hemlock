import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { isOnboarded } from "./onboarding";

/**
 * Requires an authenticated session (when Supabase is configured)
 * AND a completed onboarding step.
 */
export default function RequireOnboarded(props: { children: React.ReactNode }) {
  const { configured, loading, user } = useAuth();
  const loc = useLocation();

  // Offline prototype: allow access.
  if (!configured) return <>{props.children}</>;

  if (loading) {
    return (
      <div className="min-h-screen g-noise flex items-center justify-center">
        <div className="g-panel p-6 text-sm text-zinc-200">Restoring session…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace state={{ from: loc.pathname }} />;

  // If not onboarded yet, send to onboarding.
  if (!isOnboarded(user.id)) {
    return <Navigate to="/onboarding" replace state={{ from: loc.pathname }} />;
  }

  return <>{props.children}</>;
}
