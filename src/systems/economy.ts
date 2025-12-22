// Centralized gold economy helpers.
// All gold mutations must go through this module.

export const MAX_GOLD = 1_000_000_000_000; // 1e12 safety cap to prevent overflow/abuse.

export function clampGold(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Keep gold as an integer.
  const n = Math.floor(value);
  if (n < 0) return 0;
  if (n > MAX_GOLD) return MAX_GOLD;
  return n;
}

export function clampDelta(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Deltas can be negative but must be sane integers.
  const n = Math.floor(value);
  // Hard cap delta magnitude to prevent extreme spikes.
  const cap = MAX_GOLD;
  if (n > cap) return cap;
  if (n < -cap) return -cap;
  return n;
}

export type GoldMutationResult = {
  ok: boolean;
  next: number;
  appliedDelta: number;
  reason?: string;
};

/**
 * Apply a gold delta safely.
 * - Prevents NaN/Infinity
 * - Prevents negative balances
 * - Clamps to MAX_GOLD
 */
export function applyGoldDelta(currentGold: number, delta: number): GoldMutationResult {
  const cur = clampGold(currentGold);
  const d = clampDelta(delta);

  const rawNext = cur + d;
  const next = clampGold(rawNext);

  // Compute applied delta after clamping.
  const appliedDelta = next - cur;

  // Reject if this would underflow below 0.
  if (cur + d < 0) {
    return { ok: false, next: cur, appliedDelta: 0, reason: "INSUFFICIENT_GOLD" };
  }

  return { ok: true, next, appliedDelta };
}

/**
 * Idempotency helper: returns true if an id has already been processed.
 */
export function hasProcessed(processedIds: Iterable<string>, id: string): boolean {
  for (const x of processedIds) if (x === id) return true;
  return false;
}

export function addProcessed(processed: string[], id: string, max: number = 5000): string[] {
  if (!id) return processed;
  if (processed.includes(id)) return processed;
  const next = [id, ...processed];
  if (next.length > max) next.length = max;
  return next;
}
