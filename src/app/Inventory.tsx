import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import TopBar from "../components/TopBar";
import ResourceBar from "../components/ResourceBar";
import ScreenFrame from "../components/ScreenFrame";
import { artpack } from "../lib/artpack";
import {
  getProfile,
  getResources,
  getInventory,
  getVault,
  moveInventoryItemToVault,
  moveVaultItemToInventory,
  sellInventoryItem,
  sellVaultItem,
  depositGoldToVault,
  withdrawGoldFromVault,
} from "../systems/data";
import { getMyDomain } from "../systems/domains";
import type { InventoryState, VaultState, Item } from "../types";

type DragPayload = { from: number; itemId: string; fromBag: "inventory" | "vault" };

const STORAGE_KEY = (playerId: string) => `hemlock.inventory.layout.v1.${playerId}`;
const VAULT_STORAGE_KEY = (playerId: string) => `hemlock.vault.layout.v1.${playerId}`;

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function buildSlots(bag: { max_slots: number; items: Item[] }, savedOrder: (string | null)[] | null): (Item | null)[] {
  const itemsById = new Map(bag.items.map((it) => [it.id, it]));
  const slots: (Item | null)[] = Array.from({ length: bag.max_slots || 30 }, () => null);

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
  const [vault, setVault] = useState<VaultState | null>(null);
  const [domain, setDomain] = useState<any>(null);

  const [slots, setSlots] = useState<(Item | null)[]>([]);
  const [vaultSlots, setVaultSlots] = useState<(Item | null)[]>([]);
  const [hover, setHover] = useState<{ bag: "inventory" | "vault"; idx: number } | null>(null);

  const dragRef = useRef<DragPayload | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const p = await getProfile();
      const r = await getResources();
      const i = await getInventory();
      const v = await getVault();
      const d = await getMyDomain();
      if (!mounted) return;
      setProfile(p);
      setResources(r);
      setInv(i);
      setVault(v);
      setDomain(d);

      const saved = safeParse<(string | null)[]>(localStorage.getItem(STORAGE_KEY(p?.id || "anon")));
      const built = buildSlots(i, saved);
      setSlots(built);

      const savedVault = safeParse<(string | null)[]>(localStorage.getItem(VAULT_STORAGE_KEY(p?.id || "anon")));
      const builtVault = buildSlots(v, savedVault);
      setVaultSlots(builtVault);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!profile?.id || !inv) return;
    localStorage.setItem(STORAGE_KEY(profile.id), JSON.stringify(serializeSlots(slots)));
  }, [slots, profile?.id, inv]);

  useEffect(() => {
    if (!profile?.id || !vault) return;
    localStorage.setItem(VAULT_STORAGE_KEY(profile.id), JSON.stringify(serializeSlots(vaultSlots)));
  }, [vaultSlots, profile?.id, vault]);

  const used = useMemo(() => slots.filter(Boolean).length, [slots]);
  const capacity = inv?.max_slots ?? 30;
  const vaultUsed = useMemo(() => vaultSlots.filter(Boolean).length, [vaultSlots]);
  const vaultCap = vault?.max_slots ?? 24;

  const refreshEconomy = async () => {
    const [r, d] = await Promise.all([getResources(), getMyDomain()]);
    setResources(r);
    setDomain(d);
  };

  const refreshBags = async () => {
    const [i, v] = await Promise.all([getInventory(), getVault()]);
    setInv(i);
    setVault(v);

    const pid = profile?.id || "anon";
    const savedInv = safeParse<(string | null)[]>(localStorage.getItem(STORAGE_KEY(pid)));
    const savedVault = safeParse<(string | null)[]>(localStorage.getItem(VAULT_STORAGE_KEY(pid)));
    setSlots(buildSlots(i, savedInv));
    setVaultSlots(buildSlots(v, savedVault));
  };

  const onDrop = async (toBag: "inventory" | "vault", to: number) => {
    const payload = dragRef.current;
    dragRef.current = null;
    setHover(null);
    if (!payload) return;

    const fromBag = payload.fromBag;
    const from = payload.from;
    if (fromBag === toBag && from === to) return;

    // Same bag: local swap only
    if (fromBag === toBag) {
      if (toBag === "inventory") {
        setSlots((prev) => {
          const next = [...prev];
          const a = next[from];
          const b = next[to];
          next[to] = a;
          next[from] = b ?? null;
          return next;
        });
      } else {
        setVaultSlots((prev) => {
          const next = [...prev];
          const a = next[from];
          const b = next[to];
          next[to] = a;
          next[from] = b ?? null;
          return next;
        });
      }
      return;
    }

    // Cross bag: authoritative move
    const movingId = payload.itemId;
    if (toBag === "vault") {
      const res = await moveInventoryItemToVault(movingId);
      if (!res.ok) return;
    } else {
      const res = await moveVaultItemToInventory(movingId);
      if (!res.ok) return;
    }

    // Rebuild from source-of-truth and then place into desired slot index
    await refreshBags();

    // After refresh, try to place the moved item into the target slot index (layout only)
    if (toBag === "vault") {
      setVaultSlots((prev) => {
        const next = [...prev];
        const curIdx = next.findIndex((it) => it?.id === movingId);
        if (curIdx >= 0) {
          const a = next[curIdx];
          const b = next[to];
          next[to] = a;
          next[curIdx] = b ?? null;
        }
        return next;
      });
    } else {
      setSlots((prev) => {
        const next = [...prev];
        const curIdx = next.findIndex((it) => it?.id === movingId);
        if (curIdx >= 0) {
          const a = next[curIdx];
          const b = next[to];
          next[to] = a;
          next[curIdx] = b ?? null;
        }
        return next;
      });
    }
  };

  const promptAmount = (title: string) => {
    const raw = window.prompt(title, "100");
    if (!raw) return null;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  };

  const onDeposit = async () => {
    const n = promptAmount("Deposit how much gold?");
    if (!n) return;
    const res = await depositGoldToVault(n);
    if (res.ok) await refreshEconomy();
  };

  const onWithdraw = async () => {
    const n = promptAmount("Withdraw how much gold?");
    if (!n) return;
    const res = await withdrawGoldFromVault(n);
    if (res.ok) await refreshEconomy();
  };

  const onSell = async (bag: "inventory" | "vault", item: Item) => {
    const ok = window.confirm(`Sell for ${Math.max(0, Math.floor(item.value ?? 0))} gold?`);
    if (!ok) return;
    if (bag === "inventory") {
      const res = await sellInventoryItem(item.id);
      if (!res.ok) return;
      setSlots((prev) => prev.map((it) => (it?.id === item.id ? null : it)));
    } else {
      const res = await sellVaultItem(item.id);
      if (!res.ok) return;
      setVaultSlots((prev) => prev.map((it) => (it?.id === item.id ? null : it)));
    }
    await refreshEconomy();
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
            {/* Vault (left-side) */}
            <div
              className="absolute"
              style={{ left: "8%", top: "26%", width: "32%", height: "57%" }}
            >
              <div className="hx-vault-head">
                <div className="hx-vault-gold" title="Vault gold">
                  {Math.max(0, Math.floor(Number(domain?.stored_gold ?? 0)))}
                </div>
                <div className="hx-vault-actions">
                  <button type="button" aria-label="Deposit" className="hx-vault-btn" onClick={onDeposit}>
                    ⇩
                  </button>
                  <button type="button" aria-label="Withdraw" className="hx-vault-btn" onClick={onWithdraw}>
                    ⇧
                  </button>
                </div>
              </div>

              <div className="hx-vault-grid" aria-label="Vault">
                {Array.from({ length: vaultCap }).map((_, idx) => {
                  const item = vaultSlots[idx] ?? null;
                  const isHover = hover?.bag === "vault" && hover.idx === idx;
                  const isOccupied = !!item;

                  return (
                    <div
                      key={`v_${idx}`}
                      className={["hx-slot", isHover ? "hx-slot--hover" : "", isOccupied ? "hx-slot--occupied" : ""].join(" ")}
                      onMouseEnter={() => setHover({ bag: "vault", idx })}
                      onMouseLeave={() => setHover((h) => (h?.bag === "vault" && h.idx === idx ? null : h))}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (hover?.bag !== "vault" || hover.idx !== idx) setHover({ bag: "vault", idx });
                      }}
                      onDrop={() => onDrop("vault", idx)}
                    >
                      <img src={artpack.frames.itemSlot} alt="" draggable={false} className="hx-slot__frame" />

                      {item && (
                        <div
                          className="hx-item"
                          draggable
                          onClick={(e) => {
                            if (e.shiftKey) onSell("vault", item);
                          }}
                          onDragStart={(e) => {
                            dragRef.current = { from: idx, itemId: item.id, fromBag: "vault" };
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", item.id);
                          }}
                          onDragEnd={() => {
                            dragRef.current = null;
                            setHover(null);
                          }}
                          title={item.name}
                        >
                          <div className="hx-item__glyph">{item.name.slice(0, 1).toUpperCase()}</div>
                          {(item as any).stack_count > 1 && <div className="hx-stack">{(item as any).stack_count}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="hx-vault-meta">{vaultUsed}/{vaultCap}</div>
            </div>

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
                  const isHover = hover?.bag === "inventory" && hover.idx === idx;
                  const isOccupied = !!item;

                  return (
                    <div
                      key={idx}
                      className={[
                        "hx-slot",
                        isHover ? "hx-slot--hover" : "",
                        isOccupied ? "hx-slot--occupied" : "",
                      ].join(" ")}
                      onMouseEnter={() => setHover({ bag: "inventory", idx })}
                      onMouseLeave={() => setHover((h) => (h?.bag === "inventory" && h.idx === idx ? null : h))}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (hover?.bag !== "inventory" || hover.idx !== idx) setHover({ bag: "inventory", idx });
                      }}
                      onDrop={() => onDrop("inventory", idx)}
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
                          onClick={(e) => {
                            if (e.shiftKey) onSell("inventory", item);
                          }}
                          onDragStart={(e) => {
                            dragRef.current = { from: idx, itemId: item.id, fromBag: "inventory" };
                            e.dataTransfer.effectAllowed = "move";
                            // required for Firefox
                            e.dataTransfer.setData("text/plain", item.id);
                          }}
                          onDragEnd={() => {
                            dragRef.current = null;
                            setHover(null);
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
