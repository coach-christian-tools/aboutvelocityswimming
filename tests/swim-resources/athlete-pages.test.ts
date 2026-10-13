import { expect, it } from "vitest";
import { athletePages } from "@/lib/times/athlete-pages";
import type { AthleteRankingGroup } from "@/components/collection/athlete-rankings";
it("pages each scoring list and searches without changing cohort ranks", () => {
  const groups: AthleteRankingGroup[] = [
    {
      ageGroup: "11-12",
      label: "11–12",
      gender: "F",
      athletes: Array.from({ length: 60 }, (_, i) => ({
        id: String(i),
        name: "Athlete " + i,
        ageGroup: "11-12",
        gender: "F",
        latestDate: "2026-10-12",
        score: 100,
        rank: i + 1,
        status: "ranked",
        events: [],
        reasons: [],
      })),
    },
  ];
  expect(athletePages(groups, {})![0].athletes).toHaveLength(25);
  expect(athletePages(groups, {})![0].totals.ranked).toBe(60);
  expect(athletePages(groups, { offset: 25 })![0].athletes[0].rank).toBe(26);
  expect(
    athletePages(groups, { search: "Athlete 59" })![0].athletes[0].rank,
  ).toBe(60);
  expect(athletePages(groups, { groupGender: "M" })).toEqual([]);
});
