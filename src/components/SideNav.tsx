import { NavLink } from "react-router-dom";
import FramePanel from "./FramePanel";
import { artpack } from "../lib/artpack";

const items = [
  { to: "/pvp", label: "PvP" },
  { to: "/reports", label: "Reports" },
  { to: "/legends", label: "Legends of Hemlock" },
  { to: "/court", label: "Guild" },
  { to: "/domains", label: "Domains" },
];

export default function SideNav(props: { pvpLocked?: boolean; pvpLockReason?: string }) {
  return (
    <FramePanel frameUrl={artpack.frames.sideNav} className="w-full" paddingClassName="p-4">
      <div className="text-sm font-semibold flex items-center justify-between">
        <span>Guild Systems</span>
        <span className="text-xs text-zinc-400">▸</span>
      </div>
      {props.pvpLocked ? (
        <div className="mt-3 text-xs text-zinc-300 border border-purple-400/20 bg-purple-950/30 rounded-lg p-3">
          <div className="font-semibold mb-1">PvP Locked</div>
          <div className="opacity-90">{props.pvpLockReason ?? "You are protected."}</div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-lg text-sm border transition ${
                isActive
                  ? "border-purple-400/50 bg-purple-900/20 text-white"
                  : "border-zinc-800/60 bg-zinc-950/40 text-zinc-200 hover:bg-zinc-900/30"
              }`
            }
          >
            {it.label}
          </NavLink>
        ))}
      </div>
    </FramePanel>
  );
}
