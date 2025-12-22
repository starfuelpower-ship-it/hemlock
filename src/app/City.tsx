import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import SideNav from "../components/SideNav";
import ResourceBar from "../components/ResourceBar";
import ReportPanel from "../components/ReportPanel";
import { getProfile, getResources, listReports, collectDomainGold } from "../systems/data";
import { getMyDomain, domainUpgradeCost } from "../systems/domains";
import { unreadCount, sortReportsNewestFirst } from "../systems/reports";
import { Report } from "../types";

type Obj = {
  title: string;
  body: string;
  ctaLabel: string;
  ctaTo?: string;
  ctaAction?: () => Promise<void>;
};

function advisorLine(risk: string, objectiveTitle: string) {
  if (risk === "UnderRaid") return `The wards are screaming. Ignore everything else — survive.`;
  if (risk === "Vulnerable") return `Eyes linger on your doorstep. Move with intent, keep your gold close.`;
  if (risk === "Scouted") return `Someone has tasted your trail. Do not grow comfortable.`;
  // Protected
  if (objectiveTitle.toLowerCase().includes("reports")) return `Your Chronicle waits. Read it before you act.`;
  if (objectiveTitle.toLowerCase().includes("collect")) return `The vault has weight. Take it — but remember: hoards attract.`;
  if (objectiveTitle.toLowerCase().includes("vigor")) return `You still have blood to spend. Choose an operation.`;
  return `Quiet moments are rare. Use this one to strengthen your Domain.`;
}

