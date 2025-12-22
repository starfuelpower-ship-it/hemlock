import { Action, ActionKind, Report } from "../types";
import { offlineNowIso, offlineUid } from "./offlineStore";

export const ACTIONS: Record<
  ActionKind,
  {
    label: string;
    description: string;
    vigor_cost: number;
    duration_seconds: number;
    gold_delta_min: number;
    gold_delta_max: number;
    report_kind: "PVE" | "PVP" | "RAID";
    report_title: string;
  }
> = {
  HUNT: {
    label: "Blood Hunt",
    description: "Send thralls into the fog to harvest coin and omen.",
    vigor_cost: 2,
    duration_seconds: 600,
    gold_delta_min: 20,
    gold_delta_max: 80,
    report_kind: "PVE",
    report_title: "Blood Hunt Concluded",
  },
  STALK_RIVAL: {
    label: "Stalk Rival",
    description: "Scout a rival’s patterns and return with small gains.",
    vigor_cost: 2,
    duration_seconds: 900,
    gold_delta_min: 5,
    gold_delta_max: 35,
    report_kind: "PVP",
    report_title: "Rival Observed",
  },
  BREACH_DOMAIN: {
    label: "Breach Domain",
    description: "Attempt a risky breach against a rival’s Domain defenses.",
    vigor_cost: 5,
    duration_seconds: 1800,
    gold_delta_min: -40,
    gold_delta_max: 120,
    report_kind: "RAID",
    report_title: "Breach Attempt Resolved",
  },
};

export function queueAction(actor_id: string, kind: ActionKind, target_id?: string | null): Action {
  const now = new Date();
  const t = ACTIONS[kind];
  const resolvesAt = new Date(now.getTime() + t.duration_seconds * 1000);

  return {
    id: offlineUid("act"),
    actor_id,
    kind,
    target_id: target_id ?? null,
    vigor_cost: t.vigor_cost,
    gold_delta_min: t.gold_delta_min,
    gold_delta_max: t.gold_delta_max,
    duration_seconds: t.duration_seconds,
    status: "QUEUED",
    created_at: now.toISOString(),
    resolves_at: resolvesAt.toISOString(),
    resolved_at: null,
  };
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function resolveActionToReport(action: Action): { goldDelta: number; report: Report } {
  const t = ACTIONS[action.kind];
  const goldDelta = randInt(action.gold_delta_min, action.gold_delta_max);

  const body =
    action.kind === "HUNT"
      ? `Your thralls returned from the fog. They brought ${goldDelta} gold and a scrap of omen.`
      : action.kind === "STALK_RIVAL"
        ? `A quiet watch. You gleaned a pattern in their movements. Minor gains: ${goldDelta} gold.`
        : goldDelta >= 0
          ? `Steel met ward. The breach yielded ${goldDelta} gold — and a shadow of retaliation.`
          : `Steel met ward. The breach failed and cost you ${Math.abs(goldDelta)} gold in preparations.`;

  const report: Report = {
    id: offlineUid("rep"),
    recipient_id: action.actor_id,
    kind: t.report_kind,
    title: t.report_title,
    body,
    payload: { action },
    is_unread: true,
    created_at: offlineNowIso(),
  };

  return { goldDelta, report };
}
