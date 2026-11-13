import type { Json } from "@/lib/supabase/database.types";

export type ImportTableKind = "meets" | "swims";

export type ImportQueueRow = {
  id: string;
  kind: string;
  recordId: string;
  label: string;
  meetId: string | null;
  meetName: string | null;
  eventCode: string | null;
  time: number | null;
  startsOn: string | null;
  teamName: string | null;
  round: string | null;
  course: string | null;
  status: string | null;
  resultStatus: string | null;
  blocker: string | null;
  batchId: string;
  capturedAt: string;
  selected: boolean;
  canResolveSwimmerMatch?: boolean;
};

export type ImportQueuePage = {
  rows: ImportQueueRow[];
  total: number;
  hasNext: boolean;
};

export type ImportQueueDetail = ImportQueueRow & {
  data: Json;
  prerequisites: { kind: string; id: string; data: Json }[];
  sourceUrl: string;
  coverage: string;
  sourceScope: string;
  sha256: string;
  locator: string | null;
};

export type ImportSwimmerMatch = {
  affected: number;
  capturedName: string;
  capturedTeamName: string | null;
  currentAthleteId: string;
  matchVersion: string;
  candidates: {
    id: string;
    name: string;
    teamName: string | null;
    evidence: "source_identity" | "staged_link" | "name_match" | "search";
  }[];
};

export type ImportSwimmerResolution = {
  updated: number;
  rowIds: string[];
};

export type ImportMatch = {
  kind: ImportTableKind;
  search?: string;
  batchId?: string;
};

export type ImportSelectionInput = {
  ids?: string[];
  matches?: ImportMatch[];
  selectionIds?: string[];
  excludeIds?: string[];
  preview?: boolean;
  prepareSelectionId?: string;
};

export type ImportPreviewSection = "prerequisites" | "blockers";
export type ImportPreviewItem = { id: string; label: string } & ({ kind: string } | { reason: string });

export type ImportSelectionPreview = {
  selectionId: string;
  selected: number;
  meets: number;
  swims: number;
  blocked: number;
  prerequisiteCount: number;
  previewRemaining: number;
  prerequisites: { kind: string; id: string; label: string }[];
  blockers: { id: string; label: string; reason: string }[];
};

export type ImportApprovalReceipt = {
  selected: number;
  approved: number;
  duplicates: number;
  blocked: number;
  remaining: number;
  done: boolean;
  published: number;
};

export const importPageSize = 30;

export class ImportRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ImportRequestError";
  }
}

async function importRequest<T>(query: string, fallback: string, init: RequestInit): Promise<T> {
  const response = await fetch(`/api/collection/imports${query}`, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw new ImportRequestError(typeof body?.error === "string" ? body.error : fallback, response.status);
  }
  return body as T;
}

export function importQueuePage(query: URLSearchParams, signal: AbortSignal) {
  return importRequest<ImportQueuePage>(`?${query}`, "The queue could not be loaded.", { signal });
}

export function importQueueDetail(id: string, signal: AbortSignal) {
  return importRequest<ImportQueueDetail>(`?${new URLSearchParams({ id })}`, "The record details could not be loaded.", { signal });
}

export function getImportSwimmerMatch(id: string, search: string, signal: AbortSignal) {
  const query = new URLSearchParams({ swimmerMatch: id, search });
  return importRequest<ImportSwimmerMatch>(`?${query}`, "Swimmer matches could not be loaded.", { signal });
}

export function resolveImportSwimmerMatch(input: { id: string; athleteId: string; reason: string; matchVersion: string }) {
  return importRequest<ImportSwimmerResolution>("", "The swimmer match could not be confirmed.", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resolveSwimmerMatch", ...input }),
  });
}

export function importPreviewPage(selectionId: string, section: ImportPreviewSection, offset: number, signal: AbortSignal) {
  const query = new URLSearchParams({ selectionId, section, offset: String(offset) });
  return importRequest<{ rows: ImportPreviewItem[]; total: number; hasNext: boolean }>(
    `?${query}`, "The preview details could not be loaded.", { signal },
  );
}

export function createImportSelection(selection: ImportSelectionInput, signal?: AbortSignal) {
  return importRequest<ImportSelectionPreview>("", "The selection could not be saved.", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "selection", ...selection }),
    signal,
  });
}

export function approveImportSelection(selectionId: string, signal: AbortSignal) {
  return importRequest<ImportApprovalReceipt>("", "Approval was interrupted. Retry to continue the saved selection.", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve", selectionId }),
    signal,
  });
}
