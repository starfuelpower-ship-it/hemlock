import { ChatMessage } from "../types";
import { offlineNowIso, offlineUid } from "./offlineStore";

export function makeChatMessage(params: { channel: ChatMessage["channel"]; sender_id: string; sender_name: string; message: string }): ChatMessage {
  return { id: offlineUid("msg"), channel: params.channel, sender_id: params.sender_id, sender_name: params.sender_name, message: params.message.slice(0,280), created_at: offlineNowIso() };
}
