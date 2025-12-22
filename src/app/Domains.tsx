import { useEffect, useState } from "react";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import ResourceBar from "../components/ResourceBar";
import { getProfile, getResources, collectDomainGold } from "../systems/data";
import { getMyDomain, domainUpgradeCost, upgradeMyDomain } from "../systems/domains";

export default function Domains() {
  const [resources, setResources] = useState({ gold: 0, vigor: 0, vigor_cap: 10, vigor_regen_minutes: 15 });
  const [risk, setRisk] = useState("Protected");
  const [domain, setDomain] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setError(null);
      const p = await getProfile();
      setRisk(p.risk_state);
      const r = await getResources();
      setResources(r);
      const d = await getMyDomain();
      setDomain(d);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load Domain.");
    }
  }

  useEffect(() => { refresh(); }, []);

  async function onCollect() {
    setBusy(true);
    setError(null);
    try {
      const r = await collectDomainGold();
      await refresh();
      if (r.amount <= 0) setError("Your vault is empty.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to collect from the vault.");
    } finally {
      setBusy(false);
    }
  }

  async function onUpgrade() {
    setBusy(true);
    setError(null);
    try {
      await upgradeMyDomain();
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Upgrade failed.");
    } finally {
      setBusy(false);
    }
  }

  const cost = domain ? domainUpgradeCost(domain.tier) : 0;

  return (
    <PageShell>
      <TopBar right={<ResourceBar resources={resources} riskLabel={risk} />} />
      <div className="mt-4 g-panel p-6">
        <div className="text-2xl font-semibold g-emboss">Domains</div>
        <div className="mt-2 text-zinc-300">
          Your Domain is a hidden, subterranean refuge. Upgrades are small, permanent, and never pay-to-win.
        </div>

        {error && <div className="mt-4 text-red-300">{error}</div>}

        {domain && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="g-panel p-4">
              <div className="text-lg font-semibold">Domain Core</div>
              <div className="mt-2 text-sm text-zinc-300">Tier: <span className="text-zinc-100">{domain.tier}</span></div>
              <div className="mt-1 text-sm text-zinc-300">Defense: <span className="text-zinc-100">{domain.defensive_rating}</span></div>
              <div className="mt-1 text-sm text-zinc-300">Protection: <span className="text-zinc-100">{domain.protection_state}</span></div>
              <div className="mt-1 text-sm text-zinc-300">Income: <span className="text-zinc-100">{domain.income_per_hour ?? "—"}</span> <span className="text-zinc-400">/ hour</span></div>
              <div className="mt-1 text-sm text-zinc-300">Vault: <span className="text-zinc-100">{domain.stored_gold}</span> <span className="text-zinc-400">gold</span></div>
            </div>

            <div className="g-panel p-4">
              <div className="text-lg font-semibold">Operations</div>

              <button className="mt-3 g-btn" disabled={busy} onClick={onCollect} type="button">
                {busy ? "Collecting…" : "Collect Vault"}
              </button>
              <div className="mt-2 text-xs text-zinc-400">Transfers vault gold into your purse and records a Chronicle entry.</div>

              <div className="mt-4 text-sm text-zinc-300">Upgrade Cost: <span className="text-zinc-100">{cost}</span> gold</div>
              <div className="mt-1 text-sm text-zinc-300">Effect: +10 Defense (small, permanent)</div>
              <button className="mt-3 g-btn" disabled={busy} onClick={onUpgrade} type="button">
                {busy ? "Upgrading…" : "Upgrade Domain"}
              </button>

              <div className="mt-2 text-xs text-zinc-400">
                Domains will gain deeper systems later; for now this is an early foundation step.
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
