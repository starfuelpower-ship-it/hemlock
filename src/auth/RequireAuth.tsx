import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

/**
 * Protects routes ONLY when Supabase is configured.
 * In offline mode (no env vars), it allows access to the offline prototype.
 */
export default function RequireAuth(props: { children: React.ReactNode }) {
  const { configured, loading, user } = useAuth();
  const loc = useLocation();

  if (!configured) return <>{props.children}</>;
  if (loading) {
    return (
      <div className="min-h-screen g-noise flex items-center justify-center">
        <div className="g-panel p-6 text-sm text-zinc-200">
          Restoring session…
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace state={{ from: loc.pathname }} />;
  return <>{props.children}</>;
}
