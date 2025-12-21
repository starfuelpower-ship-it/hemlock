import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import ResourceBar from "../components/ResourceBar";
import { getProfile, getResources, listReports, markReportRead } from "../systems/data";
import { Report } from "../types";
import { sortReportsNewestFirst } from "../systems/reports";

export default function Reports() {
  const [resources, setResources] = useState({ gold: 0, vigor: 0, vigor_cap: 10, vigor_regen_minutes: 15 });
  const [risk, setRisk] = useState("Protected");
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      setErr(null);
      const p = await getProfile();
      setRisk(p.risk_state);
      const r = await getResources();
      setResources(r);
      const reps = await listReports();
      setReports(reps);
      if (!selectedId && reps.length) setSelectedId(reps[0].id);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load reports.");
    }
  }

  useEffect(() => { refresh(); }, []);

  const sorted = useMemo(() => sortReportsNewestFirst(reports), [reports]);
  const selected = useMemo(() => sorted.find(r => r.id === selectedId) ?? null, [sorted, selectedId]);

  async function openReport(id: string) {
    setSelectedId(id);
    const rep = sorted.find(r => r.id === id);
    if (rep?.is_unread) {
      await markReportRead(id);
      await refresh();
    }
  }

  return (
    <PageShell>
      <TopBar right={<ResourceBar resources={resources} riskLabel={risk} />} />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 g-panel overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-700/30 text-sm font-semibold">Reports Inbox</div>
          <div className="max-h-[70vh] overflow-y-auto">
            {sorted.map((r) => (
              <button
                key={r.id}
                onClick={() => openReport(r.id)}
                className={`w-full text-left px-4 py-3 border-b border-zinc-800/40 hover:bg-zinc-900/25 transition ${r.id === selectedId ? "bg-purple-900/15" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-sm">{r.title}</div>
                  {r.is_unread ? <span className="g-pill">Unread</span> : null}
                </div>
                <div className="text-xs text-zinc-400 mt-1">{new Date(r.created_at).toLocaleString()}</div>
              </button>
            ))}
            {!sorted.length ? <div className="p-4 text-sm text-zinc-400">No reports yet.</div> : null}
          </div>
        </div>

        <div className="lg:col-span-8 g-panel p-6">
          {selected ? (
            <>
              <div className="text-2xl font-semibold g-emboss">{selected.title}</div>
              <div className="mt-2 text-xs text-zinc-400">{new Date(selected.created_at).toLocaleString()}</div>
              <div className="mt-6 text-sm leading-relaxed text-zinc-200/90 whitespace-pre-wrap">{selected.body}</div>
              <div className="mt-6 text-xs text-zinc-500">Kind: <span className="text-zinc-300">{selected.kind}</span></div>
            </>
          ) : (
            <div className="text-sm text-zinc-400">Select a report.</div>
          )}

          {err ? <div className="mt-4 text-sm text-red-300">{err}</div> : null}
        </div>
      </div>
    </PageShell>
  );
}
