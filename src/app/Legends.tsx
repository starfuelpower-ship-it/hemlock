import { useEffect, useState } from "react";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import { listLegends } from "../systems/data";

type Row = {
  id: string;
  username: string;
  level: number;
  premium: boolean;
  risk_state: string;
  gold?: number;
  domain_tier?: number;
  last_seen?: string;
  chronicle_count?: number;
};

export default function Legends() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const r = await listLegends(50);
        if (mounted) setRows(r as any);
      } catch (e: any) {
        if (mounted) setErr(e?.message ?? "Failed to load legends.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <PageShell scene="legends">
      <TopBar />
      <div className="px-1">
        <div className="text-lg font-semibold tracking-wide text-zinc-100">Legends of Hemlock</div>
      </div>
      <div className="g-panel p-4 space-y-3">
        {loading ? (
          <div className="text-sm text-zinc-300">Loading…</div>
        ) : err ? (
          <div className="text-sm text-red-300">{err}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-zinc-300">No legends yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-zinc-300">
                <tr className="border-b border-zinc-800/60">
                  <th className="text-left py-2 pr-3">#</th>
                  <th className="text-left py-2 pr-3">Player</th>
                  <th className="text-left py-2 pr-3">Level</th>
                  <th className="text-left py-2 pr-3">Risk</th>
                  <th className="text-left py-2 pr-3">Gold</th>
                  <th className="text-left py-2 pr-3">Domain</th>
                  <th className="text-left py-2 pr-3">Chronicles</th>
                </tr>
              </thead>
              <tbody className="text-zinc-100">
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-b border-zinc-900/60">
                    <td className="py-2 pr-3 text-zinc-400">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <span className="font-semibold">{r.username}</span>
                      {r.premium ? <span className="ml-2 text-xs text-purple-300">VIP</span> : null}
                    </td>
                    <td className="py-2 pr-3">{r.level}</td>
                    <td className="py-2 pr-3 text-zinc-300">{r.risk_state}</td>
                    <td className="py-2 pr-3">{typeof r.gold === "number" ? r.gold : "—"}</td>
                    <td className="py-2 pr-3">{typeof r.domain_tier === "number" ? `Tier ${r.domain_tier}` : "—"}</td>
                    <td className="py-2 pr-3">{typeof r.chronicle_count === "number" ? r.chronicle_count : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}
