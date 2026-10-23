import type { Json } from "@/lib/supabase/database.types";

export const canonicalCollections = ["teams", "meets", "athletes", "swims", "relay_results"] as const;
export const baselineCollections = [...canonicalCollections, "catalog", "athlete_identities", "result_occurrences", "result_sources"] as const;
type Collection = typeof baselineCollections[number];
type Row = { id: string; data: Json };
type FetchPage = (query: URLSearchParams) => Promise<unknown>;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid private baseline response.");
  return value as Record<string, unknown>;
};

/** No artifact is returned until every page and the closing revision/counts agree. */
export async function collectPrivateRaceBaseline(fetchPage: FetchPage) {
  const first = object(await fetchPage(new URLSearchParams()));
  const counts = object(first.counts);
  if (first.version !== 1 || typeof first.revision !== "string" || !/^\d+$/.test(first.revision)
    || typeof first.project !== "string" || !first.project || typeof first.capturedAt !== "string"
    || !Number.isFinite(Date.parse(first.capturedAt))) throw new Error("Invalid private baseline metadata.");
  for (const name of baselineCollections) {
    if (!Number.isSafeInteger(counts[name]) || Number(counts[name]) < 0 || Number(counts[name]) > 1_000_000)
      throw new Error("Invalid private baseline collection counts.");
  }
  const collections = {} as Record<Collection, Row[]>;
  let bytes = 0;
  for (const collection of baselineCollections) {
    const rows: Row[] = [];
    const seen = new Set<string>();
    let after: string | undefined;
    do {
      const query = new URLSearchParams({ collection, revision: first.revision, size: "100" });
      if (after) query.set("after", after);
      const page = object(await fetchPage(query));
      if (page.version !== 1 || page.project !== first.project || page.revision !== first.revision
        || page.collection !== collection || !Array.isArray(page.rows)
        || page.rows.length > 100) throw new Error("Private baseline changed or returned an invalid page. Start again.");
      for (const value of page.rows) {
        const row = object(value);
        object(row.data);
        if (typeof row.id !== "string" || !row.id || seen.has(row.id)) throw new Error("Private baseline pagination is incomplete.");
        seen.add(row.id);
        rows.push(row as Row);
        bytes += new TextEncoder().encode(JSON.stringify(row)).length;
        if (bytes > 100_000_000 || rows.length > Number(counts[collection])) throw new Error("Private baseline exceeds its count or size limit.");
      }
      if (page.nextAfter !== null && (typeof page.nextAfter !== "string" || !page.rows.length
        || page.nextAfter !== rows[rows.length - 1].id || page.nextAfter === after)) throw new Error("Invalid private baseline cursor.");
      after = page.nextAfter as string | undefined;
    } while (after);
    if (rows.length !== counts[collection]) throw new Error("Private baseline is incomplete. No file was created.");
    collections[collection] = rows;
  }
  const last = object(await fetchPage(new URLSearchParams({ revision: first.revision })));
  const lastCounts = object(last.counts);
  if (last.project !== first.project || last.revision !== first.revision
    || baselineCollections.some(name => lastCounts[name] !== counts[name])) throw new Error("Private baseline changed during export. Start again.");
  return {
    version: 1, project: first.project, capturedAt: first.capturedAt,
    canonicalRevision: first.revision, consistency: { verified: true, revision: first.revision, exportVersion: 1 },
    completeCollections: [...canonicalCollections],
    collectionCounts: Object.fromEntries(canonicalCollections.map(name => [name, counts[name]])),
    ...Object.fromEntries(canonicalCollections.map(name => [name, collections[name]])),
    catalog: collections.catalog, catalogComplete: true, catalogCount: counts.catalog,
    identityClaims: { athletes: collections.athlete_identities, occurrences: collections.result_occurrences, results: collections.result_sources },
  };
}
