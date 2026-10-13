import type { Json } from "@/lib/supabase/database.types";

export const MEET_QUEUE_PAGE_SIZE = 30;
export const MEET_QUEUE_EXPORT_LIMIT = 5000;
export const ACQUISITION_STATES = ["unchecked", "available", "downloaded", "unavailable"] as const;
export const IMPORT_STATES = ["not_started", "prepared", "partially_approved", "complete"] as const;
export const MEET_CATEGORIES = ["sanctioned", "approved", "observed", "unknown"] as const;
export type AcquisitionState = typeof ACQUISITION_STATES[number];
export type MeetImportState = typeof IMPORT_STATES[number];
export type MeetCategory = typeof MEET_CATEGORIES[number];
export type ParticipationCoverage = "unknown" | "partial" | "complete";
export type IesParticipation = "confirmed" | "unknown" | "none";
export interface MeetParticipantEvidence {
  sourceUrl: string;
  sha256?: string;
  member?: string;
  line?: number;
  kind?: string;
  status?: string;
}
export interface MeetParticipant {
  id: string;
  name: string;
  clubCode: string;
  lscCode: string;
  catalogTeamId?: string;
  operationalTeamId?: string;
  basis: "planned" | "entered" | "recorded";
  representation: "club" | "school" | "unattached";
  evidence: MeetParticipantEvidence[];
}
export interface MeetQueueRow {
  id: string;
  title: string;
  startsOn: string | null;
  endsOn: string | null;
  sourceUrl: string;
  data: Record<string, Json | undefined>;
  participants: MeetParticipant[];
  teamCoverage: ParticipationCoverage;
  iesParticipation: IesParticipation;
  selected: boolean;
  priority: number;
  notes: string;
  blockers: string[];
  acquisitionState: AcquisitionState;
  importState: MeetImportState;
  reconciliationNote: string;
  importedSwims: number;
  updatedAt: string | null;
}
export interface CollectionCoverage {
  id: string;
  source_url: string;
  year: number;
  category: MeetCategory;
  scope: string;
  checked_at: string;
  status: "not_checked" | "partial" | "complete" | "blocked";
  meet_count: number;
  gaps: string[];
}
export interface MeetQueueResponse {
  rows: MeetQueueRow[];
  total: number;
  hasNext: boolean;
  facets: { years: number[]; teams: { id: string; name: string }[] };
  coverage: CollectionCoverage[];
  summary: { total: number; selected: number; confirmedIES: number; unfinished: number };
}
export interface MeetQueueQuery {
  search: string;
  year: number | null;
  team: string;
  ies: IesParticipation | "";
  category: MeetCategory | "";
  selected: boolean | null;
  progress: MeetImportState | "blocked" | "";
  offset: number;
  export: boolean;
}
export interface MeetQueuePatch {
  meetId: string;
  selected: boolean;
  priority: number;
  notes: string;
  blockers: string[];
  acquisitionState?: AcquisitionState;
  importState?: MeetImportState;
  reconciliationNote?: string;
  /** Null creates only if no work record exists; a timestamp updates that version. */
  updatedAt: string | null;
}

const safeId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
function choice<T extends string>(value: string, choices: readonly T[], label: string): T | "" {
  if (!value) return "";
  if (!choices.includes(value as T)) throw new Error(`Invalid ${label}.`);
  return value as T;
}
export function parseMeetQueueQuery(params: URLSearchParams): MeetQueueQuery {
  const search = (params.get("search") ?? "").trim();
  if (search.length > 200) throw new Error("Search must be 200 characters or fewer.");
  const yearValue = params.get("year") ?? "";
  if (yearValue && (!/^\d{4}$/.test(yearValue) || Number(yearValue) < 1900 || Number(yearValue) > 2200)) throw new Error("Invalid meet year.");
  const offsetValue = params.get("offset") ?? "0";
  if (!/^\d+$/.test(offsetValue) || Number(offsetValue) > 1000000) throw new Error("Invalid page offset.");
  const team = params.get("team") ?? "";
  if (team && !safeId(team)) throw new Error("Invalid team.");
  const selectedValue = params.get("selected") ?? "";
  if (selectedValue && !["true", "false"].includes(selectedValue)) throw new Error("Invalid selection filter.");
  const exportValue = params.get("export") ?? "";
  if (exportValue && exportValue !== "1") throw new Error("Invalid export request.");
  return {
    search, year: yearValue ? Number(yearValue) : null, team,
    ies: choice(params.get("ies") ?? "", ["confirmed", "unknown", "none"], "IES participation filter"),
    category: choice(params.get("category") ?? "", MEET_CATEGORIES, "meet category"),
    selected: exportValue === "1" ? true : selectedValue ? selectedValue === "true" : null,
    progress: choice(params.get("progress") ?? "", [...IMPORT_STATES, "blocked"], "progress filter"),
    offset: exportValue === "1" ? 0 : Number(offsetValue), export: exportValue === "1",
  };
}
export function parseMeetQueuePatch(value: unknown): MeetQueuePatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid meet update.");
  const body = value as Record<string, unknown>;
  const allowed = ["meetId", "selected", "priority", "notes", "blockers", "acquisitionState", "importState", "reconciliationNote", "updatedAt"];
  if (Object.keys(body).some(key => !allowed.includes(key)) || !safeId(body.meetId) || typeof body.selected !== "boolean" || !Number.isInteger(body.priority) || Number(body.priority) < 0 || Number(body.priority) > 100 || typeof body.notes !== "string" || body.notes.length > 4000) throw new Error("Supply a meet, selection, priority from 0 to 100, and notes under 4,000 characters.");
  if (!Array.isArray(body.blockers) || body.blockers.length > 30 || body.blockers.some(item => typeof item !== "string" || !item.trim() || item.length > 500)) throw new Error("Supply up to 30 blockers, each under 500 characters.");
  if (!Object.hasOwn(body, "updatedAt") || (body.updatedAt !== null && (typeof body.updatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(body.updatedAt) || !Number.isFinite(Date.parse(body.updatedAt))))) throw new Error("Refresh the meet before saving its latest version.");
  if (body.acquisitionState !== undefined && !ACQUISITION_STATES.includes(body.acquisitionState as AcquisitionState)) throw new Error("Invalid download state.");
  if (body.importState !== undefined && !IMPORT_STATES.includes(body.importState as MeetImportState)) throw new Error("Invalid import state.");
  if (body.reconciliationNote !== undefined && (typeof body.reconciliationNote !== "string" || body.reconciliationNote.length > 4000)) throw new Error("Reconciliation notes must be under 4,000 characters.");
  if (body.importState === "complete" && (body.blockers.length || typeof body.reconciliationNote !== "string" || !body.reconciliationNote.trim())) throw new Error("Complete imports require a reconciliation note and no blockers.");
  return { ...body, blockers: body.blockers.map(item => String(item).trim()) } as unknown as MeetQueuePatch;
}

/** Only recorded IE evidence confirms participation; incomplete indexes cannot prove absence. */
export function iesParticipation(participants: MeetParticipant[], coverage: ParticipationCoverage): IesParticipation {
  if (participants.some(team => team.lscCode === "IE" && team.basis === "recorded" && ["club", "unattached"].includes(team.representation))) return "confirmed";
  if (coverage === "complete" && participants.length > 0 && participants.every(team => team.basis === "recorded" && team.representation === "club" && /^[A-Z]{2}$/.test(team.lscCode) && team.lscCode !== "IE")) return "none";
  return "unknown";
}
