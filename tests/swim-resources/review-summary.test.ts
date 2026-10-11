import { describe, expect, it } from "vitest";
import { athleteProfiles, raceSummary, reviewStats, reviewIssues } from "@/components/collection/review-summary";

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

describe("compact review attention counts", () => {
  it("counts additions, updates and removals, flagging each attention record once", () => {
    expect(
      reviewStats(
        [
          {
            path: "knowledge_entries/new",
            after: { gaps: ["Sources disagree", "Missing website"] },
          },
          { path: "knowledge_entries/existing", after: { title: "Updated" } },
          { path: "knowledge_entries/removed", after: null },
        ],
        [
          { path: "knowledge_entries/existing", before: { title: "Original" } },
          {
            path: "knowledge_entries/removed",
            before: { gaps: ["Unconfirmed"] },
          },
        ],
      ),
    ).toEqual({
      total: 3,
      added: 1,
      updated: 1,
      removed: 1,
      issues: 2,
      attention: 2,
    });
  });
  it("handles null snapshots and structured source gaps", () => {
    expect(reviewIssues({ gaps: [{ source: "Unresolved" }] })).toEqual([
      "See source evidence",
    ]);
    expect(reviewIssues(null)).toEqual([]);
    expect(
      reviewStats(
        [{ path: "athletes/new", after: { name: "Sam" } }],
        [{ path: "athletes/new", before: null }],
      ),
    ).toMatchObject({ added: 1, attention: 0 });
    expect(reviewStats([], [])).toEqual({
      total: 0,
      added: 0,
      updated: 0,
      removed: 0,
      issues: 0,
      attention: 0,
    });
  });
});
