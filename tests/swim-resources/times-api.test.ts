import { describe, it, expect } from "vitest";
import { parseTimesQuery, timesUrl } from "@/components/collection/times-api";
import {
  timesBucket,
  timesExpiry,
  clearTimesCache,
  timesCache,
  timesGeneration,
} from "@/components/collection/times-cache";
import {
  groupedEvents,
  initialFilters,
  matches,
  type Race,
} from "@/components/collection/times-data";
describe("IES times requests", () => {
  it("defaults to female bests and canonicalizes multiple selections", () => {
    expect(
      parseTimesQuery(new URLSearchParams("view=rankings")).input,
    ).toMatchObject({ genders: ["F"], mode: "bests", offset: 0, limit: 25 });
    expect(
      parseTimesQuery(new URLSearchParams("view=rankings&genders=M,F,M")).input
        .genders,
    ).toEqual(["F", "M"]);
    expect(timesUrl("rankings", { genders: ["M", "F"], team: "a&b" })).toBe(
      timesUrl("rankings", { team: "a&b", genders: ["F", "M"] }),
    );
  });
  it("rejects unsupported views, invalid filters and unbounded pages", () => {
    for (const query of [
      "view=private",
      "view=rankings&genders=",
      "view=rankings&genders=unknown",
      "view=rankings&offset=-1",
      "view=rankings&limit=101",
      "view=rankings&course=bad",
      "view=rankings&relay=1",
      "view=profile",
      "view=athlete_relays",
      "view=race",
    ])
      expect(() => parseTimesQuery(new URLSearchParams(query))).toThrow();
  });
  it("expires cached data at a shared minute boundary and clears browser data after writes", () => {
    expect(timesBucket(120001)).toBe(2);
    expect(timesExpiry(timesBucket(120001))).toBe(180000);
    timesCache.set("fixture", { expiresAt: 180000 });
    const generation = timesGeneration;
    clearTimesCache();
    expect(timesCache.size).toBe(0);
    expect(timesGeneration).toBe(generation + 1);
  });
  it("groups strokes and sorts distances numerically", () => {
    const groups = groupedEvents([
      ["1000_FR", "1000"],
      ["100_BR", "100 breast"],
      ["50_FR", "50"],
      ["200_IM", "200 IM"],
      ["100_MED-R", "relay"],
      ["100_FR", "100"],
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "Freestyle",
      "Breaststroke",
      "Individual Medley",
      "Medley Relays",
    ]);
    expect(groups[0].options.map(([id]) => id)).toEqual([
      "50_FR",
      "100_FR",
      "1000_FR",
    ]);
  });
  it("female is the default while both sexes exclude mixed and unknown genders", () => {
    const race = {
      relay: false,
      course: "SCY",
      event: "100_FR",
      date: "2026-01-01",
      gender: "M",
    } as Race;
    expect(matches(race, initialFilters)).toBe(false);
    expect(matches(race, { ...initialFilters, genders: ["F", "M"] })).toBe(
      true,
    );
    expect(
      matches(
        { ...race, gender: "X" },
        { ...initialFilters, genders: ["F", "M"] },
      ),
    ).toBe(false);
  });
});

describe("relay result requests", () => {
  it("supports bounded athlete relay participation and individual race detail lookups", () => {
    expect(
      parseTimesQuery(
        new URLSearchParams("view=athlete_relays&athleteId=a&offset=25"),
      ).input,
    ).toMatchObject({ athleteId: "a", offset: 25, limit: 25 });
    expect(
      parseTimesQuery(new URLSearchParams("view=race&raceId=relay-a")).input,
    ).toMatchObject({ raceId: "relay-a" });
    expect(
      parseTimesQuery(
        new URLSearchParams(
          "view=rankings&relay=true&genders=X&mode=performances",
        ),
      ).input,
    ).toMatchObject({ relay: true, genders: ["X"], mode: "performances" });
  });
});
