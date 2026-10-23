import { browserClient } from "@/lib/supabase/client";
import type { QueueBatch } from "./load-review-batches";

export const HISTORY_PAGE_SIZE = 20;
export const reviewDivisions: Record<string, string> = {
  workshare: "Velocity Workshare",
  times: "Velocity Times",
  knowledge: "Swim Atlas",
};
export const HISTORY_COLUMNS =
  "id,division,scope,source_url,captured_at,received_at,coverage,status,review_note,reviewed_at";
export type HistoryBatch = Omit<QueueBatch, "writes" | "reads">;
export interface ReviewHistoryPage {
  batches: HistoryBatch[];
  hasMore: boolean;
}

export function historySearchFilter(search: string): string | undefined {
  const needle = search.trim();
  if (needle.length > 200 || /[\u0000-\u001f\u007f]/.test(needle))
    throw new Error("Use up to 200 characters of search text.");
  if (!needle) return undefined;
  // Literal substring search: escape regex operators, then quote the value for
  // PostgREST's filter grammar. Unlike ILIKE's '*' alias, literal '*' stays '*'.
  const pattern = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quoted = JSON.stringify(pattern);
  const terms = ["scope", "division", "source_url"]
    .map((column) => `${column}.imatch.${quoted}`);
  const divisions = Object.entries(reviewDivisions)
    .filter(([, label]) => label.toLowerCase().includes(needle.toLowerCase()))
    .map(([id]) => id);
  if (divisions.length) terms.push(`division.in.(${divisions.join(",")})`);
  return terms.join(",");
}

export async function loadReviewHistory(
  status: string,
  search: string,
  offset: number,
  signal: AbortSignal,
): Promise<ReviewHistoryPage> {
  if (!["approved", "declined"].includes(status))
    throw new Error("Only completed batches belong in history.");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % HISTORY_PAGE_SIZE)
    throw new Error("Invalid history page.");
  const filter = historySearchFilter(search);
  signal.throwIfAborted();
  // Same staff RLS as the queue view; select only base-table scalar metadata.
  // No writes/reads/evidence, summary subqueries, exact count or history loop.
  let request = browserClient()
    .from("collection_batches")
    .select(HISTORY_COLUMNS)
    .eq("status", status);
  if (filter) request = request.or(filter);
  const { data, error } = await request
    .order("received_at", { ascending: true })
    .order("id")
    .range(offset, offset + HISTORY_PAGE_SIZE)
    .abortSignal(signal);
  if (error) throw error;
  return {
    batches: (data ?? []).slice(0, HISTORY_PAGE_SIZE),
    hasMore: (data?.length ?? 0) > HISTORY_PAGE_SIZE,
  };
}

// Full comparisons remain a separate, exact-ID request on explicit expansion.
export async function loadReviewBatchDetails(id: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const { data, error } = await browserClient()
    .from("collection_batches")
    .select("*")
    .eq("id", id)
    .abortSignal(signal)
    .single();
  if (error) throw error;
  return data;
}
