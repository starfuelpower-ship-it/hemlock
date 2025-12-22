import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import ResourceBar from "../components/ResourceBar";
import ScreenFrame from "../components/ScreenFrame";
import HxTooltip from "../components/HxTooltip";
import { artpack } from "../lib/artpack";
import { getProfile, getResources, getInventory, sellInventoryItem } from "../systems/data";
import type { InventoryState, Item } from "../types";

type SlotRect = { left: number; top: number; width: number; height: number; kind: "side" | "grid" };

/**
 * Slot coordinates are measured against the inventory frame image (1536×1024).
 * ScreenFrame preserves aspect ratio (3/2) + object-contain so these map reliably.
 */
const SLOT_RECTS: SlotRect[] = (() => {
  const W = 1536;
  const H = 1024;

  const toPct = (x: number, y: number, w: number, h: number, kind: SlotRect["kind"]): SlotRect => ({
    left: (x / W) * 100,
    top: (y / H) * 100,
    width: (w / W) * 100,
    height: (h / H) * 100,
    kind,
  });

  // Left side column (4 slots)
  const sideX1 = 264, sideX2 = 378;
  const sideYs = [232, 341, 483, 605, 714]; // 4 slots
  const side: SlotRect[] = [];
  for (let i = 0; i < 4; i++) {
    side.push(toPct(sideX1, sideYs[i], sideX2 - sideX1, sideYs[i + 1] - sideYs[i], "side"));
  }

  // Main grid (6 cols × 4 rows = 24 slots)
  const xLines = [605, 732, 858, 985, 1111, 1209, 1334]; // 7 lines → 6 columns
  const yLines = [232, 355, 455, 583, 710]; // 5 lines → 4 rows
  const grid: SlotRect[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      grid.push(toPct(xLines[c], yLines[r], xLines[c + 1] - xLines[c], yLines[r + 1] - yLines[r], "grid"));
    }
  }

  return [...side, ...grid]; // 28 visible slots in this frame
})();

function rarityTag(r: Item["rarity"]) {
  switch (r) {
    case "Epic":
      return "Epic";
    case "Rare":
      return "Rare";
    case "Uncommon":
      return "Uncommon";
    default:
      return "Common";
  }
}

