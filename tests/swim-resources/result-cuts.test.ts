import { describe, expect, it } from "vitest";
import { resultCuts } from "@/components/collection/result-cuts";
import type { Race } from "@/components/collection/times-data";
import type { StandardSet } from "@/features/swim-resources/types/schema";
const race: Race = {
  id: "r",
  athleteId: "a",
  date: "2026-05-10",
  event: "100_FR",
  course: "SCY",
  time: 55000,
  status: "OK",
  round: "F",
  team: "t",
  gender: "F",
  ageAtSwim: 14,
  official: true,
  relay: false,
  meetId: "m",
  meet: "Meet",
};
function standard(
  name: string,
  category: StandardSet["category"],
  age = "13-14",
  event = "100_FR_SCY",
): StandardSet {
  return {
    id: name,
    name,
    governingBody: "USA_Swimming",
    category,
    seasonYears: "2026",
    effectiveDate: "2026-01-01",
    expirationDate: "2026-12-31",
    cuts: {
      SCY: {
        F: {
          [age]: {
            [event]: {
              cutsByTier:
                category === "motivational"
                  ? [
                      { tierName: "B", timeMs: 65000, timeDisplay: "1:05.00" },
                      { tierName: "AA", timeMs: 55000, timeDisplay: "55.00" },
                      { tierName: "AAAA", timeMs: 50000, timeDisplay: "50.00" },
                    ]
                  : [
                      {
                        tierName: "Qualifying",
                        timeMs: 55000,
                        timeDisplay: "55.00",
                      },
                    ],
            },
          },
        },
      },
    },
  };
}
const motivational = standard("Motivational", "motivational");
const nationals = standard(
  "USA Swimming National Championships",
  "championship",
  "Open",
);
describe("result cut chips", () => {
  it("shows the highest achieved motivational tier then national cuts, including exact ties", () => {
    expect(
      resultCuts(race, [nationals, motivational]).map((cut) => cut.label),
    ).toEqual(["AA", "Nats"]);
  });
  it("requires the matching course, gender, age, event, and edition dates", () => {
    for (const change of [
      { course: "LCM" },
      { gender: "M" },
      { ageAtSwim: 15 },
      { ageAtSwim: null },
      { event: "50_FR" },
      { date: "2025-12-31" },
      { date: "2027-01-01" },
    ])
      expect(resultCuts({ ...race, ...change }, [motivational])).toEqual([]);
    expect(resultCuts({ ...race, ageAtSwim: null }, [nationals])).toHaveLength(
      1,
    );
  });
  it("rejects invalid, flagged, excluded and intermediate split results", () => {
    for (const change of [
      { status: "DQ" },
      { time: 0 },
      { time: NaN },
      { moderationStatus: "flagged" as const },
      { calculationEligible: false },
      { split: true },
    ])
      expect(
        resultCuts({ ...race, ...change }, [motivational, nationals]),
      ).toEqual([]);
    expect(
      resultCuts({ ...race, split: true, resultOrigin: "relay_leadoff" }, [
        motivational,
      ]),
    ).toHaveLength(1);
  });
  it("does not turn local or single-age standards into national/age-group achievements", () => {
    expect(
      resultCuts(race, [
        { ...nationals, governingBody: "LSC" },
        { ...motivational, standardType: "para" },
        standard("Single age", "motivational", "14"),
      ]),
    ).toEqual([]);
  });
  it("matches full relays using the reported relay age group and relay event", () => {
    const set = standard(
      "Relay motivational",
      "motivational",
      "13-14",
      "200_FR-R_SCY",
    );
    expect(
      resultCuts(
        { ...race, relay: true, event: "200_FR-R", relayAgeGroup: "13-14" },
        [set],
      ),
    ).toHaveLength(1);
    expect(
      resultCuts({ ...race, relay: true, event: "200_FR-R" }, [set]),
    ).toEqual([]);
  });
  it("distinguishes bonus cuts and keeps one chip for overlapping editions", () => {
    const bonus = standard("USA Swimming Futures", "championship", "18&U");
    bonus.cuts.SCY!.F!["18&U"]!["100_FR_SCY"].cutsByTier = [
      { tierName: "Bonus", timeMs: 56000, timeDisplay: "56.00" },
    ];
    expect(
      resultCuts(race, [bonus, { ...bonus, id: "duplicate" }]),
    ).toMatchObject([{ label: "Futures", tier: "Bonus" }]);
  });
});
