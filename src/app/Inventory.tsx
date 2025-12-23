import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import ResourceBar from "../components/ResourceBar";
import ScreenFrame from "../components/ScreenFrame";
import { artpack } from "../lib/artpack";
import { getProfile, getResources, getInventory } from "../systems/data";
import type { InventoryState, Item } from "../types";

type DragPayload = { from: number; itemId: string };

const STORAGE_KEY = (playerId: string) => `hemlock.inventory.layout.v1.${playerId}`;

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function buildSlots(inv: InventoryState, savedOrder: (string | null)[] | null): (Item | null)[] {
  const itemsById = new Map(inv.items.map((it) => [it.id, it]));
  const slots: (Item | null)[] = Array.from({ length: inv.max_slots || 30 }, () => null);

  // Apply saved layout first
  if (savedOrder && Array.isArray(savedOrder)) {
    for (let i = 0; i < Math.min(savedOrder.length, slots.length); i++) {
      const id = savedOrder[i];
      if (!id) continue;
      const it = itemsById.get(id);
      if (it) {
        slots[i] = it;
        itemsById.delete(id);
      }
    }
  }

  // Fill remaining slots in a stable order
  const remaining = Array.from(itemsById.values());
  let cursor = 0;
  for (let i = 0; i < slots.length && cursor < remaining.length; i++) {
    if (slots[i]) continue;
    slots[i] = remaining[cursor++];
  }

  return slots;
}

function serializeSlots(slots: (Item | null)[]): (string | null)[] {
  return slots.map((s) => (s ? s.id : null));
}

export default function Inventory() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState<any>(null);
  const [resources, setResources] = useState<any>(null);
  const [inv, setInv] = useState<InventoryState | null>(null);

  const [slots, setSlots] = useState<(Item | null)[]>([]);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const dragRef = useRef<DragPayload | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const p = await getProfile();
      const r = await getResources();
      const i = await getInventory();
      if (!mounted) return;
      setProfile(p);
      setResources(r);
      setInv(i);

      const saved = safeParse<(string | null)[]>(localStorage.getItem(STORAGE_KEY(p?.id || "anon")));
      const built = buildSlots(i, saved);
      setSlots(built);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!profile?.id || !inv) return;
    localStorage.setItem(STORAGE_KEY(profile.id), JSON.stringify(serializeSlots(slots)));
  }, [slots, profile?.id, inv]);

  const used = useMemo(() => slots.filter(Boolean).length, [slots]);
  const capacity = inv?.max_slots ?? 30;

  const onDropTo = (to: number) => {
    const payload = dragRef.current;
    dragRef.current = null;
    setHoverIndex(null);
    if (!payload) return;

    setSlots((prev) => {
      const next = [...prev];
      const from = payload.from;
      if (from === to) return prev;

      const a = next[from];
      const b = next[to];

      // Move if target empty, otherwise swap
      next[to] = a;
      next[from] = b ?? null;
      return next;
    });
  };

  return (
    <PageShell scene="inventory">
      <TopBar right={<ResourceBar resources={resources} riskLabel={profile?.risk_state} />} />

      <div className="mt-4 flex justify-center">
        <ScreenFrame src={artpack.screens.inventory}>
          <div className="absolute inset-0">
            {/* Close */}
            <button
              type="button"
              aria-label="Close"
              onClick={() => navigate("/profile")}
              style={{ left: "90.6%", top: "11.7%", width: "3.2%", height: "4.8%" }}
              className="absolute grid place-items-center rounded-md bg-black/20 border border-zinc-700/40 text-zinc-100 hover:bg-black/30 focus:outline-none focus:ring-2 focus:ring-violet-400/70"
            >
              <span className="text-lg leading-none">×</span>
            </button>

            {/* Inventory grid area (matches the frame's right-side grid zone) */}
            <div
              className="absolute"
              style={{
                left: "44%",
                top: "22.2%",
                width: "49%",
                height: "61%",
              }}
            >
              <div className="hx-inv-grid">
                {Array.from({ length: capacity }).map((_, idx) => {
                  const item = slots[idx] ?? null;
                  const isHover = hoverIndex === idx;
                  const isOccupied = !!item;

                  return (
                    <div
                      key={idx}
                      className={[
                        "hx-slot",
                        isHover ? "hx-slot--hover" : "",
                        isOccupied ? "hx-slot--occupied" : "",
                      ].join(" ")}
                      onMouseEnter={() => setHoverIndex(idx)}
                      onMouseLeave={() => setHoverIndex((h) => (h === idx ? null : h))}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (hoverIndex !== idx) setHoverIndex(idx);
                      }}
                      onDrop={() => onDropTo(idx)}
                    >
                      <img
                        src={artpack.frames.itemSlot}
                        alt=""
                        draggable={false}
                        className="hx-slot__frame"
                      />

                      {item && (
                        <div
                          className="hx-item"
                          draggable
                          onDragStart={(e) => {
                            dragRef.current = { from: idx, itemId: item.id };
                            e.dataTransfer.effectAllowed = "move";
                            // required for Firefox
                            e.dataTransfer.setData("text/plain", item.id);
                          }}
                          onDragEnd={() => {
                            dragRef.current = null;
                            setHoverIndex(null);
                          }}
                          title={item.name}
                        >
                          {/* Minimal placeholder glyph until item icons are integrated */}
                          <div className="hx-item__glyph">{item.name.slice(0, 1).toUpperCase()}</div>

                          {/* Visual-only stack count (uses value as stand-in if > 1 is needed later) */}
                          {(item as any).stack_count > 1 && (
                            <div className="hx-stack">{(item as any).stack_count}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Capacity hint (minimal) */}
            <div
              className="absolute text-[11px] text-zinc-300/80"
              style={{ left: "44%", top: "84%", width: "49%", textAlign: "right" as const }}
            >
              {used}/{capacity}
            </div>
          </div>
        </ScreenFrame>
      </div>
    </PageShell>
  );
}
