import type { AthleteRankingGroup } from "./athlete-rankings";
import type { Race } from "./times-data";
export const timesKinds = [
  "facets",
  "rankings",
  "analysis",
  "meets",
  "meet_results",
  "profile",
  "athlete_history",
  "records",
  "athletes",
] as const;
export type TimesKind = (typeof timesKinds)[number];
export interface MeetSummary {
  id: string;
  name: string;
  date: string;
  count: number;
  courses: string[];
}
export interface TimesResponse {
  expiresAt: number;
  rows?: { race: Race; rank?: number }[];
  total?: number;
  teams?: [string, string][];
  events?: string[];
  years?: string[];
  relayAges?: string[];
  meets?: MeetSummary[];
  meet?: MeetSummary;
  name?: string;
  count?: number;
  pbs?: Race[];
  points?: Race[];
  races?: Race[];
  stats?: {
    value: number;
    faster: number;
    tied: number;
    slower: number;
    count: number;
    rank: number;
  } | null;
  groups?: (AthleteRankingGroup & {
    totals: Record<"ranked" | "provisional" | "unscored", number>;
  })[];
  standardName?: string;
  standardAvailable?: boolean;
}
export type TimesInput = Record<
  string,
  string | number | boolean | string[] | undefined
>;
export function timesUrl(kind: TimesKind, input: TimesInput = {}) {
  const params = new URLSearchParams({ view: kind });
  for (const key of Object.keys(input).sort()) {
    const value = input[key];
    if (value !== undefined)
      params.set(
        key,
        Array.isArray(value) ? [...value].sort().join(",") : String(value),
      );
  }
  return "/api/times?" + params;
}
/** Only known fields enter cache keys or the parameterized database call. */
export function parseTimesQuery(params: URLSearchParams): {
  kind: TimesKind;
  input: TimesInput;
} {
  const kind = params.get("view") as TimesKind;
  if (!timesKinds.includes(kind)) throw new Error("Choose a valid times view.");
  const input: TimesInput = {};
  for (const key of [
    "team",
    "course",
    "event",
    "year",
    "round",
    "official",
    "mode",
    "search",
    "meetId",
    "athleteId",
    "raceId",
    "historyEvent",
    "period",
    "basis",
    "groupAge",
    "groupGender",
    "status",
  ]) {
    const value = params.get(key);
    if (value !== null) {
      if (value.length > (key === "search" ? 100 : 200))
        throw new Error("Filter is too long.");
      input[key] = key === "search" ? value.trim().toLowerCase() : value.trim();
    }
  }
  for (const [key, allowed] of Object.entries({
    course: ["", "SCY", "LCM", "SCM"],
    official: ["", "official", "unofficial"],
    mode: ["bests", "performances"],
    period: ["recent", "all"],
    basis: ["bests", "swims"],
    round: ["", "F", "P", "S", "TT"],
    groupGender: ["", "F", "M"],
    status: ["ranked", "provisional", "unscored"],
  })) {
    if (input[key] !== undefined && !allowed.includes(String(input[key])))
      throw new Error("Invalid " + key + ".");
  }
  for (const key of ["genders", "ageGroups"]) {
    if (params.has(key)) {
      const values = [
        ...new Set((params.get(key) || "").split(",").filter(Boolean)),
      ].sort();
      if (
        values.length > 20 ||
        values.some((v) => v.length > 30) ||
        (key === "genders" &&
          (!values.length || values.some((v) => !["F", "M", "X"].includes(v))))
      )
        throw new Error("Invalid " + key + ".");
      input[key] = values;
    }
  }
  for (const [key, fallback] of [
    ["offset", 0],
    ["limit", 25],
  ] as const) {
    const raw = params.get(key);
    const value = raw === null ? fallback : Number(raw);
    if (
      !Number.isSafeInteger(value) ||
      value < (key === "limit" ? 1 : 0) ||
      value > (key === "limit" ? 100 : 1000000)
    )
      throw new Error("Invalid pagination.");
    input[key] = value;
  }
  if (params.has("relay")) {
    if (!["true", "false"].includes(params.get("relay")!))
      throw new Error("Invalid relay filter.");
    input.relay = params.get("relay") === "true";
  }
  if (input.year && !/^\d{4}$/.test(String(input.year)))
    throw new Error("Invalid year.");
  if (kind === "rankings") {
    input.genders ??= ["F"];
    input.mode ??= "bests";
  }
  if (kind === "athletes") {
    input.period ??= "recent";
    input.course ??= "SCY";
  }
  const required: Partial<Record<TimesKind, string[]>> = {
    analysis: ["raceId"],
    meet_results: ["meetId"],
    profile: ["athleteId"],
    athlete_history: ["athleteId", "historyEvent"],
    records: ["team"],
    athletes: ["team"],
  };
  if (required[kind]?.some((key) => !input[key]))
    throw new Error("Select a " + required[kind]!.join(" and ") + ".");
  return { kind, input };
}
