import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import SideNav from "../components/SideNav";
import ResourceBar from "../components/ResourceBar";
import ReportPanel from "../components/ReportPanel";
import ActionCard from "../components/ActionCard";
import ChatPanel from "../components/ChatPanel";
import { getProfile, getResources, listReports, queuePlayerAction } from "../systems/data";
import { Report } from "../types";
import { unreadCount, sortReportsNewestFirst } from "../systems/reports";
import { isSupabaseConfigured } from "../lib/supabase";

export default function Home() {
  const nav = useNavigate();
  const [profileName, setProfileName] = useState("...");
  const [risk, setRisk] = useState("Protected");
  const [resources, setResources] = useState({ gold: 0, vigor: 0, vigor_cap: 10, vigor_regen_minutes: 15 });
  const [reports, setReports] = useState<Report[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setErr(null);
      const p = await getProfile();
      setProfileName(p.username);
      setRisk(p.risk_state);
      const r = await getResources();
      setResources(r);
      const reps = await listReports();
      setReports(reps);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load.");
    }
  }

  useEffect(() => { refresh(); }, []);

  const newest = useMemo(() => sortReportsNewestFirst(reports)[0] ?? null, [reports]);
  const unread = useMemo(() => unreadCount(reports), [reports]);

  // v1 lock rule (matches mock): PvP unlocks at Level 4
  const pvpLocked = true;

  async function run(kind: "HUNT" | "STALK_RIVAL" | "BREACH_DOMAIN") {
    setBusy(true);
    try {
      await queuePlayerAction(kind);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <TopBar right={<ResourceBar resources={resources} riskLabel={risk} />} />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3">
          <SideNav pvpLocked={pvpLocked} pvpLockReason="Locked – Reach Level 4" />
          <div className="mt-4 g-panel p-3 text-xs text-zinc-300/90">
            <div className="font-semibold">Status</div>
            <div className="mt-2 space-y-1">
              <div><span className="text-zinc-400">Player:</span> {profileName}</div>
              <div><span className="text-zinc-400">Mode:</span> {isSupabaseConfigured ? "Online (Supabase)" : "Offline (local)"}</div>
              <div><span className="text-zinc-400">Unread Reports:</span> {unread}</div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 space-y-4">
          <div className="g-panel p-4">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold g-emboss">Visit the City</div>
              <button className="g-btn-primary" onClick={() => nav("/city")}>Go</button>
            </div>
            <div className="mt-2 text-sm text-zinc-300">A world-centric hub. Choose your next move.</div>
          </div>

          <ReportPanel title="Chronicle" report={newest} onOpenReports={() => nav("/reports")} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ActionCard kind="HUNT" disabled={busy || resources.vigor < 2} onRun={() => run("HUNT")} />
            <ActionCard kind="STALK_RIVAL" disabled={busy || resources.vigor < 3} onRun={() => run("STALK_RIVAL")} />
            <ActionCard kind="BREACH_DOMAIN" disabled={busy || resources.vigor < 5} hint="Scouting recommended. Raid results are partial theft, never a wipe." onRun={() => run("BREACH_DOMAIN")} />
            <div className="g-panel p-4">
              <div className="text-sm font-semibold">Domain Map</div>
              <div className="mt-2 text-sm text-zinc-400">v1 placeholder: districts unlock by level. This becomes the clickable world map later.</div>
              <div className="mt-3 flex gap-2">
                <button className="g-btn" onClick={() => nav("/domains")}>Open Domains</button>
                <button className="g-btn" onClick={() => nav("/court")}>Open Court</button>
              </div>
            </div>
          </div>

          {err ? <div className="g-panel p-3 text-sm text-red-300">{err}</div> : null}
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="g-panel p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Tutorial</div>
              <button className="g-btn" onClick={() => {}}>Dismiss</button>
            </div>
            <div className="mt-3 text-sm text-zinc-200/90">
              <div className="font-semibold g-emboss">The Fog Gathers</div>
              <div className="text-xs text-zinc-400 mt-1">Chronicle I</div>
              <div className="mt-2 text-xs text-zinc-300 leading-relaxed">
                Step 1: Visit the City<br />
                Step 2: Read your first Chronicle report<br />
                Step 3: Send thralls on a Blood Hunt
              </div>
              <div className="mt-3">
                <button className="g-btn-primary" onClick={() => nav("/chronicle")}>Read Chronicle</button>
              </div>
            </div>
          </div>

          <ChatPanel channel="world" title="World Chat" heightClass="h-[420px]" />
        </div>
      </div>
    </PageShell>
  );
}
