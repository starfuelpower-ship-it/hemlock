import { ChatMessage } from "../types";
import { offlineNowIso, offlineUid } from "./offlineStore";

export function makeChatMessage(params: {
  channel: ChatMessage["channel"];
  sender_id: string;
  sender_name: string;
  message: string;
}): ChatMessage {
  const msg = (params.message ?? "").trim().slice(0, 240);
  return {
    id: offlineUid("msg"),
    channel: params.channel,
    sender_id: params.sender_id,
    sender_name: params.sender_name,
    message: msg,
    created_at: offlineNowIso(),
  };
}
