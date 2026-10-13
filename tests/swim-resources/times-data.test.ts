import { describe, expect, it } from "vitest";
import {
  relayLineupCoverage,
  matchesAgeGroup,
  relayMemberName,
  changeResultCategory,
  changeTimesCourse,
  timesEvents,
  bestTimes,
  dailyBestTimes,
  teamRecords,
  recordKey,
  recordEvents,
  recordAgeGroups,
  validPerformance,
  resultName,
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
  gender: "F",
  meetId: "meet",
  meet: "Meet",
  ...extra,
});
describe("IES performance comparisons", () => {
  it("displays canonical team names while filtering by stable identity", () => {
    const result = normalizeRace({
      id: "result",
      athlete_id: "athlete",
      swim_date: "2026-09-19",
      data: {
        eventCode: "100_FR_SCY",
        teamId: "swimcloud_8185",
        teamName: "Tri-City Channel Cats",
        gender: "F",
      },
    });
    expect(result.teamName).toBe("Tri-City Channel Cats");
    expect(matches(result, { ...initialFilters, team: "swimcloud_8185" })).toBe(
      true,
    );
    expect(
      matches(result, { ...initialFilters, team: "Tri-City Channel Cats" }),
    ).toBe(false);
  });
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

describe("athlete progress", () => {
  it("plots the fastest valid swim each day, keeping events and courses separate", () => {
    const swims = [
      race("final", 51000, { athleteId: "a" }),
      race("prelim", 50000, { athleteId: "a", round: "P" }),
      race("dq", 49000, { athleteId: "a", status: "DQ" }),
      race("next", 49500, { athleteId: "a", date: "2026-05-02" }),
      race("meters", 57000, { athleteId: "a", course: "LCM" }),
      race("other-event", 25000, { athleteId: "a", event: "50_FR" }),
    ];
    expect(dailyBestTimes(swims).map((r) => r.id)).toEqual([
      "prelim",
      "meters",
      "other-event",
      "next",
    ]);
    expect(swims).toHaveLength(6);
  });
});

describe("IES demographic filters and results mode", () => {
  it("includes individual swims in every enclosing category with inclusive boundaries", () => {
    for (const ageAtSwim of [13, 14, 18, 25]) {
      const swim = race("older", 50000, { ageAtSwim });
      expect(matchesAgeGroup(swim, "13&O")).toBe(true);
      expect(matchesAgeGroup(swim, "Open")).toBe(true);
    }
    expect(
      matchesAgeGroup(race("young", 50000, { ageAtSwim: 12 }), "13&O"),
    ).toBe(false);
    expect(
      matchesAgeGroup(race("young", 50000, { ageAtSwim: 10 }), "10&U"),
    ).toBe(true);
    expect(matchesAgeGroup(race("unknown", 50000), "Open")).toBe(false);
    expect(
      matchesAgeGroup(race("older", 50000, { ageAtSwim: 14 }), "13-14"),
    ).toBe(true);
  });
  it("includes relay categories only when their whole range fits the selected category", () => {
    const relay = race("relay", 120000, {
      relay: true,
      relayAgeGroup: "13-14",
    });
    expect(matchesAgeGroup(relay, "13&O")).toBe(true);
    expect(matchesAgeGroup(relay, "Open")).toBe(true);
    expect(matchesAgeGroup(relay, "12&U")).toBe(false);
    expect(matchesAgeGroup({ ...relay, relayAgeGroup: "11-14" }, "13&O")).toBe(
      false,
    );
    expect(matchesAgeGroup({ ...relay, relayAgeGroup: "13&O" }, "13-14")).toBe(
      false,
    );
    expect(matchesAgeGroup({ ...relay, relayAgeGroup: "" }, "Open")).toBe(
      false,
    );
  });
  it("shows relay members as first name and last initial", () => {
    expect(relayMemberName("Avery Example")).toBe("Avery E.");
    expect(relayMemberName("  Mary Jane O’Connor  ")).toBe("Mary O.");
    expect(relayMemberName("Avery")).toBe("Avery");
    expect(relayMemberName("")).toBe("Unreported");
  });
  it("selects bests within race-time age groups, including multiple groups", () => {
    const swims = [
      race("young-prelim", 61000, {
        athleteId: "a",
        ageAtSwim: 12,
        gender: "F",
      }),
      race("young-final", 60000, {
        athleteId: "a",
        ageAtSwim: 12,
        gender: "F",
      }),
      race("older", 50000, { athleteId: "a", ageAtSwim: 14, gender: "F" }),
      race("male", 49000, { ageAtSwim: 12, gender: "M" }),
      race("missing", 48000),
    ];
    const filters = { ...initialFilters, genders: ["F"], ageGroups: ["11-12"] };
    const included = swims.filter((r) => matches(r, filters));
    expect(rankedTimes(included).map(({ race }) => race.id)).toEqual([
      "young-final",
    ]);
    expect(
      rankedTimes(included, "performances").map(({ race, rank }) => [
        race.id,
        rank,
      ]),
    ).toEqual([
      ["young-final", 1],
      ["young-prelim", 2],
    ]);
    expect(
      rankedTimes(
        swims.filter((r) =>
          matches(r, { ...filters, ageGroups: ["11-12", "13-14"] }),
        ),
      ).map(({ race }) => race.id),
    ).toEqual(["older"]);
    expect(
      swims.filter((r) => matches(r, { ...initialFilters, genders: [] })),
    ).toHaveLength(5);
  });
  it("uses inclusive age boundaries and excludes missing age from specific groups", () => {
    const filters = { ...initialFilters, ageGroups: ["9-10"] };
    for (const ageAtSwim of [9, 10])
      expect(matches(race("a", 50000, { ageAtSwim }), filters)).toBe(true);
    for (const ageAtSwim of [8, 11, null, undefined])
      expect(matches(race("a", 50000, { ageAtSwim }), filters)).toBe(false);
  });
  it("normalizes only reported race demographics without inferring from names", () => {
    const row = {
      id: "a",
      athlete_id: "a",
      swim_date: "2026-05-01",
      data: { gender: "F", ageAtSwim: 12 },
    };
    expect(normalizeRace(row)).toMatchObject({ gender: "F", ageAtSwim: 12 });
    expect(
      normalizeRace({ ...row, data: { gender: "unknown", ageAtSwim: "12" } }),
    ).toMatchObject({ gender: "", ageAtSwim: null });
  });
  it("ranks all eligible performances with ties, excluding DQs and relays", () => {
    const swims = [
      race("a", 50000),
      race("a2", 50000, { athleteId: "a" }),
      race("b", 51000),
      race("dq", 40000, { status: "DQ" }),
      race("relay", 30000, { relay: true }),
    ];
    expect(rankedTimes(swims, "performances").map(({ rank }) => rank)).toEqual([
      1, 1, 3,
    ]);
  });
});

describe("team records", () => {
  it("shares record holders across enclosing categories without duplicate relays", () => {
    const individual = race("teen", 50000, { ageAtSwim: 14 });
    const relay = race("relay", 120000, {
      relay: true,
      relayAgeGroup: "13-14",
      event: "200_FR-R",
    });
    const records = teamRecords([individual, relay, relay], "VS");
    for (const group of ["13-14", "13&O", "Open"]) {
      expect(
        records.get(recordKey("SCY", group, "100_FR", "F"))?.map((r) => r.id),
      ).toEqual(["teen"]);
      expect(
        records.get(recordKey("SCY", group, "200_FR-R", "F"))?.map((r) => r.id),
      ).toEqual(["relay"]);
    }
  });
  it("separates team affiliation at the swim, course, age group, event and gender", () => {
    const swims = [
      race("young", 60000, { athleteId: "a", gender: "F", ageAtSwim: 12 }),
      race("older", 50000, { athleteId: "a", gender: "F", ageAtSwim: 14 }),
      race("male", 59000, { gender: "M", ageAtSwim: 12 }),
      race("meters", 63000, { gender: "F", ageAtSwim: 12, course: "LCM" }),
      race("other-event", 29000, {
        gender: "F",
        ageAtSwim: 12,
        event: "50_FR",
      }),
      race("other-team", 40000, {
        athleteId: "a",
        gender: "F",
        ageAtSwim: 12,
        team: "OTHER",
      }),
      race("no-age", 30000, { gender: "F" }),
      race("no-gender", 30000, { ageAtSwim: 12, gender: undefined }),
      race("dq", 30000, { gender: "F", ageAtSwim: 12, status: "DQ" }),
      race("relay", 30000, { gender: "F", ageAtSwim: 12, relay: true }),
    ];
    const records = teamRecords(swims, "VS");
    expect(records.size).toBe(14);
    expect(
      records.get(recordKey("SCY", "11-12", "100_FR", "F"))?.map((r) => r.id),
    ).toEqual(["young"]);
    expect(
      records.get(recordKey("SCY", "13-14", "100_FR", "F"))?.map((r) => r.id),
    ).toEqual(["older"]);
    expect(teamRecords(swims, "").size).toBe(0);
  });
  it("keeps tied holders, uses first record date, and ignores repeated equal swims by the same athlete", () => {
    const swims = [
      race("slow", 51000, { athleteId: "a", gender: "F", ageAtSwim: 8 }),
      race("later", 50000, {
        athleteId: "a",
        gender: "F",
        ageAtSwim: 8,
        date: "2026-06-01",
      }),
      race("first", 50000, { athleteId: "a", gender: "F", ageAtSwim: 8 }),
      race("tie", 50000, { athleteId: "b", gender: "F", ageAtSwim: 8 }),
    ];
    expect(
      teamRecords(swims, "VS")
        .get(recordKey("SCY", "8&U", "100_FR", "F"))
        ?.map((r) => r.id),
    ).toEqual(["first", "tie"]);
    expect(swims).toHaveLength(4);
  });
  it("includes course-specific events and events without a recorded result", () => {
    expect(recordEvents("SCY", [])).toContain("1650_FR");
    expect(recordEvents("SCY", [])).toContain("25_BK");
    expect(recordEvents("LCM", [])).toContain("1500_FR");
    expect(recordEvents("LCM", [])).not.toContain("100_IM");
    expect(recordEvents("SCM", [])).toContain("100_IM");
    expect(
      recordEvents("SCM", [
        race("rare", 10000, { course: "SCM", event: "25_FR" }),
      ]),
    ).toContain("25_FR");
  });
});

describe("team relay records", () => {
  const relay = (id: string, time: number, extra: Partial<Race> = {}) =>
    race(id, time, {
      relay: true,
      event: "100_FR-R",
      relayName: "Velocity A",
      relayAgeGroup: "8&U",
      gender: "F",
      ageAtSwim: 6,
      ...extra,
    });
  it("normalizes whole freestyle and medley relay event codes separately from individual events", () => {
    const row = {
      id: "r",
      athlete_id: "a",
      swim_date: "2026-05-01",
      data: {
        eventCode: "100_FR_R_SCY",
        isRelay: true,
        ageGroup: "8&U",
        gender: "F",
        timeMs: 60000,
        status: "OK",
        relay: { teamName: "Velocity A" },
      },
    };
    const whole = normalizeRace(row);
    expect(whole).toMatchObject({
      event: "100_FR-R",
      course: "SCY",
      relayName: "Velocity A",
      relayAgeGroup: "8&U",
      relayLeg: null,
    });
    expect(validPerformance(whole)).toBe(true);
    expect(
      normalizeRace({
        ...row,
        data: { ...row.data, eventCode: "100_MED-R_SCY" },
      }).event,
    ).toBe("100_MED-R");
    const split = normalizeRace({
      ...row,
      data: { ...row.data, relay: { teamName: "Velocity A", leg: 1 } },
    });
    expect(validPerformance(split)).toBe(false);
  });
  it("uses the relay event age group, never an individual member age, and ranks every team performance", () => {
    const swims = [
      relay("r1", 60000),
      relay("r2", 62000),
      relay("tie", 60000, { relayName: "Velocity B" }),
      relay("other-age", 50000, { relayAgeGroup: "9-10" }),
      relay("other-team", 40000, { team: "OTHER" }),
      relay("other-gender", 40000, { gender: "M" }),
      relay("other-course", 40000, { course: "LCM" }),
      relay("leg", 10000, { relayLeg: 1 }),
      relay("dq", 10000, { status: "DQ" }),
      relay("missing-group", 10000, { relayAgeGroup: "" }),
      race("individual", 20000, { event: "100_FR", gender: "F", ageAtSwim: 8 }),
    ];
    const filters = {
      ...initialFilters,
      relay: true,
      event: "100_FR-R",
      team: "VS",
      genders: ["F"],
      ageGroups: ["8&U"],
      mode: "performances" as const,
    };
    const included = swims.filter((r) => matches(r, filters));
    expect(
      rankedTimes(included, "performances", true).map(({ race, rank }) => [
        race.id,
        rank,
      ]),
    ).toEqual([
      ["r1", 1],
      ["tie", 1],
      ["r2", 3],
    ]);
    expect(
      teamRecords(swims, "VS")
        .get(recordKey("SCY", "8&U", "100_FR-R", "F"))
        ?.map((r) => r.id),
    ).toEqual(["r1", "tie"]);
    expect(bestTimes(swims).map((r) => r.id)).toEqual(["individual"]);
  });
  it("includes relay event rows and extra reported relay age categories", () => {
    expect(recordEvents("SCY", [])).toEqual(
      expect.arrayContaining([
        "100_FR-R",
        "100_MED-R",
        "200_FR-R",
        "400_MED-R",
      ]),
    );
    expect(recordEvents("LCM", [])).toContain("800_FR-R");
    expect(
      recordAgeGroups([relay("r", 60000, { relayAgeGroup: "10&U" })]),
    ).toContainEqual(["10&U", "10 & Under"]);
    expect(resultName(relay("r", 60000), new Map([["r", "One swimmer"]]))).toBe(
      "Velocity A",
    );
    expect(
      resultName(
        relay("r", 60000, { relayName: "A", teamName: "Velocity Swimming" }),
        new Map(),
      ),
    ).toBe("Velocity Swimming A");
  });
});

describe("relay details and lead-off eligibility", () => {
  it("preserves ordered public members and validated splits without leaking import evidence", () => {
    const result = normalizeRace({
      id: "relay",
      athlete_id: "legacy-member",
      swim_date: "2026-05-01",
      data: {
        isRelay: true,
        eventCode: "200_MED-R_SCY",
        timeMs: 150000,
        status: "OK",
        splitCoverage: "partial",
        members: [
          {
            leg: 2,
            name: "Second",
            athleteId: "b",
            stroke: "BR",
            timeMs: 40000,
            privateRegistration: "secret",
          },
          {
            leg: 1,
            name: "First",
            athleteId: "a",
            stroke: "BK",
            leadOffEligible: true,
          },
          { leg: 8, name: "Invalid" },
        ],
        splits: [
          { distance: 50, cumulativeMs: 30000, rawMarker: "private" },
          { distance: 100, cumulativeMs: 70000, lapMs: 40000 },
          { distance: -1, cumulativeMs: 1000 },
        ],
        sourceRecords: ["private"],
      },
    });
    expect(result.athleteId).toBe("");
    expect(result.members).toEqual([
      {
        leg: 1,
        name: "First",
        athleteId: "a",
        stroke: "BK",
        leadOffEligible: true,
      },
      { leg: 2, name: "Second", athleteId: "b", stroke: "BR", timeMs: 40000 },
    ]);
    expect(result.splits).toEqual([
      { distance: 50, cumulativeMs: 30000 },
      { distance: 100, cumulativeMs: 70000, lapMs: 40000 },
    ]);
    expect(result.splitCoverage).toBe("partial");
    expect(result.lineupCoverage).toBe("partial");
    expect(result).not.toHaveProperty("sourceRecords");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("does not calculate missing lap times and labels unvalidated distances unavailable", () => {
    const result = normalizeRace({
      id: "individual",
      athlete_id: "a",
      swim_date: "2026-05-01",
      data: {
        eventCode: "100_FR_SCY",
        splits: [
          { distance: 50, cumulativeMs: 25000 },
          { distance: 100, cumulativeMs: 52000 },
        ],
      },
    });
    expect(result.splitCoverage).toBe("unavailable");
    expect(result.splits?.every((split) => split.lapMs === undefined)).toBe(
      true,
    );
  });
  it("admits a promoted individual lead-off while excluding relay totals and flying-start splits", () => {
    const relay = race("relay", 220000, {
      relay: true,
      athleteId: "",
      event: "400_FR-R",
      status: "DQ",
    });
    const leadOff = race("leadoff", 52000, {
      athleteId: "a",
      resultOrigin: "relay_leadoff",
      parentRelayResultId: relay.id,
      ageAtSwim: 12,
    });
    const flying = race("flying", 47000, {
      athleteId: "a",
      split: true,
      ageAtSwim: 12,
    });
    expect(bestTimes([relay, leadOff, flying])).toEqual([leadOff]);
    expect(
      teamRecords([relay, leadOff, flying], "VS").get(
        recordKey("SCY", "11-12", "100_FR", "F"),
      ),
    ).toEqual([leadOff]);
    expect(leadOff.status).toBe("OK");
  });
  it("resets incompatible event, age and Mixed filters when switching result categories", () => {
    const relays = changeResultCategory(
      { ...initialFilters, ageGroups: ["11-12"] },
      true,
    );
    expect(relays).toMatchObject({
      relay: true,
      event: "200_FR-R",
      mode: "performances",
      ageGroups: [],
    });
    const individuals = changeResultCategory(
      { ...relays, genders: ["F", "X"] },
      false,
    );
    expect(individuals).toMatchObject({
      relay: false,
      event: "100_FR",
      mode: "bests",
      genders: ["F"],
    });
    expect(changeResultCategory(relays, false, true).event).toBe("");
    expect(
      changeTimesCourse({ ...initialFilters, event: "100_IM" }, "LCM").event,
    ).not.toBe("100_IM");
    expect(
      changeTimesCourse({ ...initialFilters, event: "100_FR" }, "LCM").event,
    ).toBe("100_FR");
    expect(timesEvents("LCM", true)).not.toContain("100_FR-R");
    expect(timesEvents("SCY", true)).toContain("100_FR-R");
    expect(timesEvents("LCM", false)).not.toContain("500_FR");
    expect(timesEvents("LCM", false)).toContain("400_FR");
  });
});

describe("public relay lineup coverage", () => {
  it("distinguishes complete linked lineups from missing members or athlete links", () => {
    const members = [1, 2, 3, 4].map((leg) => ({ leg, name: "Member " + leg }));
    expect(relayLineupCoverage(members)).toBe("partial");
    expect(
      relayLineupCoverage(
        members.map((member) => ({
          ...member,
          athleteId: "athlete" + member.leg,
        })),
      ),
    ).toBe("complete");
    expect(relayLineupCoverage(members.slice(0, 2))).toBe("partial");
    expect(relayLineupCoverage([])).toBe("unavailable");
    expect(
      relayLineupCoverage([
        { leg: 1, name: "First" },
        { leg: 1, name: "Duplicate" },
        { leg: 2, name: "" },
        { leg: 5, name: "Invalid" },
      ]),
    ).toBe("partial");
  });
});
