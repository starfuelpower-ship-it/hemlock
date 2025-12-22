import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import SideNav from "../components/SideNav";
import ResourceBar from "../components/ResourceBar";
import { getProfile, getResources, listLegends, type LegendEntry } from "../systems/data";

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function isOnline(lastSeen?: string) {
  if (!lastSeen) return false;
  const d = new Date(lastSeen);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() < 5 * 60_000;
}

export default function Rankings() {
  const nav = useNavigate();
  const [resources, setResources] = useState({ gold: 0, vigor: 0, vigor_cap: 10, vigor_regen_minutes: 15 });
  const [risk, setRisk] = useState("Protected");
  const [me, setMe] = useState<string>("");

  const [rows, setRows] = useState<LegendEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      setErr(null);
      const p = await getProfile();
      setMe(p.id);
      setRisk(p.risk_state);
      const r = await getResources();
      setResources(r);
      const list = await listLegends(50);
      setRows(list);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load legends.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => rows, [rows]);

  return (
    <PageShell>
      <TopBar right={<ResourceBar resources={resources} riskLabel={risk} />} />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <SideNav />
          <div className="g-panel p-4">
            <div className="text-sm font-semibold">Legends of Hemlock</div>
            <div className="mt-2 text-xs text-zinc-400">
              A public ledger. Ranked by <span className="text-zinc-200">Domain Tier</span>, then <span className="text-zinc-200">Gold</span>,
              then <span className="text-zinc-200">Chronicles</span>.
            </div>

            <button className="g-btn mt-3 w-full" onClick={() => nav("/pvp")}>Go to PvP</button>
            <button className="g-btn mt-2 w-full" onClick={() => refresh()}>Refresh</button>
          </div>
        </div>

        <div className="lg:col-span-9">
          <div className="g-panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-semibold g-emboss">Legends of Hemlock</div>
                <div className="mt-1 text-sm text-zinc-300">A living ladder of names. Climb by building, earning, and surviving.</div>
              </div>
            </div>

            {err ? <div className="mt-3 text-sm text-red-300">{err}</div> : null}

            <div className="mt-4 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-400 border-b border-zinc-800/60">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Domain</th>
                    <th className="py-2 pr-3">Gold</th>
                    <th className="py-2 pr-3">Chronicles</th>
                    <th className="py-2 pr-3">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p, idx) => {
                    const you = p.id === me;
                    const online = isOnline(p.last_seen);
                    return (
                      <tr key={p.id} className={`border-b border-zinc-900/60 ${you ? "bg-purple-900/10" : ""}`}>
                        <td className="py-2 pr-3 text-zinc-400">{idx + 1}</td>
                        <td className="py-2 pr-3">
                          <button className="text-purple-100 hover:underline" onClick={() => nav(`/profile/${p.id}`)}>
                            {p.username}{you ? " (You)" : ""}
                          </button>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`g-pill ${online ? "border-emerald-400/30 text-emerald-200" : "border-zinc-700/40 text-zinc-300"}`}>
                            {online ? "Online" : "Offline"}
                          </span>
                        </td>
                        <td className="py-2 pr-3">Tier {p.domain_tier ?? 1}</td>
                        <td className="py-2 pr-3">{(p.gold ?? 0).toLocaleString()}</td>
                        <td className="py-2 pr-3">{(p.chronicle_count ?? 0).toLocaleString()}</td>
                        <td className="py-2 pr-3 text-zinc-400">{fmtDate(p.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {sorted.length === 0 ? (
                <div className="mt-4 text-sm text-zinc-400">No legends found yet.</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
