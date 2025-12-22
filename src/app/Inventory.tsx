import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import ResourceBar from "../components/ResourceBar";
import { getProfile, getResources, getInventory, sellInventoryItem } from "../systems/data";
import type { InventoryState } from "../types";

export default function Inventory() {
  const [resources, setResources] = useState({ gold: 0, xp: 0, vigor: 0, vigor_cap: 10, vigor_regen_minutes: 15 });
  const [risk, setRisk] = useState("Protected");
  const [inv, setInv] = useState<InventoryState>({ player_id: "offline-player", max_slots: 30, items: [] });
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const p = await getProfile();
    setRisk(p.risk_state);
    const r = await getResources();
    setResources(r);
    const i = await getInventory();
    setInv(i);
  }

  useEffect(() => {
    refresh().catch((e) => setErr(String((e as any)?.message || e)));
  }, []);

  const used = inv.items.length;
  const remaining = Math.max(0, (inv.max_slots || 30) - used);

  const byRarity = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of inv.items) map[it.rarity] = (map[it.rarity] || 0) + 1;
    return map;
  }, [inv.items]);

  return (
    <PageShell scene="inventory">
      <TopBar right={<ResourceBar resources={resources} riskLabel={risk} />} />
      <div className="mt-4 g-panel p-6">
        <div className="text-2xl font-semibold g-emboss">Inventory</div>
        <div className="mt-2 text-zinc-300 text-sm">
          Slots: <span className="text-zinc-100">{used}</span> / <span className="text-zinc-100">{inv.max_slots || 30}</span>
          <span className="mx-2 text-zinc-500">•</span>
          Free: <span className="text-zinc-100">{remaining}</span>
        </div>

        {err ? <div className="mt-3 text-red-300 text-sm">{err}</div> : null}

        <div className="mt-3 text-xs text-zinc-400">
          {Object.keys(byRarity).length ? (
            <span>
              {Object.entries(byRarity)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" • ")}
            </span>
          ) : (
            <span>No items yet. Offline Adventures can roll items.</span>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {inv.items.map((it) => (
            <div key={it.id} className="flex items-center justify-between rounded-md border border-zinc-700/40 bg-black/20 px-3 py-2">
              <div>
                <div className="text-sm font-medium text-zinc-100">
                  {it.name} <span className="text-xs text-zinc-400">({it.rarity})</span>
                </div>
                <div className="text-xs text-zinc-400">Value: {it.value} gold</div>
              </div>
              <button
                className="g-btn text-sm"
                onClick={async () => {
                  try {
                    setErr(null);
                    await sellInventoryItem(it.id);
                    await refresh();
                  } catch (e) {
                    setErr(String((e as any)?.message || e));
                  }
                }}
              >
                Sell
              </button>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
