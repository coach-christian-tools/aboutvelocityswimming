import { browserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import {
  dependencyTables,
  orderReviewBatches,
  recordDependencies,
} from "./review-order";
import type { ReviewWrite } from "./review-summary";

export type QueueBatch =
  Database["public"]["Views"]["collection_batch_queue"]["Row"];
export async function loadReviewBatches(status: string, signal: AbortSignal) {
  if (!["pending", "held"].includes(status))
    throw new Error("Completed batches must use the paged history loader.");
  const client = browserClient();
  const batches: QueueBatch[] = [];
  // Sort and search across the entire queue, not just the current screen.
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client
      .from("collection_batch_queue")
      .select("*")
      .in("status", ["pending", "held"])
      .order("received_at", { ascending: true })
      .order("id")
      .range(offset, offset + 99)
      .abortSignal(signal);
    if (error) throw error;
    batches.push(...(data ?? []));
    if (!data || data.length < 100) break;
  }
  const refs = new Set(
    batches.flatMap((batch) =>
      (batch.writes as ReviewWrite[]).flatMap(recordDependencies),
    ),
  );
  const existing = new Set<string>();
  await Promise.all(
    dependencyTables.map(async (table) => {
      const ids = [...refs]
        .filter((path) => path.startsWith(`${table}/`))
        .map((path) => path.slice(table.length + 1));
      for (let start = 0; start < ids.length; start += 200) {
        const { data, error } = await client
          .from(table)
          .select("id")
          .in("id", ids.slice(start, start + 200))
          .abortSignal(signal);
        if (error) throw error;
        for (const row of data ?? []) existing.add(`${table}/${row.id}`);
      }
    }),
  );
  const ordered = orderReviewBatches(batches, existing);
  return {
    sourceBatches: batches,
    existing,
    batches: ordered.batches.filter((batch) => batch.status === status),
    blockers: ordered.blockers,
  };
}

export type ReviewQueueSnapshot = Awaited<ReturnType<typeof loadReviewBatches>>;

// The server has committed the entire batch before this is called. Reuse the
// loaded queue instead of downloading every proposal after each decision.
export function applyReviewDecision(
  snapshot: ReviewQueueSnapshot,
  batchId: string,
  decision: string,
  status: string,
  note: string,
): ReviewQueueSnapshot {
  const decided = snapshot.sourceBatches.find((batch) => batch.id === batchId);
  if (!decided) return snapshot;
  const existing = new Set(snapshot.existing);
  if (decision === "approved") {
    for (const write of decided.writes as ReviewWrite[]) {
      if (write.after === null) existing.delete(write.path);
      else existing.add(write.path);
    }
  }
  const sourceBatches = snapshot.sourceBatches
    .map((batch) =>
      batch.id === batchId
        ? {
            ...batch,
            status: decision,
            review_note: note,
            reviewed_at: new Date().toISOString(),
          }
        : batch,
    )
    .filter((batch) => ["pending", "held"].includes(batch.status));
  const ordered = orderReviewBatches(sourceBatches, existing);
  return {
    sourceBatches,
    existing,
    batches: ordered.batches.filter((batch) => batch.status === status),
    blockers: ordered.blockers,
  };
}
