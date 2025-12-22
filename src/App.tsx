import { Navigate, Route, Routes } from "react-router-dom";
import AuthPage from "./app/Auth";
import ResetPassword from "./app/ResetPassword";
import RequireAuth from "./auth/RequireAuth";

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

export default function App() {
  return (
    <Routes>
      {/* Auth */}
      <Route path="/" element={<AuthPage />} />
      <Route path="/reset" element={<ResetPassword />} />

      {/* Game (protected only when Supabase is configured) */}
      <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/city" element={<RequireAuth><City /></RequireAuth>} />
      <Route path="/chronicle" element={<RequireAuth><Chronicle /></RequireAuth>} />
      <Route path="/inventory" element={<RequireAuth><Inventory /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
      <Route path="/profile/:id" element={<RequireAuth><Profile /></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><Reports /></RequireAuth>} />
      <Route path="/pvp" element={<RequireAuth><Pvp /></RequireAuth>} />
      <Route path="/court" element={<RequireAuth><Court /></RequireAuth>} />
      <Route path="/domains" element={<RequireAuth><Domains /></RequireAuth>} />
      <Route path="/legends" element={<RequireAuth><Legends /></RequireAuth>} />
      <Route path="/legends" element={<RequireAuth><Legends /></RequireAuth>} />

      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
