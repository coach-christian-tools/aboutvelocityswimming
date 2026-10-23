import { describe, expect, it } from "vitest";
import { baselineCollections, collectPrivateRaceBaseline } from "../../src/lib/collection/race-baseline";
function fixture() {
  const rows = Object.fromEntries(baselineCollections.map(name => [name, Array.from({ length: name === "catalog" ? 940 : name === "athletes" ? 205 : 2 }, (_, i) => ({ id: `${name}-${String(i).padStart(4, "0")}`, data: { id: `${name}-${String(i).padStart(4, "0")}`, synthetic: true } }))]));
  const counts = Object.fromEntries(baselineCollections.map(name => [name, rows[name].length]));
  const meta = { version: 1, project: "local:aboutvelocityswimming", revision: "11", capturedAt: new Date().toISOString(), counts };
  const fetch = async (query: URLSearchParams) => {
    const name = query.get("collection");
    if (!name) return meta;
    const source = rows[name];
    const from = query.has("after") ? source.findIndex(row => row.id === query.get("after")) + 1 : 0;
    const page = source.slice(from, from + Number(query.get("size")));
    return { ...meta, collection: name, count: counts[name], rows: page, nextAfter: page.length === Number(query.get("size")) ? page.at(-1)!.id : null };
  };
  return { fetch, meta };
}
describe("consistent private baseline", () => {
  it("includes every catalog meet and complete canonical/identity pages", async () => {
    const { fetch } = fixture();
    const baseline = await collectPrivateRaceBaseline(fetch);
    expect(baseline.catalog).toHaveLength(940);
    expect(baseline.catalogCount).toBe(940);
    expect(baseline.canonicalRevision).toBe("11");
    expect(baseline.completeCollections).toHaveLength(5);
    expect(baseline.collectionCounts.athletes).toBe(205);
    expect(baseline.identityClaims.athletes).toHaveLength(2);
  });
  it("discards all pages on a concurrent revision change", async () => {
    const { fetch } = fixture();
    let calls = 0;
    await expect(collectPrivateRaceBaseline(async query => {
      const value = await fetch(query);
      return ++calls > 3 ? { ...value, revision: "12" } : value;
    })).rejects.toThrow(/changed/);
  });
  it("rejects incomplete counts, repeated cursors, and changed closing counts", async () => {
    const { fetch } = fixture();
    await expect(collectPrivateRaceBaseline(async query => {
      const value = await fetch(query);
      return query.get("collection") === "athletes" ? { ...value, rows: [], nextAfter: null } : value;
    })).rejects.toThrow(/incomplete/);
    let metadata = 0;
    await expect(collectPrivateRaceBaseline(async query => {
      const value = await fetch(query);
      if (!query.has("collection") && ++metadata === 2) return { ...value, counts: { ...value.counts, catalog: 939 } };
      return value;
    })).rejects.toThrow(/changed/);
    await expect(collectPrivateRaceBaseline(async query => {
      const value = await fetch(query);
      return query.get("after") ? { ...value, nextAfter: query.get("after") } : value;
    })).rejects.toThrow(/cursor/);
  });
});
