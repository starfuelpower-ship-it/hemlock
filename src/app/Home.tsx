import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import SideNav from "../components/SideNav";
import ResourceBar from "../components/ResourceBar";
import ReportPanel from "../components/ReportPanel";
import ActionCard from "../components/ActionCard";
import ChatPanel from "../components/ChatPanel";
import FramePanel from "../components/FramePanel";
import { artpack } from "../lib/artpack";
import { getProfile, getResources, listReports, queuePlayerAction } from "../systems/data";
import { Report, Resources, ActionKind, Profile } from "../types";
import { unreadCount, sortReportsNewestFirst } from "../systems/reports";

export default function Home() {
  const nav = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);
  const [resources, setResources] = useState<Resources>({ gold: 0, xp: 0, vigor: 0, vigor_cap: 10, vigor_regen_minutes: 15 });
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      const prof = await getProfile();
      setProfile(prof ?? null);
      const res = await getResources();
      if (res) setResources(res);
      const reps = await listReports(40);
      setReports(reps ?? []);
    })();
  }, []);

  const unread = useMemo(() => unreadCount(reports), [reports]);
  const newest = useMemo(() => sortReportsNewestFirst(reports)[0], [reports]);

  async function run(kind: ActionKind) {
    setBusy(true);
    try {
      await queuePlayerAction(kind);
      const reps = await listReports(40);
      setReports(reps ?? []);
      const res = await getResources();
      if (res) setResources(res);
    } finally {
      setBusy(false);
    }
  }

  const riskLabel = profile?.risk_state ?? "PROTECTED";
  const name = profile?.username ?? "Wanderer";

  return (
    <PageShell>
      <div className="space-y-4">
        <TopBar right={<ResourceBar resources={resources} riskLabel={riskLabel} />} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-3">
            <SideNav />
          </div>

          <div className="lg:col-span-6 space-y-4">
            <FramePanel frameUrl={artpack.frames.cta} className="w-full" ariaLabel="Current Objective">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold g-emboss">A New Night Begins</div>
                  <div className="mt-1 text-sm text-zinc-200/90">
                    Welcome back, <span className="font-semibold text-white">{name}</span>. Choose your next move in the City.
                  </div>
                </div>
                <button className="g-btn-primary" onClick={() => nav("/city")}>Enter City</button>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <ActionCard kind="HUNT" disabled={busy || resources.vigor < 2} onRun={() => run("HUNT")} />
                <ActionCard kind="STALK_RIVAL" disabled={busy || resources.vigor < 3} onRun={() => run("STALK_RIVAL")} />
                <ActionCard kind="BREACH_DOMAIN" disabled={busy || resources.vigor < 5} onRun={() => run("BREACH_DOMAIN")} />
              </div>
            </FramePanel>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <FramePanel frameUrl={artpack.frames.profile} ariaLabel="Advisor">
                <div className="flex items-center gap-3">
                  <img src={artpack.portraits.advisor} alt="Advisor" className="h-12 w-12 rounded-full border border-purple-400/30" />
                  <div>
                    <div className="text-sm font-semibold g-emboss">Your Advisor</div>
                    <div className="text-xs text-zinc-300">The Spire watches. Choose wisely. Your Chronicle remembers everything.</div>
                  </div>
                </div>
              </FramePanel>

              <ReportPanel title="Most Recent Chronicle" report={newest} onOpenReports={() => nav("/reports")} />
            </div>

            <ChatPanel channel="world" title="World Whisper" />
          </div>

          <div className="lg:col-span-3 space-y-4">
            <FramePanel frameUrl={artpack.frames.tutorial} ariaLabel="Chronicle I – The Fog Gathers">
              <div className="text-sm font-semibold g-emboss">Chronicle I — The Fog Gathers</div>
              <div className="mt-2 text-xs text-zinc-200/90">
                Start in the City, claim a Domain foothold, then begin Operations. You are protected at first — but protection fades.
              </div>
              <div className="mt-3 flex gap-2">
                <button className="g-btn-primary" onClick={() => nav("/chronicle")}>Open Chronicle</button>
                <button className="g-btn" onClick={() => nav("/reports")}>View Reports</button>
              </div>
            </FramePanel>

            <FramePanel frameUrl={artpack.frames.domainOverview} ariaLabel="Domain Status">
              <div className="text-sm font-semibold g-emboss">Domain Status</div>
              <div className="mt-2 text-xs text-zinc-300">
                Domains unlock upgrades and determine raid risk. Keep upkeep paid and stay protected when possible.
              </div>
              <div className="mt-3 flex gap-2">
                <button className="g-btn" onClick={() => nav("/domains")}>Manage</button>
                <button className="g-btn" onClick={() => nav("/pvp")}>Operations</button>
              </div>
            </FramePanel>
          </div>
        </div>

        <FramePanel frameUrl={artpack.frames.domainMap} className="w-full" ariaLabel="World Districts" paddingClassName="p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold g-emboss">Districts of Hemlock</div>
            <button className="g-btn" onClick={() => nav("/domains")}>View Domains</button>
          </div>
          <div className="mt-2 text-xs text-zinc-300">A living map view will arrive as the world awakens.</div>
        </FramePanel>
      </div>
    </PageShell>
  );
}
