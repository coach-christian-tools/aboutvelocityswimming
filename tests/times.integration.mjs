import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeRace,
  rankedTimes,
  matches,
  percentile,
  bestTimes,
  teamRecords,
  recordKey,
  dailyBestTimes,
  initialFilters,
} from "../src/components/collection/times-data.ts";
import { athleteRankings } from "../src/components/collection/athlete-rankings.ts";
const config = JSON.parse(
  execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
assert.equal(
  config.API_URL,
  "http://127.0.0.1:54321",
  "Times fixtures refuse hosted databases",
);
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  }),
  anon = createClient(config.API_URL, config.PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
const prefix = "ies-fixture-",
  team = prefix + "team",
  outside = prefix + "outside",
  unattached = prefix + "unattached",
  linked = prefix + "linked",
  meet = prefix + "meet";
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/Los_Angeles",
});
const races = [];
const writes = [
  {
    path: "teams/" + team,
    after: { name: "IES Fixture Club", lscCode: "IE", clubCode: "FIX" },
  },
  {
    path: "teams/" + outside,
    after: { name: "Outside Fixture Club", lscCode: "PN" },
  },
  {
    path: "teams/" + unattached,
    after: { name: "Unattached IES", lscCode: "IE", clubCode: "UNSC" },
  },
  { path: "teams/" + linked, after: { name: "Linked IES Club" } },
  {
    path: "knowledge_entries/" + prefix + "directory",
    after: {
      kind: "team",
      title: "Linked IES Club",
      sourceUrl: "https://example.test/ies-directory",
      lscId: "usa-lsc-ie",
      canonicalRecordPath: "teams/" + linked,
    },
  },
  { path: "meets/" + meet, after: { name: "IES fixture meet" } },
];
for (let i = 0; i < 7; i++)
  writes.push({
    path: "athletes/" + prefix + i,
    after: {
      id: prefix + i,
      name: { first: "Synthetic", last: String(i) },
      gender: i % 2 ? "M" : "F",
      teamId: team,
      status: "active",
    },
  });
function swim(id, athlete, time, extra = {}) {
  const data = {
    id: prefix + id,
    athleteId: prefix + athlete,
    eventCode: "100_FR_SCY",
    course: "SCY",
    timeMs: time,
    status: "OK",
    round: "F",
    isOfficial: true,
    isRelay: false,
    gender: athlete % 2 ? "M" : "F",
    ageAtSwim: 12,
    teamId: team,
    meet: { id: meet, name: "IES fixture meet", date: today },
    ...extra,
  };
  races.push({
    id: data.id,
    athlete_id: data.athleteId,
    swim_date: data.meet.date,
    data,
  });
  writes.push({ path: "swims/" + data.id, after: data });
}
swim("a", 0, 60000);
swim("b", 0, 59000);
swim("oldertie", 0, 59000, {
  meet: { id: meet, name: "IES fixture meet", date: "2026-10-01" },
});
swim("c", 2, 59000);
swim("d", 1, 57000);
swim("dq", 4, 50000, { status: "DQ" });
swim("zero", 4, 0, { status: "DQ" });
swim("unofficial", 4, 58000, { isOfficial: false, round: "P" });
swim("unattached", 3, 50000, { teamId: unattached });
swim("linked", 4, 55000, { teamId: linked });
swim("old", 0, 58000, {
  ageAtSwim: 14,
  meet: { id: meet, name: "IES fixture meet", date: "2025-09-01" },
});
swim("out", 3, 20000, { teamId: outside });
swim("fr50", 0, 29000, { eventCode: "50_FR_SCY" });
swim("im", 0, 130000, { eventCode: "200_IM_SCY" });
swim("scoretie-fr", 6, 59000);
swim("scoretie-50", 6, 29000, { eventCode: "50_FR_SCY" });
swim("scoretie-im", 6, 130000, { eventCode: "200_IM_SCY" });
swim("othercourse", 2, 65000, { course: "LCM", eventCode: "100_FR_LCM" });
swim("relay", 0, 60000, {
  isRelay: true,
  eventCode: "100_FR-R_SCY",
  ageGroup: "11-12",
  relay: { teamName: "Fixture relay", leg: null },
  gender: "X",
});
swim("relaytie", 2, 60000, {
  isRelay: true,
  eventCode: "100_FR-R_SCY",
  ageGroup: "11-12",
  relay: { teamName: "Fixture relay B", leg: null },
  gender: "X",
});
swim("leg", 0, 10000, {
  isRelay: true,
  eventCode: "100_FR-R_SCY",
  ageGroup: "11-12",
  relay: { teamName: "Fixture relay", leg: 1 },
});
swim("badleg", 0, 9000, {
  isRelay: true,
  eventCode: "100_FR-R_SCY",
  ageGroup: "11-12",
  relay: { teamName: "Malformed leg fixture", leg: "" },
});
swim("transfer", 5, 60000);
swim("transferaway", 5, 59000, {
  teamId: outside,
  course: "LCM",
  eventCode: "100_FR_LCM",
  meet: { id: meet, name: "IES fixture meet", date: today },
  ageAtSwim: 13,
});
const cut = {
  cutsByTier: [{ tierName: "A", timeMs: 60000, timeDisplay: "1:00.00" }],
};
const standard = {
  id: prefix + "standard",
  governingBody: "USA_Swimming",
  category: "motivational",
  name: "Fixture benchmark",
  effectiveDate: "2026-01-01",
  expirationDate: "2028-01-01",
  cuts: {
    SCY: {
      F: {
        "11-12": { "100_FR_SCY": cut, "50_FR_SCY": cut, "200_IM_SCY": cut },
      },
      M: { "11-12": { "100_FR_SCY": cut } },
    },
  },
};
writes.push({ path: "standards/" + standard.id, after: standard });
const collected = await admin.rpc("collect_records", { reads: [], writes });
assert.ifError(collected.error);
const query = async (kind, input = {}) => {
  const { data, error } = await anon.rpc("ies_times_query", {
    query_kind: kind,
    input,
  });
  assert.ifError(error);
  return data;
};
const normalized = races.map((row) => ({
    ...normalizeRace({
      ...row,
      data: {
        ...row.data,
        teamName:
          row.data.teamId === team
            ? "IES Fixture Club"
            : "Outside Fixture Club",
      },
    }),
    athleteName: "Synthetic " + row.athlete_id.slice(prefix.length),
  })),
  ies = normalized.filter((r) => r.team === team);
