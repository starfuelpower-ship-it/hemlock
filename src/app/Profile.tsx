import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import SideNav from "../components/SideNav";
import ResourceBar from "../components/ResourceBar";
import { getProfile, getProfileById, getResources, listReports } from "../systems/data";
import type { Profile as ProfileT, Report } from "../types";
import { sortReportsNewestFirst } from "../systems/reports";

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function Profile() {
  const nav = useNavigate();
  const params = useParams();

  const [resources, setResources] = useState({ gold: 0, xp: 0, vigor: 0, vigor_cap: 10, vigor_regen_minutes: 15 });
  const [risk, setRisk] = useState("Protected");

  const [me, setMe] = useState<ProfileT | null>(null);
  const [viewing, setViewing] = useState<ProfileT | null>(null);
  const [recentReports, setRecentReports] = useState<Report[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const viewingOther = useMemo(() => {
    return !!(me && viewing && viewing.id !== me.id);
  }, [me, viewing]);

  async function refresh() {
    try {
      setErr(null);
      const [myProfile, myResources] = await Promise.all([getProfile(), getResources()]);
      setMe(myProfile);
      setResources(myResources);
      setRisk(myProfile.risk_state || "Protected");

      const targetId = params.id || myProfile.id;
      const targetProfile = targetId === myProfile.id ? myProfile : await getProfileById(targetId);
      setViewing(targetProfile || null);

      if (targetProfile && targetProfile.id === myProfile.id) {
        const reps = await listReports();
        const sorted = sortReportsNewestFirst(reps).slice(0, 5);
        setRecentReports(sorted);
      } else {
        setRecentReports([]);
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to load profile.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  return (
    <PageShell scene="profile">
      <TopBar right={<ResourceBar resources={resources} riskLabel={risk} />} />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <SideNav />
          <div className="hemlock-panel frame-profile p-4">
            <div className="text-sm font-semibold">Profile</div>
            <div className="mt-2 text-xs text-zinc-400">
              Identity is persistent when online. Offline mode uses your local wanderer identity.
            </div>
            <button className="g-btn mt-3 w-full" onClick={() => nav("/legends")}>
              View Legends
            </button>
            <button className="g-btn mt-2 w-full" onClick={() => nav("/home")}>
              Back to Home
            </button>
          </div>
        </div>

        <div className="lg:col-span-9 space-y-4">
          <div className="g-panel p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold g-emboss">
                  {viewing ? viewing.username : "Profile"}
                </div>
                {viewingOther ? <div className="mt-1 text-xs text-zinc-400">Viewing another player.</div> : null}
              </div>
              <button className="g-btn" onClick={() => refresh()}>
                Refresh
              </button>
            </div>

            {err ? <div className="mt-2 text-sm text-red-300">{err}</div> : null}

            {viewing ? (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="g-panel p-4 bg-zinc-950/30 border border-zinc-800/60">
                  <div className="text-sm font-semibold">Identity</div>
                  <div className="mt-3 space-y-2 text-sm text-zinc-200">
                    <div>
                      <span className="text-zinc-400">Username:</span>{" "}
                      <span className="font-semibold text-purple-100">{viewing.username}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400">Joined:</span> {fmtDate(viewing.created_at)}
                    </div>
                    <div>
                      <span className="text-zinc-400">Last seen:</span> {fmtDate(viewing.last_seen)}
                    </div>
                  </div>
                </div>

                <div className="g-panel p-4 bg-zinc-950/30 border border-zinc-800/60">
                  <div className="text-sm font-semibold">Status</div>
                  <div className="mt-3 space-y-2 text-sm text-zinc-200">
                    <div><span className="text-zinc-400">Level:</span> {viewing.level}</div>
                    <div><span className="text-zinc-400">Risk:</span> {viewing.risk_state}</div>
                    <div><span className="text-zinc-400">Premium:</span> {viewing.premium ? "Yes" : "No"}</div>
                  </div>
                </div>

                {viewingOther ? (
                  <div className="md:col-span-2 g-panel p-4 bg-zinc-950/30 border border-zinc-800/60">
                    <div className="text-sm font-semibold">Activity</div>
                    <div className="mt-2 text-sm text-zinc-300">
                      Recent activity is private in v1. You can still see their identity, status, and ranking.
                    </div>
                  </div>
                ) : (
                  <div className="md:col-span-2 g-panel p-4 bg-zinc-950/30 border border-zinc-800/60">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">Recent Reports</div>
                      <button className="g-btn" onClick={() => nav("/reports")}>Open Inbox</button>
                    </div>
                    {recentReports.length === 0 ? (
                      <div className="mt-2 text-sm text-zinc-300">No reports yet.</div>
                    ) : (
                      <div className="mt-3 divide-y divide-zinc-800/50">
                        {recentReports.map((r) => (
                          <button
                            key={r.id}
                            className="w-full text-left py-2 hover:bg-zinc-900/25 transition rounded"
                            onClick={() => nav("/reports")}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">{r.title}</div>
                                <div className="text-xs text-zinc-400 truncate">{r.kind}</div>
                              </div>
                              <div className="text-xs text-zinc-500 whitespace-nowrap">{fmtDate(r.created_at)}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 text-zinc-300">No profile found.</div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
