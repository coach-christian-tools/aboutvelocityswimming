import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
swim("raw-timing-split", 4, 10000, { isSplit: true });
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
// Whole relays do not create an athlete swim for any flying-start member.
const nativeRelays = [];
function relayResult(id, extra = {}) {
  const data = {
    id: prefix + id,
    eventCode: "200_FR-R_SCY",
    course: "SCY",
    distance: 200,
    stroke: "FR",
    timeMs: 120000,
    status: "OK",
    round: "F",
    isRelay: true,
    isOfficial: true,
    teamId: team,
    gender: "X",
    ageGroup: "11-12",
    meet: { id: meet, name: "IES fixture meet", date: today },
    relayName: "Fixture team relay " + id,
    relay: { teamName: "Fixture team relay " + id },
    members: Array.from({ length: 4 }, (_, i) => ({
      leg: i + 1,
      athleteId: prefix + i,
      name: "Synthetic " + i,
      gender: i % 2 ? "M" : "F",
      stroke: "FR",
      timeMs: 30000,
      sourceObservation: { dob: "private-member-birth-date" },
    })),
    splits: [50, 100, 150, 200].map((distance) => ({
      distance,
      cumulativeMs: distance * 600,
      lapMs: 30000,
      sourceObservation: "private-split-evidence",
    })),
    splitCoverage: "complete",
    sourceObservation: { evidence: "private-relay-evidence" },
    ...extra,
  };
  nativeRelays.push({ id: data.id, athlete_id: "", swim_date: today, data });
  writes.push({ path: "relay_results/" + data.id, after: data });
  return data;
}
relayResult("native-relay");
relayResult("native-relay-tie");
relayResult("medley-relay", {
  eventCode: "200_MED-R_SCY",
  stroke: "IM",
  gender: "F",
  ageGroup: "13-14",
  members: [
    { leg: 1, athleteId: prefix + "0", name: "Synthetic 0", stroke: "BK" },
  ],
  splits: [],
  splitCoverage: "unavailable",
});
const dqRelay = relayResult("native-dq-relay", {
  status: "DQ",
  timeMs: 115000,
  splitCoverage: "partial",
  members: [
    {
      leg: 1,
      athleteId: prefix + "0",
      name: "Synthetic 0",
      stroke: "FR",
      timeMs: 28000,
    },
  ],
  splits: [{ distance: 50, cumulativeMs: 28000 }],
});
swim("verified-leadoff", 0, 28000, {
  eventCode: "50_FR_SCY",
  distance: 50,
  stroke: "FR",
  resultOrigin: "relay_leadoff",
  parentRelayResultId: dqRelay.id,
  leadOffVerification: {
    verified: true,
    flatStart: true,
    timingVerified: true,
    leadOffStatus: "OK",
    sourceUrl: "https://example.test/results",
  },
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
const normalized = [...races, ...nativeRelays].map((row) => ({
    ...normalizeRace({
      ...row,
      data: {
        ...row.data,
        splits: row.data.splits ?? [],
        teamName:
          row.data.teamId === team
            ? "IES Fixture Club"
            : "Outside Fixture Club",
      },
    }),
    athleteName:
      row.data.isRelay && row.data.relay?.leg == null
        ? ""
        : "Synthetic " + row.athlete_id.slice(prefix.length),
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
  await test("enclosing age categories agree across rankings, analysis, meet results and records", async () => {
    const filters = { ...initialFilters, team, ageGroups: ["13&O"] };
    const rankings = await query("rankings", filters);
    assert.deepEqual(
      rankings.rows.map(({ race }) => race.id),
      [prefix + "old"],
    );
    const analysis = await query("analysis", {
      ...filters,
      raceId: prefix + "old",
      basis: "bests",
    });
    assert.equal(analysis.stats.count, 1);
    const meetResults = await query("meet_results", {
      ...filters,
      meetId: meet,
    });
    assert.deepEqual(
      meetResults.rows.map(({ race }) => race.id),
      [prefix + "old"],
    );
    const relayFilters = {
      ...filters,
      relay: true,
      event: "200_MED-R",
      mode: "performances",
    };
    for (const kind of ["rankings", "meet_results"]) {
      const result = await query(kind, { ...relayFilters, meetId: meet });
      assert.deepEqual(
        result.rows.map(({ race }) => race.id),
        [prefix + "medley-relay"],
      );
      const tooYoung = await query(kind, {
        ...relayFilters,
        ageGroups: ["12&U"],
        meetId: meet,
      });
      assert.equal(tooYoung.total, 0);
    }
    const recordResults = await query("records", { team });
    assert.equal(
      new Set(recordResults.races.map((race) => race.id)).size,
      recordResults.races.length,
    );
    const records = teamRecords(recordResults.races, team);
    for (const group of ["13-14", "13&O", "Open"]) {
      assert.deepEqual(
        records
          .get(recordKey("SCY", group, "100_FR", "F"))
          .map((race) => race.id),
        group === "Open"
          ? [prefix + "old", prefix + "unofficial"]
          : [prefix + "old"],
      );
      assert.deepEqual(
        records
          .get(recordKey("SCY", group, "200_MED-R", "F"))
          .map((race) => race.id),
        [prefix + "medley-relay"],
      );
    }
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
    const meetRaces = normalized.filter((r) =>
      [team, unattached, linked].includes(r.team),
    );
    assert.equal(result.meet.count, meetRaces.length);
    for (const extra of [
      { relay: true },
      { relay: true, genders: ["X"], ageGroups: ["11-12"] },
      { relay: true, event: "200_FR-R" },
      { genders: ["F"], year: "2026", official: "official" },
      { round: "P", official: "unofficial" },
      { team },
      { course: "SCM" },
    ]) {
      const expected = meetRaces.filter((race) =>
        matches(race, {
          ...initialFilters,
          event: "",
          course: "",
          team: "",
          genders: ["F", "M", "X"],
          ...extra,
        }),
      );
      const filtered = await query("meet_results", {
        meetId: meet,
        offset: 0,
        limit: 100,
        ...extra,
      });
      assert.equal(filtered.total, expected.length);
      assert.deepEqual(
        filtered.rows.map(({ race }) => race.id).sort(),
        expected.map((race) => race.id).sort(),
      );
      assert.equal(filtered.meet.count, meetRaces.length);
    }
    const missingMeet = await query("meet_results", {
      meetId: prefix + "missing-meet",
      relay: true,
      offset: 0,
      limit: 25,
    });
    assert.deepEqual(missingMeet, { rows: [], total: 0, meet: null });

    const denied = await anon
      .from("public_times_teams")
      .insert({ id: "forged", name: "forged", lsc_code: "IE" });
    assert.ok(denied.error);
    const privateRows = await anon.from("teams").select("id");
    assert.deepEqual(privateRows.data, []);
  });
  await test("team relay totals, ties, lineups, splits and athlete participation are public once per race", async () => {
    const result = await query("rankings", {
      ...initialFilters,
      team,
      event: "200_FR-R",
      relay: true,
      genders: ["X"],
    });
    assert.equal(result.total, 2);
    assert.deepEqual(
      result.rows.map(({ rank }) => rank),
      [1, 1],
    );
    assert.ok(result.rows.every(({ race }) => race.athleteId === ""));
    assert.deepEqual(
      result.rows[0].race.members.map((m) => m.leg),
      [1, 2, 3, 4],
    );
    assert.equal(result.rows[0].race.splits.length, 4);
    assert.equal(result.rows[0].race.splitCoverage, "complete");
    assert.equal(result.rows[0].race.lineupCoverage, "complete");
    assert.ok(!JSON.stringify(result).includes("private-"));
    const mixedMeet = await query("meet_results", {
      meetId: meet,
      relay: true,
      genders: ["X"],
      limit: 100,
    });
    assert.ok(mixedMeet.rows.every(({ race }) => race.gender === "X"));
    assert.ok(mixedMeet.rows.some(({ race }) => race.status === "DQ"));
    const participation = await query("athlete_relays", {
      athleteId: prefix + "0",
      limit: 2,
    });
    assert.equal(participation.total, 4);
    assert.equal(participation.rows.length, 2);
    const next = await query("athlete_relays", {
      athleteId: prefix + "0",
      offset: 2,
      limit: 2,
    });
    assert.equal(
      new Set([...participation.rows, ...next.rows].map(({ race }) => race.id))
        .size,
      4,
    );
    assert.equal(
      (await query("profile", { athleteId: prefix + "0" })).relayCount,
      4,
    );
    const partial = await query("race", { raceId: prefix + "medley-relay" });
    assert.equal(partial.total, 1);
    assert.equal(partial.rows[0].race.members.length, 1);
    assert.equal(partial.rows[0].race.lineupCoverage, "partial");
    assert.equal(partial.rows[0].race.splitCoverage, "unavailable");
    const facets = await query("facets");
    assert.ok(facets.relayEvents.includes("200_MED-R"));
    assert.ok(facets.relayAges.includes("13-14"));
    assert.deepEqual((await anon.from("relay_results").select("id")).data, []);
    assert.ok(
      (
        await anon
          .from("public_relay_results")
          .insert({ id: "forged", team_id: team, data: {} })
      ).error,
    );
  });
  await test("independently verified lead-offs remain PB eligible after a teammate DQ", async () => {
    const profile = await query("profile", { athleteId: prefix + "0" });
    const leadoff = profile.pbs.find((race) => race.event === "50_FR");
    assert.equal(leadoff.id, prefix + "verified-leadoff");
    assert.equal(leadoff.relay, false);
    assert.equal(leadoff.resultOrigin, "relay_leadoff");
    assert.equal(leadoff.parentRelayResultId, dqRelay.id);
    assert.equal(
      (await query("race", { raceId: dqRelay.id })).rows[0].race.status,
      "DQ",
    );
    const base = races.find((r) => r.id === leadoff.id).data;
    for (const change of [
      {
        leadOffVerification: {
          ...base.leadOffVerification,
          timingVerified: false,
        },
      },
      { athleteId: prefix + "1" },
      { isSplit: true },
    ]) {
      const denied = await admin.rpc("collect_records", {
        reads: [],
        writes: [
          {
            path: "swims/" + prefix + "forged-leadoff",
            after: { ...base, id: prefix + "forged-leadoff", ...change },
          },
        ],
      });
      assert.ok(denied.error);
    }
    const duplicate = await admin.rpc("collect_records", {
      reads: [],
      writes: [
        {
          path: "swims/" + prefix + "duplicate-leadoff",
          after: { ...base, id: prefix + "duplicate-leadoff" },
        },
      ],
    });
    assert.equal(duplicate.error?.code, "23505");
    assert.ok(!JSON.stringify(profile).includes("leadOffVerification"));
    assert.ok(!profile.pbs.some((race) => race.id === prefix + "native-relay"));
    const precomputed = await anon
      .from("athlete_bests")
      .select("data")
      .eq("athlete_id", prefix + "4")
      .eq("event_code", "100_FR_SCY")
      .single();
    assert.ifError(precomputed.error);
    assert.notEqual(precomputed.data.data.swimId, prefix + "raw-timing-split");
    const splitProfile = await query("profile", { athleteId: prefix + "4" });
    assert.ok(
      !splitProfile.pbs.some((race) => race.id === prefix + "raw-timing-split"),
    );
  });
  await test("relay staging compares supplied baseline reads and approval inserts relay parents first", async () => {
    const staff = createClient(config.API_URL, config.PUBLISHABLE_KEY, {
      auth: { persistSession: false },
    });
    assert.ifError(
      (
        await staff.auth.signInWithPassword({
          email: "coach@velocity-swimming.com",
          password: "Velocity-local-test-2026!",
        })
      ).error,
    );
    const token = "local-relay-collector-" + crypto.randomUUID();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    execFileSync(
      "docker",
      [
        "exec",
        "supabase_db_aboutvelocityswimming",
        "psql",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `insert into private.collection_workers(name,token_hash,divisions) values('Relay test collector','${tokenHash}',array['times']);`,
      ],
      { stdio: "pipe" },
    );
    const batchIds = [];
    const base = {
      division: "times",
      scope: "Relay fixture",
      sourceUrl: "https://example.test/relay/" + tokenHash,
      capturedAt: new Date().toISOString(),
      coverage: "partial",
      evidence: { text: "Official relay fixture" },
    };
    const stage = (batch) =>
      anon.rpc("stage_collection", {
        worker_token: token,
        batch: { ...base, ...batch },
      });
    try {
      const before = races.find((r) => r.id === prefix + "a").data;
      const stale = await stage({
        reads: [
          {
            path: "swims/" + before.id,
            before: { ...before, timeMs: before.timeMs + 1 },
          },
        ],
        writes: [
          {
            path: "swims/" + before.id,
            after: {
              ...before,
              splits: [{ distance: 100, cumulativeMs: before.timeMs }],
            },
          },
        ],
      });
      assert.equal(stale.error?.code, "40001");
      const relay = { ...dqRelay, id: prefix + "review-relay" };
      const lead = {
        ...races.find((r) => r.id === prefix + "verified-leadoff").data,
        id: prefix + "review-leadoff",
        parentRelayResultId: relay.id,
      };
      const reverseWrites = [
        { path: "swims/" + lead.id, after: lead },
        { path: "relay_results/" + relay.id, after: relay },
      ];
      const staged = await stage({ writes: reverseWrites });
      assert.ifError(staged.error);
      batchIds.push(staged.data);
      const repeated = await stage({ writes: reverseWrites });
      assert.equal(repeated.data, staged.data);
      assert.equal(
        (
          await admin
            .from("collection_batches")
            .select("review_priority")
            .eq("id", staged.data)
            .single()
        ).data.review_priority,
        2,
      );
      assert.equal((await query("race", { raceId: relay.id })).total, 0);
      assert.ifError(
        (
          await staff.rpc("review_collection", {
            batch_id: staged.data,
            decision: "approved",
            note: "Verified fixture",
          })
        ).error,
      );
      writes.push(
        { path: "relay_results/" + relay.id, after: relay },
        { path: "swims/" + lead.id, after: lead },
      );
      assert.equal(
        (await query("race", { raceId: lead.id })).rows[0].race
          .parentRelayResultId,
        relay.id,
      );
      const raceBefore = races.find((r) => r.id === prefix + "a").data;
      const bestsBefore = await anon
        .from("athlete_bests")
        .select("event_code,data")
        .eq("athlete_id", prefix + "0")
        .order("event_code");
      assert.ifError(bestsBefore.error);
      const detailed = {
        ...raceBefore,
        splits: [
          { distance: 50, cumulativeMs: 30000, lapMs: 30000 },
          { distance: 100, cumulativeMs: 60000, lapMs: 30000 },
        ],
        splitCoverage: "complete",
        sourceObservation: { evidence: "private-approved-split-evidence" },
      };
      const detailsBatch = await stage({
        reads: [{ path: "swims/" + raceBefore.id, before: raceBefore }],
        writes: [{ path: "swims/" + raceBefore.id, after: detailed }],
      });
      assert.ifError(detailsBatch.error);
      batchIds.push(detailsBatch.data);
      assert.ifError(
        (
          await staff.rpc("review_collection", {
            batch_id: detailsBatch.data,
            decision: "approved",
            note: "Split details verified",
          })
        ).error,
      );
      const publishedDetails = (await query("race", { raceId: raceBefore.id }))
        .rows[0].race;
      assert.equal(publishedDetails.splits.length, 2);
      assert.equal(publishedDetails.splitCoverage, "complete");
      assert.ok(
        !JSON.stringify(publishedDetails).includes(
          "private-approved-split-evidence",
        ),
      );
      const bestsAfter = await anon
        .from("athlete_bests")
        .select("event_code,data")
        .eq("athlete_id", prefix + "0")
        .order("event_code");
      assert.ifError(bestsAfter.error);
      assert.deepEqual(bestsAfter.data, bestsBefore.data);
      const faster = {
        ...detailed,
        timeMs: 57000,
        splits: [
          { distance: 50, cumulativeMs: 30000, lapMs: 30000 },
          { distance: 100, cumulativeMs: 57000, lapMs: 27000 },
        ],
      };
      const timeBatch = await stage({
        reads: [{ path: "swims/" + raceBefore.id, before: detailed }],
        writes: [{ path: "swims/" + raceBefore.id, after: faster }],
      });
      assert.ifError(timeBatch.error);
      batchIds.push(timeBatch.data);
      assert.ifError(
        (
          await staff.rpc("review_collection", {
            batch_id: timeBatch.data,
            decision: "approved",
            note: "Time correction verified",
          })
        ).error,
      );
      const updatedBest = await anon
        .from("athlete_bests")
        .select("data")
        .eq("athlete_id", prefix + "0")
        .eq("event_code", "100_FR_SCY")
        .single();
      assert.ifError(updatedBest.error);
      assert.equal(updatedBest.data.data.bestTimeMs, 57000);
      assert.equal(updatedBest.data.data.swimId, raceBefore.id);
      assert.ifError(
        (
          await admin.rpc("collect_records", {
            reads: [],
            writes: [{ path: "swims/" + raceBefore.id, after: raceBefore }],
          })
        ).error,
      );
    } finally {
      if (batchIds.length) {
        assert.ifError(
          (
            await admin
              .from("collection_reviews")
              .delete()
              .in("batch_id", batchIds)
          ).error,
        );
        assert.ifError(
          (await admin.from("collection_batches").delete().in("id", batchIds))
            .error,
        );
      }
      execFileSync(
        "docker",
        [
          "exec",
          "supabase_db_aboutvelocityswimming",
          "psql",
          "-U",
          "postgres",
          "-c",
          `delete from private.collection_workers where token_hash='${tokenHash}';`,
        ],
        { stdio: "pipe" },
      );
    }
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
