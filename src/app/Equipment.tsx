import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import ResourceBar from "../components/ResourceBar";
import ScreenFrame from "../components/ScreenFrame";
import HxTooltip from "../components/HxTooltip";
import { artpack } from "../lib/artpack";
import { getInventory, getProfile, getResources } from "../systems/data";
import type { InventoryState, Item } from "../types";

type EquipSlotKey =
  | "helmet"
  | "ring_left_1"
  | "ring_left_2"
  | "leg_armor"
  | "ring_right"
  | "amulet"
  | "gloves"
  | "belt";

type SlotRect = { key: EquipSlotKey; label: string; left: number; top: number; width: number; height: number };

type EquipmentState = Record<EquipSlotKey, string | null>; // item.id

const DEFAULT_EQUIPMENT: EquipmentState = {
  helmet: null,
  ring_left_1: null,
  ring_left_2: null,
  leg_armor: null,
  ring_right: null,
  amulet: null,
  gloves: null,
  belt: null,
};

/**
 * Slot coordinates are measured against the equipment frame image (1536×1024).
 * ScreenFrame preserves aspect ratio (3/2) + object-contain so these map reliably.
 *
 * If you ever regenerate the art, re-measure these boxes.
 */
const EQUIP_SLOTS: SlotRect[] = [
  // Left column
  { key: "helmet", label: "Helmet", left: 360, top: 255, width: 92, height: 92 },
  { key: "ring_left_1", label: "Ring", left: 360, top: 410, width: 92, height: 92 },
  { key: "ring_left_2", label: "Ring", left: 360, top: 560, width: 92, height: 92 },
  { key: "leg_armor", label: "Leg Armor", left: 360, top: 725, width: 92, height: 92 },

  // Right column
  { key: "ring_right", label: "Ring", left: 1080, top: 255, width: 92, height: 92 },
  { key: "amulet", label: "Amulet", left: 1080, top: 410, width: 92, height: 92 },
  { key: "gloves", label: "Gloves", left: 1080, top: 560, width: 92, height: 92 },
  { key: "belt", label: "Belt", left: 1080, top: 725, width: 92, height: 92 },
];

function storageKey(playerId: string | null | undefined) {
  return `hemlock_equipment_v1:${playerId || "offline"}`;
}

function loadEquipment(playerId: string | null | undefined): EquipmentState {
  try {
    const raw = localStorage.getItem(storageKey(playerId));
    if (!raw) return { ...DEFAULT_EQUIPMENT };
    const parsed = JSON.parse(raw) as Partial<EquipmentState>;
    return { ...DEFAULT_EQUIPMENT, ...parsed };
  } catch {
    return { ...DEFAULT_EQUIPMENT };
  }
}

function saveEquipment(playerId: string | null | undefined, eq: EquipmentState) {
  try {
    localStorage.setItem(storageKey(playerId), JSON.stringify(eq));
  } catch {
    // ignore
  }
}

function rarityGlow(rarity: Item["rarity"]) {
  switch (rarity) {
    case "Common":
      return "ring-1 ring-white/10";
    case "Uncommon":
      return "ring-1 ring-emerald-400/25";
    case "Rare":
      return "ring-1 ring-sky-400/25";
    case "Epic":
      return "ring-1 ring-fuchsia-400/25";
    default:
      return "ring-1 ring-white/10";
  }
}

