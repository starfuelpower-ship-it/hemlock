import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/city", label: "City" },
  { to: "/chronicle", label: "Chronicle" },
  { to: "/inventory", label: "Inventory" },
  { to: "/profile", label: "Profile" },
];

export default function TopBar(props: { right?: React.ReactNode }) {
  return (
    <div className="g-panel px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="text-xl font-semibold tracking-wide g-emboss">HEMLOCK</div>
        <div className="hidden sm:flex items-center gap-2">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm border transition ${isActive
                  ? "border-purple-400/50 bg-purple-900/25 text-white"
                  : "border-zinc-700/40 bg-zinc-950/40 text-zinc-200 hover:bg-zinc-900/40"}`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {props.right}
        <button className="g-btn" title="Account">Account</button>
        <button className="g-btn" title="Settings">Settings</button>
      </div>
    </div>
  );
}
