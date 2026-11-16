export type AiHotProvider = "codex" | "claude" | "antigravity" | "grok-bot";
export type AiHotEventStatus = "announced" | "in_progress" | "confirmed" | "expired_unconfirmed" | "likely_completed";

export interface AiHotEvent {
  id: string;
  title: string;
  updatedAt: string | null;
  status: AiHotEventStatus;
  scope: string | null;
  reportedAt: string | null;
  url: string;
}

export interface AiHotSource {
  provider: AiHotProvider;
  status: "healthy" | "stale" | "unavailable";
  updatedAt: string | null;
  sourceUrl: string;
  events: AiHotEvent[];
  error: string | null;
}

export interface AiHotReport {
  checkedAt: string;
  sources: AiHotSource[];
}

export const AIHOT_PROVIDERS: Record<AiHotProvider, string> = {
  codex: "Codex", claude: "Claude", antigravity: "Antigravity", "grok-bot": "Grok Bot",
};

export const AIHOT_CREDITS_URL = "https://aihot.news/free-tokens";
