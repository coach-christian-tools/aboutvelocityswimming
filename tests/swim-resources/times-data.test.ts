import { describe, expect, it } from "vitest";
import {
  bestTimes,
  matches,
  normalizeRace,
  percentile,
  rankedTimes,
  type Race,
  initialFilters,
} from "../../src/components/collection/times-data";
const race = (id: string, time: number, extra: Partial<Race> = {}): Race => ({
  id,
  athleteId: id,
  time,
  date: "2026-05-01",
  event: "100_FR",
  course: "SCY",
  status: "OK",
  round: "F",
  team: "VS",
  official: true,
  relay: false,
  meetId: "meet",
  meet: "Meet",
  ...extra,
});
describe("IES performance comparisons", () => {
  it("uses complete cohorts, tie midpoints and faster-is-higher percentiles", () => {
    const races = [
      race("a", 50000),
      race("b", 50000),
      race("c", 60000),
      race("d", 70000),
    ];
    expect(percentile(50000, races)).toEqual({
      value: 75,
      faster: 0,
      tied: 2,
      slower: 2,
      count: 4,
      rank: 1,
    });
    expect(percentile(60000, races)?.value).toBe(37.5);
    expect(percentile(40000, races)?.value).toBe(100);
    expect(percentile(80000, races)?.value).toBe(0);
    expect(percentile(0, races)).toBeNull();
    expect(percentile(50000, [])).toBeNull();
  });
  it("keeps one best per athlete per event and course, excluding invalid swims", () => {
    const races = [
      race("a", 60000),
      race("a2", 50000, { athleteId: "a" }),
      race("a3", 55000, { athleteId: "a", course: "LCM" }),
      race("dq", 40000, { status: "DQ" }),
      race("relay", 30000, { relay: true }),
      race("bad", NaN),
      race("missing", 0),
    ];
    expect(bestTimes(races).map((r) => r.id)).toEqual(["a2", "a3"]);
    expect(percentile(50000, races)?.count).toBe(3);
  });
  it("preserves competition rank for ties", () => {
    expect(
      rankedTimes([race("a", 50000), race("b", 50000), race("c", 55000)]).map(
        (r) => r.rank,
      ),
    ).toEqual([1, 1, 3]);
  });
  it("filters comparison groups before selecting best times", () => {
    const filters = {
      ...initialFilters,
      year: "2026",
      team: "VS",
      round: "F",
      official: "official",
    };
    expect(matches(race("a", 50000), filters)).toBe(true);
    for (const extra of [
      { course: "LCM" },
      { team: "OTHER" },
      { date: "2025-01-01" },
      { official: null },
      { official: false },
      { round: "P" },
      { event: "200_FR" },
      { relay: true },
    ])
      expect(matches(race("a", 50000, extra), filters)).toBe(false);
  });
  it("does not infer official status or expose private athlete fields", () => {
    const result = normalizeRace({
      id: "a",
      athlete_id: "a",
      swim_date: "2026-05-01",
      data: {
        eventCode: "100_FR_SCY",
        timeMs: 50000,
        status: "OK",
        meet: { name: "Spring Meet" },
      },
    });
    expect(result.course).toBe("SCY");
    expect(result.event).toBe("100_FR");
    expect(result.official).toBeNull();
    expect(result.meetId).toBe("Spring Meet_2026-05-01");
  });
});
