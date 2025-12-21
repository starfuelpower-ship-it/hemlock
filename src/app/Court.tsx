import { useEffect, useState } from "react";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import ResourceBar from "../components/ResourceBar";
import { getProfile, getResources } from "../systems/data";

export default function Court() {
  const [resources, setResources] = useState({ gold: 0, vigor: 0, vigor_cap: 10, vigor_regen_minutes: 15 });
  const [risk, setRisk] = useState("Protected");

  useEffect(() => {
    (async () => {
      const p = await getProfile();
      setRisk(p.risk_state);
      const r = await getResources();
      setResources(r);
    })();
  }, []);

  return (
    <PageShell>
      <TopBar right={<ResourceBar resources={resources} riskLabel={risk} />} />
      <div className="mt-4 g-panel p-6">
        <div className="text-2xl font-semibold g-emboss">Court</div>
        <div className="mt-2 text-zinc-300">Court placeholder. Politics, votes, districts, influence.</div>
      </div>
    </PageShell>
  );
}
