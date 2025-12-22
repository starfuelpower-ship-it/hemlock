import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import ResourceBar from "../components/ResourceBar";
import { getProfile, getResources } from "../systems/data";
import { COURT_PROJECT_TEMPLATES } from "../systems/economyConfig";
import {
  createClan,
  depositToTreasury,
  getMyClan,
  joinClan,
  leaveClan,
  listClans,
  listCourtProjects,
  createCourtProject,
  fundProjectFromTreasury,
  setClanTaxPct,
} from "../systems/clans";
import type { Clan, CourtProject } from "../types";

function pctLabel(p: number) {
  return `${Math.round(p * 100)}%`;
}

export default function Court() {
  const [resources, setResources] = useState({ gold: 0, xp: 0, vigor: 0, vigor_cap: 10, vigor_regen_minutes: 15 });
  const [risk, setRisk] = useState("Protected");

  const [myClan, setMyClan] = useState<{ clan: Clan; membership: any } | null>(null);
  const [clans, setClans] = useState<Clan[]>([]);
  const [projects, setProjects] = useState<CourtProject[]>([]);
  const [createName, setCreateName] = useState("");
  const [depositAmt, setDepositAmt] = useState(50);
  const [fundAmt, setFundAmt] = useState(200);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isLeader = useMemo(() => {
    if (!myClan) return false;
    return myClan.membership?.role === "LEADER" || myClan.membership?.role === "OFFICER";
  }, [myClan]);

  async function refresh() {
    const p = await getProfile();
    setRisk(p.risk_state);
    setResources(await getResources());

    const ctx = await getMyClan();
    setMyClan(ctx);

    const all = await listClans(25);
    setClans(all);

    if (ctx) {
      setProjects(await listCourtProjects(ctx.clan.id, 25));
    } else {
      setProjects([]);
    }
  }

  useEffect(() => {
    (async () => {
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run<T>(fn: () => Promise<T>) {
    setErr(null);
    setBusy(true);
    try {
      const out = await fn();
      await refresh();
      return out;
    } catch (e: any) {
      setErr(e?.message || "ERROR");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell scene="court">
      <TopBar right={<ResourceBar resources={resources} riskLabel={risk} />} />

      <div className="mt-4 g-panel p-6">
        <div className="text-2xl font-semibold g-emboss">Guild</div>
        <div className="mt-2 text-zinc-300">Treasury, deposits, and court projects (economy sinks). No visuals in this pass.</div>

        {err ? <div className="mt-4 text-red-300">{err}</div> : null}

        {!myClan ? (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="g-panel p-4">
              <div className="font-semibold">Create a Guild</div>
              <div className="mt-2 flex gap-2">
                <input
                  className="w-full rounded bg-black/30 px-3 py-2 outline-none"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Guild name"
                  disabled={busy}
                />
                <button className="g-btn px-4 py-2" disabled={busy} onClick={() => run(() => createClan(createName))}>
                  Create
                </button>
              </div>
              <div className="mt-2 text-xs text-zinc-400">Name length: 3–24 characters.</div>
            </div>

            <div className="g-panel p-4">
              <div className="font-semibold">Join a Guild</div>
              <div className="mt-3 grid gap-2">
                {clans.length === 0 ? <div className="text-zinc-400">No courts yet.</div> : null}
                {clans.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded bg-black/20 px-3 py-2">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-zinc-400">Treasury: {c.treasury_gold}g • Tax: {pctLabel(c.tax_pct)}</div>
                    </div>
                    <button className="g-btn px-3 py-1.5" disabled={busy} onClick={() => run(() => joinClan(c.id))}>
                      Join
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="g-panel p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{myClan.clan.name}</div>
                  <div className="text-xs text-zinc-400">
                    Treasury: {myClan.clan.treasury_gold}g • Tax: {pctLabel(myClan.clan.tax_pct)}
                  </div>
                </div>
                <button className="g-btn px-3 py-1.5" disabled={busy} onClick={() => run(() => leaveClan())}>
                  Leave
                </button>
              </div>

              <div className="mt-4">
                <div className="text-sm font-medium">Deposit Gold</div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="number"
                    className="w-28 rounded bg-black/30 px-3 py-2 outline-none"
                    value={depositAmt}
                    onChange={(e) => setDepositAmt(Number(e.target.value))}
                    min={1}
                    disabled={busy}
                  />
                  <button className="g-btn px-4 py-2" disabled={busy} onClick={() => run(() => depositToTreasury(depositAmt))}>
                    Deposit
                  </button>
                </div>
                <div className="mt-2 text-xs text-zinc-400">Deposits move gold from you → treasury (audited by receipts).</div>
              </div>

              {isLeader ? (
                <div className="mt-5">
                  <div className="text-sm font-medium">Tax (0–10%)</div>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={10}
                      value={Math.round(myClan.clan.tax_pct * 100)}
                      onChange={(e) => run(() => setClanTaxPct(myClan.clan.id, Number(e.target.value) / 100))}
                      disabled={busy}
                    />
                    <div className="text-sm">{pctLabel(myClan.clan.tax_pct)}</div>
                  </div>
                  <div className="mt-2 text-xs text-zinc-400">Stored for later redistribution rules. No combat impact.</div>
                </div>
              ) : null}
            </div>

            <div className="g-panel p-4">
              <div className="font-semibold">Guild Projects (Treasury Sinks)</div>
              <div className="mt-2 text-sm text-zinc-400">Projects burn treasury gold into long-term progress (no power spikes).</div>

              {isLeader ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {COURT_PROJECT_TEMPLATES.map((t) => (
                    <button
                      key={t.key}
                      className="g-btn px-3 py-1.5"
                      disabled={busy}
                      onClick={() => run(() => createCourtProject(myClan.clan.id, t.key))}
                    >
                      Start: {t.title} ({t.goal_gold}g)
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 grid gap-2">
                {projects.length === 0 ? <div className="text-zinc-400">No projects yet.</div> : null}
                {projects.map((p) => (
                  <div key={p.id} className="rounded bg-black/20 p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{p.title}</div>
                      <div className="text-xs text-zinc-400">{p.status}</div>
                    </div>
                    <div className="mt-1 text-xs text-zinc-400">
                      Funded: {p.funded_gold} / {p.goal_gold}g
                    </div>

                    {isLeader && p.status === "ACTIVE" ? (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="number"
                          className="w-28 rounded bg-black/30 px-3 py-2 outline-none"
                          value={fundAmt}
                          onChange={(e) => setFundAmt(Number(e.target.value))}
                          min={1}
                          disabled={busy}
                        />
                        <button className="g-btn px-4 py-2" disabled={busy} onClick={() => run(() => fundProjectFromTreasury(p.id, fundAmt))}>
                          Fund
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
