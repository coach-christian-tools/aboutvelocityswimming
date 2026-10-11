import { describe, it, expect } from "vitest";
import {
  athleteRankings,
  twelveMonthsAgo,
  type AthleteRankingOptions,
} from "../../src/components/collection/athlete-rankings";
import type { Race } from "../../src/components/collection/times-data";
import type { StandardSet } from "../../src/features/swim-resources/types/schema";
const standard: StandardSet = {
  id: "current",
  name: "Motivational",
  governingBody: "USA_Swimming",
  category: "motivational",
  seasonYears: "2024-2028",
  effectiveDate: "2024-09-01",
  expirationDate: "2028-08-31",
  cuts: {
    SCY: {
      F: Object.fromEntries(
        ["10&U", "11-12", "13-14"].map((age) => [
          age,
          Object.fromEntries(
            [
              ["50_FR", 30000],
              ["100_BR", 90000],
              ["200_IM", 150000],
              ["100_FL", 60000],
            ].map(([event, time]) => [
              `${event}_SCY`,
              {
                cutsByTier: [
                  { tierName: "A", timeMs: Number(time), timeDisplay: "" },
                ],
              },
            ]),
          ),
        ]),
      ),
    },
  },
};
const options: AthleteRankingOptions = {
  team: "VS",
  course: "SCY",
  period: "recent",
  today: "2026-10-10",
};
let sequence = 0;
function race(
  athleteId: string,
  event = "50_FR",
  time = 30000,
  extra: Partial<Race> = {},
): Race {
  return {
    id: String(sequence++),
    athleteId,
    event,
    time,
    date: "2026-06-01",
    course: "SCY",
    status: "OK",
    official: true,
    relay: false,
    team: "VS",
    gender: "F",
    ageAtSwim: 12,
    round: "F",
    meetId: "meet",
    meet: "Meet",
    ...extra,
  };
}
const names = new Map([
  ["a", "Anna"],
  ["b", "Beth"],
]);
function rank(
  rows: Race[],
  extra: Partial<AthleteRankingOptions> = {},
  set: StandardSet | null = standard,
) {
  return athleteRankings(rows, names, set, { ...options, ...extra });
}
function three(id: string, multiplier = 1) {
  return [
    race(id, "50_FR", 30000 * multiplier),
    race(id, "100_BR", 90000 * multiplier),
    race(id, "200_IM", 150000 * multiplier),
  ];
}
describe("team athlete rankings", () => {
  it("compares different events against A standards and averages only the best three", () => {
    const [a] = rank([
      ...three("a"),
      race("a", "100_FL", 30000),
      race("a", "100_FL", 40000),
    ])[0].athletes;
    expect(a.score).toBe(133.3);
    expect(a.events).toHaveLength(3);
    expect(a.events[0].race.event).toBe("100_FL");
    expect(a.events.find((e) => e.race.event === "100_FL")?.race.time).toBe(
      30000,
    );
  });
  it("sorts slower scores below faster scores without rewarding extra meet entries", () => {
    const result = rank([
      ...three("b", 1.1),
      ...three("a"),
      ...three("b", 1.2),
    ])[0].athletes;
    expect(result.map((a) => [a.id, a.score, a.rank])).toEqual([
      ["a", 100, 1],
      ["b", 90.9, 2],
    ]);
  });
  it("shares ranks at display precision and sorts tied names alphabetically", () => {
    const result = rank([...three("b", 1.00001), ...three("a")])[0].athletes;
    expect(result.map((a) => [a.name, a.rank])).toEqual([
      ["Anna", 1],
      ["Beth", 1],
    ]);
  });
  it("separates provisional scores and lists unscored names alphabetically", () => {
    const result = rank([race("a"), ...three("b", 1.5), race("c", "25_FR")])[0]
      .athletes;
    expect(result.map((a) => a.status)).toEqual([
      "ranked",
      "provisional",
      "unscored",
    ]);
    expect(result[1].rank).toBeUndefined();
    expect(result[1].score).toBe(100);
    expect(
      rank([race("b"), race("a")], {}, null)[0].athletes.map((a) => a.name),
    ).toEqual(["Anna", "Beth"]);
  });
  it("keeps course scores separate while taking demographics across courses", () => {
    const result = rank([
      ...three("a"),
      race("a", "100_BR", 100000, {
        date: "2026-09-01",
        course: "LCM",
        ageAtSwim: 13,
      }),
    ]);
    expect(result[0].ageGroup).toBe("13-14");
    expect(result[0].athletes[0].score).toBeNull();
  });
  it("uses inclusive calendar-month boundaries and excludes future swims", () => {
    expect(twelveMonthsAgo("2024-02-29")).toBe("2023-02-28");
    expect(rank([race("a", "50_FR", 30000, { date: "2025-10-09" })])).toEqual(
      [],
    );
    expect(
      rank([race("a", "50_FR", 30000, { date: "2025-10-10" })]),
    ).toHaveLength(1);
    expect(rank([race("a", "50_FR", 30000, { date: "2026-10-11" })])).toEqual(
      [],
    );
  });
  it("excludes previous teams in recent mode and restores historical affiliation in all-time mode", () => {
    const rows = [
      ...three("a"),
      race("a", "50_FR", 29000, { team: "OTHER", date: "2026-09-01" }),
    ];
    expect(rank(rows)).toEqual([]);
    expect(rank(rows, { period: "all" })[0].athletes[0].score).toBe(100);
  });
  it("preserves historical age groups and uses only the latest group in recent mode", () => {
    const rows = [
      ...three("a"),
      race("a", "50_FR", 29000, { ageAtSwim: 13, date: "2026-09-01" }),
    ];
    expect(rank(rows).map((g) => g.ageGroup)).toEqual(["13-14"]);
    expect(rank(rows, { period: "all" }).map((g) => g.ageGroup)).toEqual([
      "11-12",
      "13-14",
    ]);
  });
  it.each([{ team: "OTHER" }, { ageAtSwim: 13 }, { gender: "M" }])(
    "leaves latest-day conflicts unscored: %o",
    (conflict) => {
      const result = rank([race("a"), race("a", "100_BR", 90000, conflict)]);
      expect(result[0].athletes[0].score).toBeNull();
      expect(result[0].athletes[0].reasons.join(" ")).toContain("disagree");
    },
  );
  it.each([
    { official: null },
    { official: false },
    { status: "DQ" },
    { time: 0 },
    { time: NaN },
  ])("excludes invalid scoring results: %o", (invalid) => {
    expect(
      rank([race("a", "50_FR", 30000, invalid)])[0].athletes[0].score,
    ).toBeNull();
  });
  it.each([{ relay: true }, { relayLeg: 2 }, { split: true }])(
    "excludes relays and splits entirely: %o",
    (extra) => {
      expect(rank([race("a", "50_FR", 30000, extra)])).toEqual([]);
    },
  );
  it("uses 10-and-under standards for both younger display groups", () => {
    expect(
      rank([
        race("a", "50_FR", 30000, { ageAtSwim: 8 }),
        race("b", "50_FR", 30000, { ageAtSwim: 10 }),
      ]).map((g) => [g.ageGroup, g.athletes[0].score]),
    ).toEqual([
      ["8&U", 100],
      ["9-10", 100],
    ]);
  });
  it.each([
    { ageAtSwim: null },
    { ageAtSwim: 20 },
    { gender: "" },
    { gender: "X" },
  ])("keeps unsupported demographics visible and unscored: %o", (extra) => {
    expect(
      rank([race("a", "50_FR", 30000, extra)])[0].athletes[0].score,
    ).toBeNull();
  });
  it("requires team selection and ignores unsupported events", () => {
    expect(rank(three("a"), { team: "" })).toEqual([]);
    expect(
      rank([race("a", "25_FR")])[0].athletes[0].reasons.join(" "),
    ).toContain("no matching A standard");
  });
});
