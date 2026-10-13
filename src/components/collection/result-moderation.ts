import type { Race } from "./times-data";

export const moderationReasons = [
  ["incorrect_time", "Incorrect time"],
  ["incorrect_event_course", "Incorrect event or course"],
  ["incorrect_swimmer_age", "Incorrect swimmer or age"],
  ["duplicate", "Duplicate result"],
  ["other", "Other"],
] as const;
export type ResultType = "swim" | "relay";
export interface ModerationDetail {
  resultType: ResultType;
  resultId: string;
  version: number;
  flagged: boolean;
  available: boolean;
  race: Race | null;
  history: {
    version: number;
    action: "flag" | "restore";
    reason: string | null;
    note: string;
    actor_email: string;
    created_at: string;
  }[];
  sources: { source_url: string; evidence: unknown; captured_at: string }[];
  sourceData: unknown;
  originalSnapshot: unknown;
}
export interface ModerationList {
  total: number;
  results: {
    result_type: ResultType;
    result_id: string;
    version: number;
    flagged: boolean;
    reason: string | null;
    note: string;
    created_at: string;
    race: Race | null;
  }[];
}
export function moderationUrl(resultType: ResultType, resultId: string) {
  return (
    "/api/times/moderation?" + new URLSearchParams({ resultType, resultId })
  );
}
export function reasonLabel(reason: string | null) {
  return (
    moderationReasons.find(([key]) => key === reason)?.[1] ?? "Review completed"
  );
}
