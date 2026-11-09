import { expect, it } from "vitest";
import {
  archiveFilters,
  archiveMonths,
  archiveTreemap,
} from "@/lib/observatory";

it("validates shared filters and pagination without accepting arbitrary RPC inputs", () => {
  expect(
    archiveFilters(
      new URLSearchParams(
        "year=2018&course=SCY&search=+Smith+&athleteOffset=120&secret=anything",
      ),
    ),
  ).toEqual({
    year: "2018",
    course: "SCY",
    search: "Smith",
    team: "",
    meet: "",
    athlete: "",
    athleteOffset: 120,
    resultOffset: 0,
  });
  for (const invalid of [
    "year=18",
    "course=meters",
    "resultOffset=-1",
    "athleteOffset=NaN",
    "athleteOffset=1.5",
    "search=" + "a".repeat(101),
  ]) {
    expect(() => archiveFilters(new URLSearchParams(invalid))).toThrow();
  }
});

it("tiles fill the available area with proportions preserved and no overlaps", () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({
    id: String(i),
    count: (i + 1) ** 2,
  }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const tiles = archiveTreemap(rows, 1000, 540);
  expect(tiles).toHaveLength(rows.length);
  expect(tiles.reduce((sum, t) => sum + t.w * t.h, 0)).toBeCloseTo(540000);
  tiles.forEach((a, i) => {
    expect((a.w * a.h) / 540000).toBeCloseTo(a.count / total);
    for (const b of tiles.slice(i + 1)) {
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      expect(Math.min(overlapX, overlapY)).toBeLessThan(1e-8);
    }
  });
  expect(archiveTreemap([{ count: 0 }])).toEqual([]);
});

it("keeps empty months in career fingerprints and growth charts", () => {
  expect(archiveMonths("2018-11-24", "2019-03-02")).toEqual([
    "2018-11",
    "2018-12",
    "2019-01",
    "2019-02",
    "2019-03",
  ]);
  expect(archiveMonths(null, null)).toEqual([]);
  expect(archiveMonths("2025-01", "2024-01")).toEqual([]);
});
