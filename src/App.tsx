import { Navigate, Route, Routes } from "react-router-dom";
import AuthPage from "./app/Auth";
import ResetPassword from "./app/ResetPassword";
import RequireAuth from "./auth/RequireAuth";
import RequireOnboarded from "./auth/RequireOnboarded";

import Home from "./app/Home";
import City from "./app/City";
import Chronicle from "./app/Chronicle";
import Inventory from "./app/Inventory";
import Profile from "./app/Profile";
import Reports from "./app/Reports";
import Pvp from "./app/Pvp";
import Court from "./app/Court";
import Domains from "./app/Domains";
import Legends from "./app/Legends";
import Setup from "./app/Setup";
import Onboarding from "./app/Onboarding";

export default function App() {
  return (
    <Routes>
      {/* Auth */}
      <Route path="/" element={<AuthPage />} />
      <Route path="/reset" element={<ResetPassword />} />
      <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />

      {/* Game (protected only when Supabase is configured) */}
      <Route path="/home" element={<RequireOnboarded><Home /></RequireOnboarded>} />
      <Route path="/city" element={<RequireOnboarded><City /></RequireOnboarded>} />
      <Route path="/chronicle" element={<RequireOnboarded><Chronicle /></RequireOnboarded>} />
      <Route path="/inventory" element={<RequireOnboarded><Inventory /></RequireOnboarded>} />
      <Route path="/profile" element={<RequireOnboarded><Profile /></RequireOnboarded>} />
      <Route path="/profile/:id" element={<RequireOnboarded><Profile /></RequireOnboarded>} />
      <Route path="/reports" element={<RequireOnboarded><Reports /></RequireOnboarded>} />
      <Route path="/pvp" element={<RequireOnboarded><Pvp /></RequireOnboarded>} />
      <Route path="/court" element={<RequireOnboarded><Court /></RequireOnboarded>} />
      <Route path="/domains" element={<RequireOnboarded><Domains /></RequireOnboarded>} />
      <Route path="/legends" element={<RequireOnboarded><Legends /></RequireOnboarded>} />

      <Route path="/rankings" element={<Navigate to="/legends" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
