import { describe, expect, it } from "vitest";
import { athleteProfiles, raceSummary } from "@/components/collection/review-summary";

describe("import review summaries", () => {
  const race = { athleteId: "a", distance: 100, stroke: "IM", timeMs: 59730, course: "SCY", status: "OK", meet: { name: "Sprint Meet", date: "2026-09-19" } };
  it("resolves batch names before approval without requiring a published athlete", () => {
    const profiles = athleteProfiles([{ path: "athletes/a", after: { name: { first: "Sam", last: "Hobson" } } }], [], {}, true);
    expect(raceSummary(race, profiles)).toMatchObject({ swimmer: "Sam Hobson", event: "100 IM", time: "59.73", course: "SCY" });
  });
  it("keeps current and proposed identity changes distinct", () => {
    const reads = [{ path: "athletes/a", before: { name: "Original name" } }];
    const writes = [{ path: "athletes/a", after: { name: "Corrected name" } }];
    const current = { a: { name: "Later live name" } };
    expect(raceSummary(race, athleteProfiles(writes, reads, current, false)).swimmer).toBe("Original name");
    expect(raceSummary(race, athleteProfiles(writes, reads, current, true)).swimmer).toBe("Corrected name");
  });
  it("expands the stored stroke codes into readable events", () => {
    for (const [stroke, name] of [["FR", "Freestyle"], ["BK", "Backstroke"], ["BR", "Breaststroke"], ["FL", "Butterfly"]]) {
      expect(raceSummary({ ...race, stroke }, {}).event).toBe(`100 ${name}`);
    }
  });
  it("uses an existing profile and formats minute boundaries", () => {
    expect(raceSummary({ ...race, timeMs: 61230 }, { a: { name: "Existing swimmer" } })).toMatchObject({ swimmer: "Existing swimmer", time: "1:01.23" });
  });
  it("does not present disqualifications or missing identities as valid results", () => {
    expect(raceSummary({ ...race, status: "DQ" }, {})).toMatchObject({ swimmer: "Name unavailable (a)", time: "DQ" });
    expect(raceSummary({ distance: 100, status: "OK" }, {}).swimmer).toBe("Missing athlete link");
  });
});
