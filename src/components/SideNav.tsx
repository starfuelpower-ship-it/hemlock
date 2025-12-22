import { NavLink } from "react-router-dom";

const items = [
  { to: "/pvp", label: "PvP" },
  { to: "/reports", label: "Reports" },
  { to: "/legends", label: "Legends of Hemlock" },
  { to: "/court", label: "Court" },
  { to: "/domains", label: "Domains" },
];

export default function SideNav(props: { pvpLocked?: boolean; pvpLockReason?: string }) {
  return (
    <div className="g-panel overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-700/30 text-sm font-semibold flex items-center justify-between">
        <span>Court Systems</span>
        <span className="text-xs text-zinc-400">▸</span>
      </div>

      <div className="p-2 space-y-2">
        {items.map((it) => {
          const isPvp = it.to === "/pvp";
          const locked = isPvp && props.pvpLocked;

          if (locked) {
            return (
              <div key={it.label} className="px-3 py-2 rounded-lg text-sm border border-zinc-800/60 bg-zinc-950/50 text-zinc-400">
                <div className="flex items-center justify-between">
                  <span>{it.label}</span>
                  <span className="g-pill">Locked</span>
                </div>
                {props.pvpLockReason ? <div className="mt-1 text-xs text-zinc-500">{props.pvpLockReason}</div> : null}
              </div>
            );
          }

          return (
            <NavLink
              key={it.label}
              to={it.to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm border transition ${isActive
                  ? "border-purple-400/50 bg-purple-900/20 text-white"
                  : "border-zinc-800/60 bg-zinc-950/40 text-zinc-200 hover:bg-zinc-900/30"}`
              }
            >
              {it.label}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