function shortLabel(name: string) {
  const clean = (name || "").trim();
  if (!clean) return "";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function Inventory() {
  const [resources, setResources] = useState({ gold: 0, xp: 0, vigor: 0, vigor_cap: 10, vigor_regen_minutes: 15 });
  const [risk, setRisk] = useState("Protected");
  const [inv, setInv] = useState<InventoryState>({ player_id: "offline-player", max_slots: 30, items: [] });
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function refresh() {
    const [p, r, i] = await Promise.all([getProfile(), getResources(), getInventory()]);
    setResources(r);
    setRisk(p.risk_state);
    setInv(i);
    setErr(null);

    // Keep selection valid
    if (selectedId && !i.items.find((x) => x.id === selectedId)) setSelectedId(null);
  }

  useEffect(() => {
    refresh().catch((e) => setErr(String((e as any)?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleSlots = SLOT_RECTS.length;
  const items = inv.items ?? [];
  const visibleItems = items.slice(0, visibleSlots);
  const overflow = Math.max(0, items.length - visibleItems.length);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return items.find((x) => x.id === selectedId) ?? null;
  }, [items, selectedId]);

  const used = items.length;
  const remaining = Math.max(0, (inv.max_slots || 30) - used);

  const byRarity = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of items) map[it.rarity] = (map[it.rarity] || 0) + 1;
    return map;
  }, [items]);

  return (
    <PageShell scene="inventory">
      <TopBar right={<ResourceBar resources={resources} riskLabel={risk} />} />

      <div className="mt-4 flex justify-center">
        <ScreenFrame src={artpack.screens.inventory}>
          {/* All coordinates are percentage-based over the frame */}
          <div className="absolute inset-0">
            {/* Clickable slots */}
            {SLOT_RECTS.map((rect, idx) => {
              const it = visibleItems[idx] ?? null;
              const isSelected = !!it && it.id === selectedId;

              const tooltip = it ? (
                <div className="space-y-1">
                  <div className="font-semibold text-zinc-100">{it.name}</div>
                  <div className="text-[11px] text-zinc-200/90">
                    {rarityTag(it.rarity)} • Value {it.value}
                  </div>
                  {it.obtained_from ? <div className="text-[11px] text-zinc-300/80">From: {it.obtained_from}</div> : null}
                  <div className="text-[11px] text-zinc-400/80">Click to inspect</div>
                </div>
              ) : (
                <div className="text-[11px] text-zinc-300/80">Empty slot</div>
              );

              return (
                <HxTooltip key={idx} content={tooltip} className="absolute">
                  <button
                    type="button"
                    aria-label={it ? `Item: ${it.name}` : "Empty slot"}
                    onClick={() => setSelectedId(it ? it.id : null)}
                    className={[
                      "absolute rounded-md",
                      "focus:outline-none focus:ring-2 focus:ring-violet-400/70",
                      isSelected ? "ring-2 ring-violet-400/60" : "hover:ring-1 hover:ring-violet-300/40",
                    ].join(" ")}
                    style={{
                      left: `${rect.left}%`,
                      top: `${rect.top}%`,
                      width: `${rect.width}%`,
                      height: `${rect.height}%`,
                      // pull slightly inward so ring doesn't clip on the frame borders
                      inset: "1%",
                      background: "transparent",
                    }}
                  >
                    {/* Minimal in-slot mark (no new art): a short label that reads like a rune stamp */}
                    {it ? (
                      <span className="pointer-events-none absolute inset-0 grid place-items-center">
                        <span className="select-none text-[11px] tracking-[0.18em] text-zinc-200/80 drop-shadow">
                          {shortLabel(it.name)}
                        </span>
                      </span>
                    ) : null}
                  </button>
                </HxTooltip>
              );
            })}

            {/* Inspect panel (sits in the empty left-mid area of the frame) */}
            <div
              className="absolute"
              style={{
                left: "6.5%",
                top: "22%",
                width: "34%",
                height: "44%",
              }}
            >
              <div className="h-full w-full rounded-xl bg-black/25 border border-zinc-700/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">Inspect</div>
                    <div className="mt-1 text-xs text-zinc-300/80">
                      Slots: <span className="text-zinc-100">{used}</span> / <span className="text-zinc-100">{inv.max_slots || 30}</span>
                      <span className="mx-2 text-zinc-500">•</span>
                      Free: <span className="text-zinc-100">{remaining}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    {err ? <div className="text-red-300 text-xs">{err}</div> : null}
                    <div className="mt-1 text-[11px] text-zinc-400">
                      {Object.keys(byRarity).length ? (
                        <span>{Object.entries(byRarity).map(([k, v]) => `${k}: ${v}`).join(" • ")}</span>
                      ) : (
                        <span>No items yet</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  {selected ? (
                    <div className="space-y-3">
                      <div>
                        <div className="text-base font-semibold text-zinc-100">{selected.name}</div>
                        <div className="mt-1 text-xs text-zinc-200/90">
                          {rarityTag(selected.rarity)} • Value {selected.value}
                        </div>
                        {selected.obtained_from ? (
                          <div className="mt-2 text-xs text-zinc-300/80">Obtained from: {selected.obtained_from}</div>
                        ) : null}
                        {selected.obtained_at ? (
                          <div className="mt-1 text-[11px] text-zinc-400/80">Time: {new Date(selected.obtained_at).toLocaleString()}</div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          className="hx-btn text-sm"
                          onClick={async () => {
                            try {
                              setErr(null);
                              await sellInventoryItem(selected.id);
                              await refresh();
                            } catch (e) {
                              setErr(String((e as any)?.message || e));
                            }
                          }}
                        >
                          Sell
                        </button>
                        <button className="hx-btn text-sm bg-transparent border-zinc-700/40 hover:border-purple-400/40" onClick={() => setSelectedId(null)}>
                          Close
                        </button>
                      </div>

                      {overflow ? (
                        <div className="pt-2 text-[11px] text-zinc-400/80">
                          Overflow: {overflow} item{overflow === 1 ? "" : "s"} (not shown in the frame)
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-200/90">
                      Select a slot to inspect an item.
                      <div className="mt-2 text-xs text-zinc-400/80">
                        Tip: Offline Adventures can return with items. This screen is now asset-first: the frame is authoritative, the UI is layered.
                      </div>
                      {overflow ? (
                        <div className="mt-3 text-[11px] text-zinc-400/80">
                          Overflow: {overflow} item{overflow === 1 ? "" : "s"} (not shown in the frame)
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom tab row (frame implies tabs; we implement as real, even if they route later) */}
            <div className="absolute" style={{ left: "8%", top: "84%", width: "84%", height: "9%" }}>
              <div className="h-full w-full flex items-end gap-2">
                <button type="button" className="hx-btn text-sm px-4 py-2" aria-current="page">
                  Inventory
                </button>
                <button type="button" className="hx-btn text-sm px-4 py-2" onClick={() => (window.location.href = "/equipment")}>
                  Equipment
                </button>
                <button type="button" className="hx-btn text-sm px-4 py-2" onClick={() => (window.location.href = "/quests")}>
                  Quest Items
                </button>
                <button type="button" className="hx-btn text-sm px-4 py-2" onClick={() => (window.location.href = "/crafting")}>
                  Crafting
                </button>
              </div>
            </div>
          </div>
        </ScreenFrame>
      </div>
    </PageShell>
  );
}
