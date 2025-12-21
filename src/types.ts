export type RiskState = "Protected" | "Scouted" | "Vulnerable" | "UnderRaid";

export type Profile = {
  id: string;
  username: string;
  premium: boolean;
  level: number;
  risk_state: RiskState;
  created_at?: string;
};

export type Resources = { gold: number; vigor: number; vigor_cap: number; vigor_regen_minutes: number };

export type ActionKind = "HUNT" | "STALK_RIVAL" | "BREACH_DOMAIN";
export type ActionStatus = "QUEUED" | "RESOLVED" | "CANCELLED";

export type Action = {
  id: string;
  actor_id: string;
  kind: ActionKind;
  target_id?: string | null;
  vigor_cost: number;
  gold_delta_min: number;
  gold_delta_max: number;
  duration_seconds: number;
  status: ActionStatus;
  created_at: string;
  resolves_at: string;
  resolved_at?: string | null;
};

export type ReportKind = "SYSTEM" | "PVE" | "PVP" | "RAID" | "CHRONICLE";
export type Report = {
  id: string;
  recipient_id: string;
  kind: ReportKind;
  title: string;
  body: string;
  payload: any;
  is_unread: boolean;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  channel: "world" | "court" | "system";
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: string;
};
