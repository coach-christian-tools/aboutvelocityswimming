import { describe, expect, it } from "vitest";
import { batchDependencies, orderReviewBatches, recordDependencies } from "@/components/collection/review-order";
import type { ReviewWrite } from "@/components/collection/review-summary";
const batch = (id: string, writes: ReviewWrite[], received_at = "2026-10-11T00:00:00Z", status = "pending") => ({ id, scope: id, received_at, status, writes });

describe("batch approval dependencies", () => {
  it("places an older dependent swim after a newer meet and its team, across the entire queue", () => {
    const batches = [
      batch("swim", [{ path: "swims/s", after: { athleteId: "a", meet: { id: "m" } } }], "2026-10-09"),
      ...Array.from({ length: 25 }, (_, i) => batch(`other-${i}`, [{ path: `knowledge_entries/${i}`, after: {} }], "2026-10-10")),
      batch("meet", [{ path: "meets/m", after: { teamId: "t" } }], "2026-10-11"),
      batch("team", [{ path: "teams/t", after: {} }], "2026-10-12"),
    ];
    const result = orderReviewBatches(batches, new Set(["athletes/a"]));
    const ids = result.batches.map(b => b.id);
    expect(ids.indexOf("team")).toBeLessThan(ids.indexOf("meet"));
    expect(ids.indexOf("meet")).toBeLessThan(ids.indexOf("swim"));
    expect(result.blockers.swim).toEqual(['meets/m: approve “meet” first']);
    expect(result.blockers.team).toEqual([]);
  });
  it("uses the live approved parent and clears blocking after approval", () => {
    const swim = batch("swim", [{ path: "swims/s", after: { meet: { id: "m" } } }]);
    expect(orderReviewBatches([swim], new Set()).blockers.swim[0]).toContain("missing prerequisite");
    expect(orderReviewBatches([swim], new Set(["meets/m"])).blockers.swim).toEqual([]);
  });
  it("allows parents in the same batch while checking their external prerequisites", () => {
    const mixed = batch("mixed", [
      { path: "swims/s", after: { meet: { id: "m" }, athleteId: "a" } },
      { path: "meets/m", after: { hostTeamId: "t", venueId: "v" } },
      { path: "athletes/a", after: { teamId: "t" } },
    ]);
    expect(batchDependencies(mixed)).toEqual(["teams/t", "venues/v"]);
  });
  it("explains held prerequisites and handles cycles without dropping batches", () => {
    const held = batch("held meet", [{ path: "meets/m", after: {} }], "2026-10-11", "held");
    const swim = batch("swim", [{ path: "swims/s", after: { meet: { id: "m" } } }]);
    expect(orderReviewBatches([swim, held], new Set()).blockers.swim[0]).toContain("(held)");
    const cyclic = batch("cyclic", [{ path: "meets/m", after: { venueId: "missing" } }]);
    expect(orderReviewBatches([swim, cyclic], new Set()).batches).toHaveLength(2);
  });
  it("handles removals and nullable foreign keys without inventing dependencies", () => {
    expect(recordDependencies({ path: "swims/s", after: null })).toEqual([]);
    expect(recordDependencies({ path: "meets/m", after: { venueId: null } })).toEqual([]);
  });
});
