import { describe, expect, it } from "vitest";
import { reviewDependencies } from "@/components/collection/review-dependencies";

describe("review approval prerequisites", () => {
  const race = { path: "swims/race", after: { athleteId: "claire", meet: { id: "championship" } } };
  it("requires the athlete and meet from separately staged batches", () => {
    const refs = reviewDependencies([race, { ...race, path: "swims/another" }]);
    expect([...refs.athletes]).toEqual(["claire"]);
    expect([...refs.meets]).toEqual(["championship"]);
  });
  it("accepts prerequisites supplied in the same reviewed batch", () => {
    const refs = reviewDependencies([
      { path: "teams/club", after: {} },
      { path: "meets/championship", after: { hostTeamId: "club" } },
      { path: "athletes/claire", after: { teamId: "club" } }, race,
    ]);
    expect(Object.values(refs).every(set => set.size === 0)).toBe(true);
  });
  it("checks athlete clubs and meet hosts and venues", () => {
    const refs = reviewDependencies([
      { path: "athletes/claire", after: { teamId: "club" } },
      { path: "meets/championship", after: { hostTeamId: "club", venueId: "pool" } },
    ]);
    expect([...refs.teams]).toEqual(["club"]);
    expect([...refs.venues]).toEqual(["pool"]);
  });
});