export default function Equipment() {
  const [inventory, setInventory] = useState<InventoryState | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [resources, setResources] = useState<{ gold: number; xp: number } | null>(null);

  const [equipment, setEquipment] = useState<EquipmentState>(() => ({ ...DEFAULT_EQUIPMENT }));
  const [activeSlot, setActiveSlot] = useState<EquipSlotKey | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const p = await getProfile().catch(() => null);
      if (!cancelled) setProfileId(p?.id || null);

      const inv = await getInventory().catch(() => null);
      if (!cancelled) setInventory(inv);

      const res = await getResources().catch(() => null);
      if (!cancelled && res) setResources({ gold: res.gold, xp: res.xp });

      const eq = loadEquipment(p?.id || null);
      if (!cancelled) setEquipment(eq);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveEquipment(profileId, equipment);
  }, [profileId, equipment]);

  const invItems = inventory?.items || [];

  const equippedIds = useMemo(() => {
    const s = new Set<string>();
    (Object.values(equipment) as (string | null)[]).forEach((id) => {
      if (id) s.add(id);
    });
    return s;
  }, [equipment]);

  const availableItems = useMemo(() => {
    // For v1: let anything be equipped anywhere; later we can introduce item categories.
    return invItems.filter((it) => !equippedIds.has(it.id));
  }, [invItems, equippedIds]);

  const equippedItemBySlot = useMemo(() => {
    const map = new Map<EquipSlotKey, Item | null>();
    for (const slot of EQUIP_SLOTS) {
      const id = equipment[slot.key];
      map.set(slot.key, id ? invItems.find((it) => it.id === id) || null : null);
    }
    return map;
  }, [equipment, invItems]);

  const activeSlotRect = useMemo(() => EQUIP_SLOTS.find((s) => s.key === activeSlot) || null, [activeSlot]);

  function openChooser(slotKey: EquipSlotKey) {
    setActiveSlot(slotKey);
    setChooserOpen(true);
  }

  function equipToActive(item: Item) {
    if (!activeSlot) return;
    setEquipment((prev) => ({ ...prev, [activeSlot]: item.id }));
    setChooserOpen(false);
  }

  function unequip(slotKey: EquipSlotKey) {
    setEquipment((prev) => ({ ...prev, [slotKey]: null }));
  }

  return (
    <PageShell bg={artpack.backgrounds.game}>
      <TopBar />
      <ResourceBar gold={resources?.gold ?? 0} xp={resources?.xp ?? 0} />

      <div className="mx-auto w-full max-w-6xl px-4 pb-10">
        <ScreenFrame src={artpack.screens.equipment}>
          {/* Slot hitboxes */}
          {EQUIP_SLOTS.map((slot) => {
            const item = equippedItemBySlot.get(slot.key) || null;
            const isActive = activeSlot === slot.key && chooserOpen;

            return (
              <div
                key={slot.key}
                className="absolute"
                style={{
                  left: `${(slot.left / 1536) * 100}%`,
                  top: `${(slot.top / 1024) * 100}%`,
                  width: `${(slot.width / 1536) * 100}%`,
                  height: `${(slot.height / 1024) * 100}%`,
                }}
              >
                <HxTooltip
                  content={
                    item
                      ? `${slot.label}: ${item.name} • ${item.rarity} • Value ${item.value}`
                      : `${slot.label}: empty (click to equip)`
                  }
                >
                  <button
                    type="button"
                    className={[
                      "h-full w-full rounded-md",
                      "focus:outline-none focus:ring-2 focus:ring-fuchsia-300/60",
                      "transition",
                      item ? "bg-white/0" : "bg-white/0",
                      isActive ? "ring-2 ring-fuchsia-400/70" : "hover:ring-2 hover:ring-white/10",
                    ].join(" ")}
                    onClick={() => openChooser(slot.key)}
                    aria-label={`${slot.label} slot`}
                  />
                </HxTooltip>

                {/* equipped item badge */}
                {item && (
                  <button
                    type="button"
                    className={[
                      "absolute -bottom-2 left-1/2 -translate-x-1/2",
                      "px-2 py-1 text-[11px] rounded-md",
                      "bg-black/55 backdrop-blur-sm text-white/90",
                      rarityGlow(item.rarity),
                    ].join(" ")}
                    onClick={() => {
                      setActiveSlot(slot.key);
                      setChooserOpen(true);
                    }}
                    title="Click to change"
                  >
                    {item.name}
                  </button>
                )}
              </div>
            );
          })}

          {/* Bottom tabs (interactive) */}
          <div className="absolute bottom-[8.5%] left-1/2 -translate-x-1/2 flex gap-3">
            <button type="button" className="hx-btn text-sm px-4 py-2" onClick={() => (window.location.href = "/inventory")}>
              Inventory
            </button>
            <button type="button" className="hx-btn text-sm px-4 py-2" onClick={() => (window.location.href = "/equipment")}>
              Equipment
            </button>
            <button type="button" className="hx-btn text-sm px-4 py-2" onClick={() => (window.location.href = "/profile")}>
              Stats
            </button>
            <button type="button" className="hx-btn text-sm px-4 py-2" onClick={() => (window.location.href = "/chronicle")}>
              Skill Tree
            </button>
          </div>

          {/* Equipment chooser modal */}
          {chooserOpen && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="absolute inset-0 bg-black/55" onClick={() => setChooserOpen(false)} />
              <div className="relative w-full max-w-3xl rounded-2xl border border-white/10 bg-zinc-950/85 backdrop-blur-md shadow-[0_30px_120px_rgba(0,0,0,0.8)]">
                <div className="flex items-start justify-between gap-4 p-5 border-b border-white/10">
                  <div>
                    <div className="text-white/90 text-lg font-semibold">Equip Item</div>
                    <div className="text-white/50 text-sm">
                      {activeSlotRect ? `Slot: ${activeSlotRect.label}` : "Choose a slot"}
                    </div>
                  </div>
                  <button type="button" className="hx-btn px-3 py-2" onClick={() => setChooserOpen(false)}>
                    Close
                  </button>
                </div>

                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                    <div className="text-white/70 text-sm mb-3">Currently equipped</div>
                    {activeSlot ? (
                      (() => {
                        const it = equippedItemBySlot.get(activeSlot) || null;
                        if (!it)
                          return <div className="text-white/50 text-sm">Empty</div>;

                        return (
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-white/90 font-medium">{it.name}</div>
                              <div className="text-white/50 text-sm">{it.rarity} • Value {it.value}</div>
                            </div>
                            <button type="button" className="hx-btn px-3 py-2" onClick={() => unequip(activeSlot)}>
                              Unequip
                            </button>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="text-white/50 text-sm">Select a slot</div>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                    <div className="text-white/70 text-sm mb-3">Available items</div>
                    <div className="max-h-[340px] overflow-auto pr-1 space-y-2">
                      {availableItems.length === 0 ? (
                        <div className="text-white/50 text-sm">No unequipped items available.</div>
                      ) : (
                        availableItems.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            className={[
                              "w-full text-left rounded-xl border border-white/10",
                              "bg-black/20 hover:bg-black/35 transition p-3",
                              rarityGlow(it.rarity),
                            ].join(" ")}
                            onClick={() => equipToActive(it)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-white/90 font-medium">{it.name}</div>
                                <div className="text-white/50 text-sm">{it.rarity}</div>
                              </div>
                              <div className="text-white/70 text-sm">Value {it.value}</div>
                            </div>
                            {it.obtained_from && (
                              <div className="text-white/40 text-xs mt-1">From: {it.obtained_from}</div>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-5 border-t border-white/10 flex items-center justify-between gap-3">
                  <div className="text-white/50 text-sm">
                    Equipment is stored locally per account for now (no server dependencies).
                  </div>
                  <button type="button" className="hx-btn px-4 py-2" onClick={() => setChooserOpen(false)}>
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </ScreenFrame>
      </div>
    </PageShell>
  );
}
