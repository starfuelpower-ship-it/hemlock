import { NavLink } from "react-router-dom";
import FramePanel from "./FramePanel";
import { artpack } from "../lib/artpack";

const tabs = [
  { to: "/city", label: "City" },
  { to: "/chronicle", label: "Chronicle" },
  { to: "/inventory", label: "Inventory" },
  { to: "/profile", label: "Profile" },
];

export default function TopBar(props: { right?: React.ReactNode }) {
  return (
    <FramePanel frameUrl={artpack.frames.topNav} className="w-full">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img
            src={artpack.icons.logoCrest}
            alt="Hemlock"
            className="h-10 w-10 opacity-95 drop-shadow"
            draggable={false}
          />
          <div className="text-xl font-semibold tracking-wide g-emboss">HEMLOCK</div>
          <div className="hidden sm:flex items-center gap-2 ml-2">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm border transition ${
                    isActive
                      ? "border-purple-400/50 bg-purple-900/20 text-white"
                      : "border-zinc-800/60 bg-zinc-950/40 text-zinc-200 hover:bg-zinc-900/30"
                  }`
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
    </FramePanel>
  );
}