export default function City() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [profileName, setProfileName] = useState("Unknown");
  const [level, setLevel] = useState(1);
  const [risk, setRisk] = useState("Protected");
  const [resources, setResources] = useState({ gold: 0, vigor: 0, vigor_cap: 10, vigor_regen_minutes: 15 });

  const [domainTier, setDomainTier] = useState(1);
  const [domainVault, setDomainVault] = useState(0);
  const [domainIncome, setDomainIncome] = useState(0);

  const [reports, setReports] = useState<Report[]>([]);

  const pvpLocked = level < 4;

  async function refresh() {
    setErr(null);
    const p = await getProfile();
    setProfileName(p.username || "Unknown");
    setLevel(p.level || 1);
    setRisk(p.risk_state || "Protected");

    const r = await getResources();
    setResources(r);

    try {
      const d = await getMyDomain();
      setDomainTier(d.tier || 1);
      setDomainVault(d.stored_gold || 0);
      setDomainIncome((d as any).income_per_hour ?? 0);
    } catch {
      // Domain system must never block city; fail gracefully.
      setDomainTier(1);
      setDomainVault(0);
      setDomainIncome(0);
    }

    try {
      const rr = await listReports(25);
      setReports(rr);
    } catch {
      setReports([]);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load the city.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unread = useMemo(() => unreadCount(reports), [reports]);
  const newest = useMemo(() => sortReportsNewestFirst(reports)[0] ?? null, [reports]);

  const objective: Obj = useMemo(() => {
    // 1) Reports first (story + clarity)
    if (unread > 0) {
      return {
        title: "Read your Chronicle Reports",
        body: `You have ${unread} unread report${unread === 1 ? "" : "s"}. Clarity comes before action.`,
        ctaLabel: "Open Reports",
        ctaTo: "/reports",
      };
    }

    // 2) Collect vault if available
    if (domainVault > 0) {
      return {
        title: "Collect Domain vault gold",
        body: `Your Domain has accumulated ${domainVault.toLocaleString()} gold in its vault.`,
        ctaLabel: "Collect Vault",
        ctaAction: async () => {
          setBusy(true);
          setErr(null);
          try {
            await collectDomainGold();
            await refresh();
          } catch (e: any) {
            setErr(e?.message ?? "Failed to collect vault gold.");
          } finally {
            setBusy(false);
          }
        },
      };
    }

    // 3) Spend vigor
    if (resources.vigor > 0) {
      return {
        title: "Spend Vigor on an Operation",
        body: "Choose a move. Every action leaves a trail — and a Chronicle.",
        ctaLabel: "Choose an Operation",
        ctaTo: "/home",
      };
    }

    // 4) Upgrade domain if affordable, otherwise wait
    const cost = domainUpgradeCost(domainTier);
    if (resources.gold >= cost) {
      return {
        title: "Upgrade your Domain",
        body: `A stronger Domain means steadier income and better resistance. Upgrade cost: ${cost.toLocaleString()} gold.`,
        ctaLabel: "Go to Domains",
        ctaTo: "/domains",
      };
    }

    return {
      title: "Recover and return",
      body: `Your vigor is empty. It regenerates every ${resources.vigor_regen_minutes} minutes. Rest — then strike.`,
      ctaLabel: "View Chronicle",
      ctaTo: "/chronicle",
    };
  }, [unread, domainVault, resources.vigor, resources.vigor_regen_minutes, resources.gold, domainTier]);

  const advisor = useMemo(() => advisorLine(risk, objective.title), [risk, objective.title]);

  return (
    <PageShell>
      <TopBar right={<ResourceBar resources={resources} riskLabel={risk} />} />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left */}
        <div className="lg:col-span-3">
          <SideNav pvpLocked={pvpLocked} pvpLockReason="Locked – Reach Level 4" />

          <div className="mt-4 g-panel p-3 text-xs text-zinc-300/90">
            <div className="font-semibold">City Status</div>
            <div className="mt-2 space-y-1">
              <div><span className="text-zinc-400">Player:</span> {profileName}</div>
              <div><span className="text-zinc-400">Level:</span> {level}</div>
              <div><span className="text-zinc-400">Risk:</span> {risk}</div>
              <div><span className="text-zinc-400">Unread Reports:</span> {unread}</div>
              <div><span className="text-zinc-400">Domain:</span> Tier {domainTier} {domainIncome ? `(Income ${domainIncome}/hr)` : ""}</div>
            </div>
          </div>

          <div className="mt-4 g-panel p-3 text-xs text-zinc-300/90">
            <div className="font-semibold">Protection State</div>
            <div className="mt-2 text-sm">
              {risk === "UnderRaid" && "Under Raid — defensive measures engaged. Expect loss if you ignore this."}
              {risk === "Vulnerable" && "Vulnerable — you can be targeted. Spend or secure gold, and strengthen defenses."}
              {risk === "Scouted" && "Scouted — someone has marked you. Stay light, avoid hoarding."}
              {risk === "Protected" && "Protected — low exposure. Use the moment to build, invest, and prepare."}
            </div>
            <div className="mt-3">
              <Link className="g-btn" to="/domains">View Domain</Link>
            </div>
          </div>
        </div>

        {/* Center */}
        <div className="lg:col-span-6 space-y-4">
          <div className="g-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold g-emboss">Current Objective</div>
                <div className="mt-2 text-sm text-zinc-200">{objective.title}</div>
                <div className="mt-1 text-sm text-zinc-300">{objective.body}</div>
              </div>

              <div className="shrink-0">
                {objective.ctaTo ? (
                  <button
                    className="g-btn-primary"
                    disabled={loading || busy}
                    onClick={() => nav(objective.ctaTo!)}
                  >
                    {objective.ctaLabel}
                  </button>
                ) : (
                  <button
                    className="g-btn-primary"
                    disabled={loading || busy}
                    onClick={() => objective.ctaAction?.()}
                  >
                    {busy ? "Working…" : objective.ctaLabel}
                  </button>
                )}
              </div>
            </div>

            {err && <div className="mt-3 text-sm text-red-300">{err}</div>}
          </div>

          <div className="g-panel p-4">
            <div className="text-sm font-semibold g-emboss">The Advisor</div>
            <div className="mt-2 text-sm text-zinc-200">{advisor}</div>
            <div className="mt-3 text-xs text-zinc-400">The City does not pause. It remembers.</div>
          </div>

          <div className="g-panel p-4">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold g-emboss">City Hotspots</div>
              <div className="text-xs text-zinc-400">World-centric hub (UI V1)</div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link className="g-panel p-4 hover:bg-zinc-900/50 transition block" to="/reports">
                <div className="font-semibold">Reports</div>
                <div className="mt-1 text-sm text-zinc-300">Your Chronicle inbox. Unread: {unread}.</div>
              </Link>

              <Link className="g-panel p-4 hover:bg-zinc-900/50 transition block" to="/domains">
                <div className="font-semibold">Domains</div>
                <div className="mt-1 text-sm text-zinc-300">Tier {domainTier}. Vault: {domainVault.toLocaleString()} gold.</div>
              </Link>

              <Link className="g-panel p-4 hover:bg-zinc-900/50 transition block" to="/home">
                <div className="font-semibold">Operations</div>
                <div className="mt-1 text-sm text-zinc-300">Spend Vigor to act. Actions become Chronicle.</div>
              </Link>

              <Link className="g-panel p-4 hover:bg-zinc-900/50 transition block" to="/inventory">
                <div className="font-semibold">Inventory</div>
                <div className="mt-1 text-sm text-zinc-300">Gear and artifacts (v1).</div>
              </Link>

              <Link className="g-panel p-4 hover:bg-zinc-900/50 transition block" to="/chronicle">
                <div className="font-semibold">Chronicle</div>
                <div className="mt-1 text-sm text-zinc-300">Long-form narrative arc delivery (v1).</div>
              </Link>

              <Link className="g-panel p-4 hover:bg-zinc-900/50 transition block" to="/legends">
                <div className="font-semibold">Legends</div>
                <div className="mt-1 text-sm text-zinc-300">Individuals, Courts, Domains (scaffold).</div>
              </Link>

              <Link className="g-panel p-4 hover:bg-zinc-900/50 transition block" to="/court">
                <div className="font-semibold">Court</div>
                <div className="mt-1 text-sm text-zinc-300">Politics and faction systems (scaffold).</div>
              </Link>

              {pvpLocked ? (
                <div className="g-panel p-4 opacity-70">
                  <div className="font-semibold">PvP</div>
                  <div className="mt-1 text-sm text-zinc-300">Locked — reach Level 4 to enter.</div>
                </div>
              ) : (
                <Link className="g-panel p-4 hover:bg-zinc-900/50 transition block" to="/pvp">
                  <div className="font-semibold">PvP</div>
                  <div className="mt-1 text-sm text-zinc-300">Async operations against rivals (v1).</div>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="lg:col-span-3 space-y-4">
          <ReportPanel
            title="Most Recent Chronicle"
            report={newest}
            onOpenReports={() => nav("/reports")}
          />

          <div className="g-panel p-4">
            <div className="text-sm font-semibold g-emboss">Future Hooks</div>
            <div className="mt-2 text-sm text-zinc-300 space-y-2">
              <div>• Domain income accrues over time. Check your vault when you return.</div>
              <div>• Vigor returns in pulses. Plan your next operation around it.</div>
              <div>• Higher risk states increase danger — and opportunity.</div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
