import { browserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import {
  dependencyTables,
  orderReviewBatches,
  recordDependencies,
} from "./review-order";
import type { ReviewWrite } from "./review-summary";

type Batch = Database["public"]["Tables"]["collection_batches"]["Row"];
export async function loadReviewBatches(status: string, signal: AbortSignal) {
  const client = browserClient();
  const active = ["pending", "held"].includes(status);
  const batches: Batch[] = [];
  // Sort and search across the entire queue, not just the current screen.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client
      .from("collection_batches")
      .select("*")
      .in("status", active ? ["pending", "held"] : [status])
      .order("received_at", { ascending: true })
      .order("id")
      .range(offset, offset + 499)
      .abortSignal(signal);
    if (error) throw error;
    batches.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  if (!active) return { batches, blockers: {} as Record<string, string[]> };
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
    batches: ordered.batches.filter((batch) => batch.status === status),
    blockers: ordered.blockers,
  };
}
