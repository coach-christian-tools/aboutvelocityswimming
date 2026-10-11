import type { Json } from "@/lib/supabase/database.types";
import { object, type ReviewWrite } from "./review-summary";

export type ReviewBatch = {
  id: string;
  scope: string;
  received_at: string;
  status: string;
  writes: Json;
};
export const dependencyTables = [
  "teams",
  "venues",
  "meets",
  "athletes",
] as const;
export type DependencyTable = (typeof dependencyTables)[number];

// These are the foreign keys accepted by the times collector. Athlete people
// and training groups are created by put_record as part of the athlete write.
export function recordDependencies(write: ReviewWrite): string[] {
  if (write.after === null) return [];
  const root = write.path.split("/")[0];
  const data = object(write.after);
  const refs: string[] = [];
  const add = (table: DependencyTable, id: Json | undefined) => {
    if (typeof id === "string") refs.push(`${table}/${id}`);
  };
  if (["venues", "meets", "athletes"].includes(root)) add("teams", data.teamId);
  if (root === "meets") {
    add("teams", data.hostTeamId);
    add("venues", data.venueId);
  }
  if (root === "swims") {
    add("athletes", data.athleteId);
    add("meets", object(data.meet).id);
  }
  return [...new Set(refs)];
}
export function batchDependencies(batch: ReviewBatch): string[] {
  const writes = batch.writes as ReviewWrite[];
  const provided = new Set(
    writes.filter((write) => write.after !== null).map((write) => write.path),
  );
  return [...new Set(writes.flatMap(recordDependencies))].filter(
    (path) => !provided.has(path),
  );
}

export function orderReviewBatches<T extends ReviewBatch>(
  batches: T[],
  existing: Set<string>,
) {
  const remaining = [...batches].sort(
    (a, b) =>
      a.received_at.localeCompare(b.received_at) || a.id.localeCompare(b.id),
  );
  const available = new Set(existing);
  const ordered: T[] = [];
  const dependencies = new Map(
    batches.map((batch) => [batch.id, batchDependencies(batch)]),
  );
  while (remaining.length) {
    const index = remaining.findIndex((batch) =>
      dependencies.get(batch.id)!.every((path) => available.has(path)),
    );
    if (index === -1) break; // Missing parents or a cycle stay visible at the end.
    const [batch] = remaining.splice(index, 1);
    ordered.push(batch);
    for (const write of batch.writes as ReviewWrite[])
      if (write.after !== null) available.add(write.path);
  }
  const providers = new Map<string, T[]>();
  for (const batch of batches)
    for (const write of batch.writes as ReviewWrite[]) {
      if (write.after === null) continue;
      providers.set(write.path, [...(providers.get(write.path) ?? []), batch]);
    }
  const blockers = Object.fromEntries(
    batches.map((batch) => [
      batch.id,
      dependencies
        .get(batch.id)!
        .filter((path) => !existing.has(path))
        .map((path) => {
          const parents = providers.get(path) ?? [];
          return parents.length
            ? `${path}: approve ${parents.map((parent) => `“${parent.scope}”${parent.status === "held" ? " (held)" : ""}`).join(" or ")} first`
            : `${path}: missing prerequisite; collect its record before approving`;
        }),
    ]),
  );
  return { batches: [...ordered, ...remaining], blockers };
}
