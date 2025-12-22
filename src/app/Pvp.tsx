import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import SideNav from "../components/SideNav";
import ResourceBar from "../components/ResourceBar";
import { getProfile, getResources, listLegends, listMyActions, queuePlayerAction } from "../systems/data";
import type { Action, ActionKind } from "../types";
import type { LegendEntry } from "../systems/data";
import { ACTIONS } from "../systems/actions";

function remainingLabel(resolves_at: string, status: string) {
  if (status !== "QUEUED") return status;
  const t = new Date(resolves_at).getTime();
  if (Number.isNaN(t)) return "QUEUED";
  const ms = t - Date.now();
  if (ms <= 0) return "Resolving…";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function Pvp() {
  const [resources, setResources] = useState({ gold: 0, xp: 0, vigor: 0, vigor_cap: 10, vigor_regen_minutes: 15 });
  const [risk, setRisk] = useState("Protected");
  const [me, setMe] = useState<string>("");
  const [level, setLevel] = useState<number>(1);

  const [legends, setLegends] = useState<LegendEntry[]>([]);
  const [rivalId, setRivalId] = useState<string>("");
  const [actions, setActions] = useState<Action[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pvpLocked = level < 4;
  const pvpLockReason = "PvP unlocks at Level 4. Train in the fog first.";

  async function refresh() {
    try {
      setErr(null);
      const p = await getProfile();
      setMe(p.id);
      setRisk(p.risk_state);
      setLevel(p.level ?? 1);

      const r = await getResources();
      setResources(r);

      const l = await listLegends(50);
      setLegends(l);
      if (!rivalId) {
        const first = l.find((x) => x.id !== p.id);
        if (first) setRivalId(first.id);
      }

      const a = await listMyActions(50);
      setActions(a);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load PvP.");
    }
  }

  useEffect(() => {
    refresh();
    // refresh timer for queued actions
    const id = window.setInterval(() => refresh(), 10_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rivals = useMemo(() => legends.filter((x) => x.id && x.id !== me), [legends, me]);

  async function run(kind: ActionKind) {
    try {
      if (!rivalId) return;
      setBusy(true);
      setErr(null);
      await queuePlayerAction(kind, rivalId);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell scene="pvp">
      <TopBar right={<ResourceBar resources={resources} riskLabel={risk} />} />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <SideNav pvpLocked={pvpLocked} pvpLockReason={pvpLockReason} />

          <div className="g-panel p-4">
            <div className="text-sm font-semibold">PvP Operations</div>
            <div className="mt-2 text-xs text-zinc-400">
              Async rival interactions. You spend Vigor now — the fog resolves the outcome later.
            </div>
            <button className="g-btn mt-3 w-full" onClick={() => refresh()} disabled={busy}>
              Refresh
            </button>
          </div>
        </div>

        <div className="lg:col-span-9">
          <div className="g-panel p-5">
            <div className="text-2xl font-semibold g-emboss">PvP Operations</div>
            <div className="mt-1 text-sm text-zinc-300">
              Begin with <span className="text-zinc-100">Scouting</span>. When ready, attempt a <span className="text-zinc-100">Challenge</span>.
              Reports will arrive in your Chronicle.
            </div>

            {pvpLocked ? (
              <div className="mt-4 g-panel p-4 border border-zinc-800/60 bg-zinc-950/40 text-zinc-300">
                <div className="font-semibold">Locked</div>
                <div className="mt-1 text-sm text-zinc-400">{pvpLockReason}</div>
              </div>
            ) : null}

            {err ? <div className="mt-3 text-sm text-red-300">{err}</div> : null}

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 g-panel p-4 border border-zinc-800/60 bg-zinc-950/30">
                <div className="text-sm font-semibold">Choose a Rival</div>
                <select
                  className="mt-2 w-full bg-zinc-950/60 border border-zinc-800/70 rounded-lg px-3 py-2 text-sm"
                  value={rivalId}
                  onChange={(e) => setRivalId(e.target.value)}
                  disabled={pvpLocked || busy || rivals.length === 0}
                >
                  {rivals.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.username} — Tier {r.domain_tier ?? 1} — Gold {(r.gold ?? 0).toLocaleString()}
                    </option>
                  ))}
                </select>

                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  <button
                    className="g-btn flex-1"
                    onClick={() => run("STALK_RIVAL")}
                    disabled={pvpLocked || busy || !rivalId || resources.vigor < ACTIONS.STALK_RIVAL.vigor_cost}
                    title={`Cost: ${ACTIONS.STALK_RIVAL.vigor_cost} Vigor`}
                  >
                    Scout Rival ({ACTIONS.STALK_RIVAL.vigor_cost} Vigor)
                  </button>
                  <button
                    className="g-btn flex-1"
                    onClick={() => run("BREACH_DOMAIN")}
                    disabled={pvpLocked || busy || !rivalId || resources.vigor < ACTIONS.BREACH_DOMAIN.vigor_cost}
                    title={`Cost: ${ACTIONS.BREACH_DOMAIN.vigor_cost} Vigor`}
                  >
                    Challenge Rival ({ACTIONS.BREACH_DOMAIN.vigor_cost} Vigor)
                  </button>
                </div>

                <div className="mt-3 text-xs text-zinc-400">
                  Scouting increases your exposure. Challenges carry heavier consequences — but never wipe you.
                </div>
              </div>

              <div className="g-panel p-4 border border-zinc-800/60 bg-zinc-950/30">
                <div className="text-sm font-semibold">Your Status</div>
                <div className="mt-2 text-sm text-zinc-200 space-y-1">
                  <div><span className="text-zinc-400">Level:</span> {level}</div>
                  <div><span className="text-zinc-400">Risk:</span> {risk}</div>
                  <div><span className="text-zinc-400">Vigor:</span> {resources.vigor}/{resources.vigor_cap}</div>
                </div>
              </div>
            </div>

            <div className="mt-5 g-panel p-4 border border-zinc-800/60 bg-zinc-950/30">
              <div className="text-sm font-semibold">Recent Operations</div>
              <div className="mt-2 text-xs text-zinc-400">
                Queued operations resolve automatically. Results arrive as Chronicle reports.
              </div>

              <div className="mt-3 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-zinc-400 border-b border-zinc-800/60">
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Resolves</th>
                      <th className="py-2 pr-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions.map((a: any) => (
                      <tr key={a.id} className="border-b border-zinc-900/60">
                        <td className="py-2 pr-3">{ACTIONS[a.kind as ActionKind]?.label ?? a.kind}</td>
                        <td className="py-2 pr-3">
                          <span className="g-pill">{a.status}</span>
                        </td>
                        <td className="py-2 pr-3">{remainingLabel(String(a.resolves_at), String(a.status))}</td>
                        <td className="py-2 pr-3 text-zinc-400">{new Date(String(a.created_at)).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {actions.length === 0 ? <div className="mt-3 text-sm text-zinc-400">No operations yet.</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