try {
  await test("full-cohort ranking, ties, name search and pagination match domain helpers", async () => {
    for (const mode of ["bests", "performances"])
      for (const genders of [["F"], ["M"], ["F", "M"]]) {
        const filters = {
          ...initialFilters,
          team,
          genders,
          mode,
          ageGroups: ["11-12"],
        };
        const expected = rankedTimes(
          ies.filter((r) => matches(r, filters)),
          mode,
        );
        const result = await query("rankings", { ...filters, limit: 1 });
        assert.equal(result.total, expected.length);
        assert.equal(result.rows[0]?.race.id, expected[0]?.race.id);
        assert.equal(result.rows[0]?.rank, expected[0]?.rank);
        const next = await query("rankings", {
          ...filters,
          offset: 1,
          limit: 1,
        });
        assert.equal(next.rows[0]?.rank, expected[1]?.rank);
      }
    for (const extra of [
      { year: "2026" },
      { official: "official" },
      { round: "P", official: "unofficial" },
    ]) {
      const filters = {
        ...initialFilters,
        team,
        genders: ["F", "M"],
        ...extra,
      };
      const expected = rankedTimes(ies.filter((r) => matches(r, filters)));
      const result = await query("rankings", filters);
      assert.deepEqual(
        result.rows.map((r) => [r.race.id, r.rank]),
        expected.map((r) => [r.race.id, r.rank]),
      );
    }
    const result = await query("rankings", {
      ...initialFilters,
      team,
      genders: ["F", "M"],
      search: "Synthetic 2",
    });
    assert.ok(result.rows.every((r) => r.race.athleteId === prefix + "2"));
    assert.equal(
      result.rows[0].rank,
      rankedTimes(
        ies.filter((r) =>
          matches(r, { ...initialFilters, team, genders: ["F", "M"] }),
        ),
      ).find((r) => r.race.athleteId === prefix + "2").rank,
    );
  });
  await test("complete percentiles and record ties match domain helpers", async () => {
    for (const basis of ["bests", "swims"]) {
      const filters = {
        ...initialFilters,
        team,
        genders: ["F", "M"],
        ageGroups: ["11-12"],
      };
      const eligible = ies.filter(
        (r) => matches(r, filters) && r.status === "OK" && r.time > 0,
      );
      const cohort = basis === "bests" ? bestTimes(eligible) : eligible;
      const result = await query("analysis", {
        ...filters,
        raceId: prefix + "b",
        basis,
      });
      assert.deepEqual(result.stats, percentile(59000, cohort));
    }
    const result = await query("records", { team });
    const actual = teamRecords(result.races, team),
      expected = teamRecords(ies, team);
    assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort());
    assert.deepEqual(
      actual.get(recordKey("SCY", "11-12", "100_FR-R", "X")).map((r) => r.id),
      expected.get(recordKey("SCY", "11-12", "100_FR-R", "X")).map((r) => r.id),
    );
  });
  await test("profiles, histories and score cohorts preserve complete athlete semantics", async () => {
    const profile = await query("profile", { athleteId: prefix + "0" });
    assert.equal(
      profile.count,
      normalized.filter((r) => r.athleteId === prefix + "0" && !r.relay).length,
    );
    assert.deepEqual(
      profile.pbs.map((r) => r.id).sort(),
      bestTimes(normalized.filter((r) => r.athleteId === prefix + "0"))
        .map((r) => r.id)
        .sort(),
    );
    const history = await query("athlete_history", {
      athleteId: prefix + "0",
      historyEvent: "100_FR_SCY",
      limit: 1,
    });
    assert.deepEqual(
      history.points.map((r) => r.id),
      dailyBestTimes(
        normalized.filter(
          (r) =>
            r.athleteId === prefix + "0" &&
            !r.relay &&
            r.event === "100_FR" &&
            r.course === "SCY",
        ),
      ).map((r) => r.id),
    );
    const names = new Map(
      Array.from({ length: 7 }, (_, i) => [prefix + i, "Synthetic " + i]),
    );
    for (const period of ["recent", "all"])
      for (const course of ["SCY", "LCM", "SCM"]) {
        const result = await query("athletes", { team, course, period });
        const options = { team, course, period, today };
        assert.deepEqual(
          result.groups,
          athleteRankings(normalized, names, standard, options),
        );
      }
    const hideStandard = await admin.rpc("collect_records", {
      reads: [],
      writes: [
        {
          path: "standards/" + standard.id,
          after: {
            ...standard,
            effectiveDate: "2099-01-01",
            expirationDate: "2100-01-01",
          },
        },
      ],
    });
    assert.ifError(hideStandard.error);
    const unscored = await query("athletes", {
      team,
      course: "SCY",
      period: "recent",
    });
    assert.equal(unscored.standardAvailable, false);
    assert.deepEqual(
      unscored.groups,
      athleteRankings(normalized, names, null, {
        team,
        course: "SCY",
        period: "recent",
        today,
      }),
    );
    const restoreStandard = await admin.rpc("collect_records", {
      reads: [],
      writes: [{ path: "standards/" + standard.id, after: standard }],
    });
    assert.ifError(restoreStandard.error);
  });
  await test("public teams and meet results exclude outside teams and private fields", async () => {
    const facets = await query("facets");
    assert.ok(facets.teams.some(([id]) => id === team));
    assert.ok(!facets.teams.some(([id]) => id === outside));
    assert.ok(facets.teams.some(([id]) => id === unattached));
    assert.ok(facets.teams.some(([id]) => id === linked));
    const all = await query("rankings", {
      ...initialFilters,
      genders: ["F", "M"],
      mode: "performances",
      limit: 100,
    });
    assert.ok(all.rows.some(({ race }) => race.id === prefix + "unattached"));
    assert.ok(all.rows.some(({ race }) => race.id === prefix + "linked"));
    assert.ok(!all.rows.some(({ race }) => race.team === outside));
    const result = await query("meet_results", { meetId: meet, limit: 100 });
    assert.equal(
      result.total,
      normalized.filter(
        (r) => [team, unattached, linked].includes(r.team) && !r.relay,
      ).length,
    );
    assert.ok(
      result.rows.every(({ race }) =>
        [team, unattached, linked].includes(race.team),
      ),
    );
    assert.ok(!JSON.stringify(result).includes("dob"));
    const denied = await anon
      .from("public_times_teams")
      .insert({ id: "forged", name: "forged", lsc_code: "IE" });
    assert.ok(denied.error);
    const privateRows = await anon.from("teams").select("id");
    assert.deepEqual(privateRows.data, []);
  });
  await test("approved team changes update the projection and corrections update rankings", async () => {
    const change = await admin.rpc("collect_records", {
      reads: [],
      writes: [
        {
          path: "teams/" + team,
          after: {
            name: "Renamed Fixture Club",
            lscCode: "IE",
            clubCode: "FIX",
          },
        },
        {
          path: "swims/" + prefix + "b",
          after: {
            ...races.find((r) => r.id === prefix + "b").data,
            timeMs: 61000,
          },
        },
      ],
    });
    assert.ifError(change.error);
    const facets = await query("facets");
    assert.equal(
      facets.teams.find(([id]) => id === team)[1],
      "Renamed Fixture Club",
    );
    const result = await query("rankings", { ...initialFilters, team });
    assert.equal(
      result.rows.find((r) => r.race.athleteId === prefix + "0").race.id,
      prefix + "old",
    );
    const reclassified = await admin.rpc("collect_records", {
      reads: [],
      writes: [
        {
          path: "teams/" + linked,
          after: { name: "Moved Fixture Club", lscCode: "PN" },
        },
      ],
    });
    assert.ifError(reclassified.error);
    assert.ok(
      !(await query("facets")).teams.some(([id]) => id === linked),
      "An explicit outside-IES LSC takes priority over a legacy directory link",
    );
  });
} finally {
  const people = await admin
    .from("athletes")
    .select("person_id")
    .like("id", prefix + "%");
  assert.ifError(people.error);
  const reversed = [...writes]
    .reverse()
    .map((w) => ({ path: w.path, after: null }));
  const cleanup = await admin.rpc("collect_records", {
    reads: [],
    writes: [
      ...reversed.filter((w) => !w.path.startsWith("teams/")),
      ...people.data.map((p) => ({
        path: "people/" + p.person_id,
        after: null,
      })),
      ...reversed.filter((w) => w.path.startsWith("teams/")),
    ],
  });
  assert.ifError(cleanup.error);
}
