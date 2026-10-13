import { createHash } from "node:crypto";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import {
  normalizeRace,
  rankedTimes,
  initialFilters,
  matches,
  bestTimes,
  dailyBestTimes,
  percentile,
  teamRecords,
} from "../../src/components/collection/times-data.ts";
import { athleteRankings } from "../../src/components/collection/athlete-rankings.ts";
import { athletePages } from "../../src/lib/times/athlete-pages.ts";
const base = process.env.VELOCITY_TEST_URL ?? "http://127.0.0.1:3001";
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Browser fixtures require a local frontend",
);
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/Los_Angeles",
});
const events = [
  ["50_FR", 30000],
  ["100_FR", 60000],
  ["100_BR", 90000],
  ["200_IM", 150000],
];
const standard = {
  name: "Browser verified standards",
  cuts: {
    SCY: {
      F: {
        "11-12": Object.fromEntries(
          events.map(([event, time]) => [
            event + "_SCY",
            { cutsByTier: [{ tierName: "A", timeMs: time }] },
          ]),
        ),
      },
    },
  },
};
const names = new Map(
  Array.from({ length: 29 }, (_, i) => [
    "athlete" + i,
    i === 28
      ? "Provisional Fixture"
      : `Swimmer ${String(i).padStart(2, "0")} Fixture`,
  ]),
);
function race(id, athleteId, event, time, extra = {}) {
  return {
    ...normalizeRace({
      id,
      athlete_id: athleteId,
      swim_date: today,
      data: {
        eventCode: event + "_SCY",
        course: "SCY",
        timeMs: time,
        status: "OK",
        round: "F",
        isOfficial: true,
        isRelay: false,
        ageAtSwim: 12,
        gender: "F",
        teamId: "VS",
        teamName: "Velocity Swimming",
        meet: { id: "meet", name: "Fixture meet" },
      },
    }),
    athleteName: names.get(athleteId) ?? athleteId,
    ...extra,
  };
}
const races = [...names].flatMap(([id], i) =>
  (i === 28 ? events.slice(0, 1) : events).map(([event, time], j) =>
    race(id + "_" + j, id, event, Math.round(time * (1 + i / 100))),
  ),
);
races.push(
  race("old", "athlete0", "100_FR", 65000, { date: "2025-10-01" }),
  race("male", "male", "100_FR", 55000, {
    gender: "M",
    athleteName: "Male Fixture",
  }),
);
const relayMembers = [
  {
    leg: 1,
    athleteId: "athlete0",
    name: names.get("athlete0"),
    stroke: "FR",
    timeMs: 28000,
    leadOffEligible: true,
  },
  {
    leg: 2,
    athleteId: "athlete1",
    name: names.get("athlete1"),
    stroke: "FR",
    timeMs: 31000,
  },
  { leg: 3, name: "Unlinked Fixture", stroke: "FR" },
  { leg: 4, athleteId: "athlete3", name: names.get("athlete3"), stroke: "FR" },
];
races.push(
  ...Array.from({ length: 26 }, (_, index) =>
    race("relay" + index, "", "200_FR-R", 120000 + index * 1000, {
      relay: true,
      gender: "X",
      relayAgeGroup: "11-12",
      relayName:
        index === 0 ? "Mixed fixture relay" : "Mixed fixture relay " + index,
      members: relayMembers,
      splitCoverage: "partial",
      splits: [
        { distance: 50, cumulativeMs: 28000, lapMs: 28000 },
        { distance: 100, cumulativeMs: 59000, lapMs: 31000 },
      ],
    }),
  ),
);
races.push(
  race("girls-relay", "", "200_MED-R", 130000, {
    relay: true,
    gender: "F",
    relayAgeGroup: "11-12",
    relayName: "Girls fixture relay",
    members: relayMembers,
  }),
  race("boys-relay", "", "200_MED-R", 125000, {
    relay: true,
    gender: "M",
    relayAgeGroup: "11-12",
    relayName: "Boys fixture relay",
    members: relayMembers,
  }),
  race("mixed-only-event", "", "300_FR-R", 180000, {
    relay: true,
    gender: "X",
    relayAgeGroup: "13-15",
    relayName: "Mixed-only fixture relay",
    members: relayMembers,
  }),
  race("relay-dq", "", "200_FR-R", 110000, {
    relay: true,
    gender: "X",
    relayAgeGroup: "11-12",
    relayName: "Disqualified fixture relay",
    status: "DQ",
    members: relayMembers,
    splitCoverage: "unavailable",
  }),
);
races.push(
  race("leadoff", "athlete0", "50_FR", 28000, {
    resultOrigin: "relay_leadoff",
    parentRelayResultId: "relay-dq",
    splits: [{ distance: 50, cumulativeMs: 28000, lapMs: 28000 }],
    splitCoverage: "complete",
  }),
);
races.find((race) => race.id === "athlete0_1").splits = [
  { distance: 50, cumulativeMs: 29000, lapMs: 29000 },
  { distance: 100, cumulativeMs: 60000, lapMs: 31000 },
];
races.find((race) => race.id === "athlete0_1").splitCoverage = "complete";
const browser = await chromium.launch({ headless: true });
const errors = [];
async function setup({ failure = false, expiry = false } = {}) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
  const calls = [];
  let expired = false;
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/public_"))
      throw new Error("Unexpected bulk public download");
  });
  await page.route("**/api/times?*", async (route) => {
    const q = new URL(route.request().url()).searchParams,
      view = q.get("view");
    calls.push(q);
    if (failure && view === "rankings") {
      failure = false;
      return route.fulfill({ status: 503, json: { error: "Fixture failure" } });
    }
    const input = Object.fromEntries(q);
    input.offset = Number(q.get("offset") ?? 0);
    input.limit = 25;
    input.ageGroups = (q.get("ageGroups") ?? "").split(",").filter(Boolean);
    const filters = {
      ...initialFilters,
      ...input,
      genders:
        q.get("genders")?.split(",") ?? (view === "rankings" ? ["F"] : []),
      relay: q.get("relay") === "true",
    };
    let data;
    const own = races.filter(
      (r) => r.athleteId === q.get("athleteId") && !r.relay,
    );
    if (view === "facets")
      data = {
        teams: [
          ["VS", "Velocity Swimming"],
          ["unattached", "Unattached IES"],
        ],
        events: [...events.map(([e]) => e), "100_BK", "100_FL"],
        years: ["2026", "2025"],
        relayAges: [],
      };
    if (view === "rankings") {
      const all = rankedTimes(
        races.filter((r) => matches(r, filters)),
        filters.mode,
        filters.relay,
      ).filter(
        ({ race }) =>
          !q.get("search") ||
          (race.relay ? race.relayName : race.athleteName)
            .toLowerCase()
            .includes(q.get("search").toLowerCase()),
      );
      data = {
        rows: all.slice(input.offset, input.offset + 25),
        total: all.length,
      };
      if (q.get("course") === "LCM")
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (view === "analysis") {
      const chosen = races.find((r) => r.id === q.get("raceId"));
      const eligible = races.filter((r) =>
        matches(r, { ...filters, event: chosen.event, course: chosen.course }),
      );
      data = {
        count: eligible.length,
        stats: chosen.relay
          ? null
          : percentile(
              chosen.time,
              q.get("basis") === "swims" ? eligible : bestTimes(eligible),
            ),
      };
    }
    if (view === "profile")
      data = {
        name: names.get(q.get("athleteId")),
        count: own.length,
        relayCount: races.filter(
          (race) =>
            race.relay &&
            race.members?.some(
              (member) => member.athleteId === q.get("athleteId"),
            ),
        ).length,
        pbs: bestTimes(own),
        events: [...new Set(own.map((r) => r.event + "_" + r.course))],
      };
    if (view === "athlete_history") {
      const all = own.filter(
        (r) => r.event + "_" + r.course === q.get("historyEvent"),
      );
      data = {
        rows: all
          .slice(input.offset, input.offset + 25)
          .map((race) => ({ race })),
        total: all.length,
        points: dailyBestTimes(all),
      };
    }
    if (view === "athlete_relays") {
      const all = races.filter(
        (race) =>
          race.relay &&
          race.members?.some(
            (member) => member.athleteId === q.get("athleteId"),
          ),
      );
      data = {
        rows: all
          .slice(input.offset, input.offset + 25)
          .map((race) => ({ race })),
        total: all.length,
      };
    }
    if (view === "race") {
      const chosen = races.find((race) => race.id === q.get("raceId"));
      data = { rows: chosen ? [{ race: chosen }] : [], total: chosen ? 1 : 0 };
    }
    const meet = {
      id: "meet",
      name: "Fixture meet",
      date: today,
      count: races.length,
      courses: ["SCY"],
    };
    if (view === "meets") {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const matching =
        (!q.get("course") || meet.courses.includes(q.get("course"))) &&
        (!q.get("year") ||
          races.some((race) => race.date.startsWith(q.get("year"))));
      data = { meets: matching ? [meet] : [], total: matching ? 1 : 0 };
    }
    const eventKey = (race) =>
      createHash("md5")
        .update(
          JSON.stringify([
            race.event,
            race.course,
            race.gender,
            race.relay,
            race.relayAgeGroup || null,
          ]),
        )
        .digest("hex");
    const catalog = [
      ...new Map(
        races.map((race) => {
          const key = eventKey(race);
          const eventNumber =
            !race.relay && race.gender === "F" && race.event === "100_FR"
              ? 2
              : !race.relay && race.gender === "F" && race.event === "50_FR"
                ? 10
                : null;
          return [
            key,
            {
              key,
              event: race.event,
              course: race.course,
              gender: race.gender,
              relay: race.relay,
              ageGroup: race.relayAgeGroup || null,
              eventNumber,
              ordering: eventNumber == null ? "fallback" : "official",
              count: races.filter((r) => eventKey(r) === key).length,
            },
          ];
        }),
      ).values(),
    ].sort((a, b) => (a.eventNumber ?? Infinity) - (b.eventNumber ?? Infinity));
    if (view === "meet_events") data = { meet, meetEvents: catalog };
    if (view === "meet_results") {
      const all = races.filter(
        (race) =>
          eventKey(race) === q.get("meetEventKey") &&
          (!q.get("team") || race.team === q.get("team")),
      );
      data = {
        meet,
        rows: all
          .slice(input.offset, input.offset + 25)
          .map((race) => ({ race })),
        total: all.length,
      };
    }
    if (view === "records")
      data = {
        races: [
          ...new Map(
            [...teamRecords(races, "VS").values()]
              .flat()
              .map((race) => [race.id, race]),
          ).values(),
        ],
      };
    if (view === "athletes")
      data = {
        groups: athletePages(
          athleteRankings(races, names, standard, {
            team: "VS",
            course: input.course,
            period: input.period,
            today,
          }),
          input,
        ),
        standardName: standard.name,
        standardAvailable: true,
      };
    assert.ok(data, "Unhandled times view: " + view);
    const expiresAt =
      expiry && !expired && view === "rankings"
        ? Date.now() + 900
        : (Math.floor(Date.now() / 60000) + 1) * 60000;
    if (view === "rankings") expired = true;
    await route.fulfill({ json: { ...data, expiresAt } });
  });
  return { page, calls };
}
try {
  const { page, calls } = await setup();
  await page.goto(base + "/tools/times");
  await page
    .locator('table[aria-busy="false"]')
    .first()
    .waitFor()
    .catch(async (error) => {
      console.error(
        "Fixture calls",
        calls.map((q) => q.toString()),
        "Page errors",
        errors,
        await page.locator("body").innerText(),
      );
      throw error;
    });
  assert.deepEqual(calls.map((q) => q.get("view")).sort(), [
    "facets",
    "rankings",
  ]);
  assert.equal(
    await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .count(),
    0,
  );
  const analysisPanel = page.getByRole("complementary", {
    name: "Performance analysis",
  });
  assert.equal(
    await analysisPanel.count(),
    0,
    "Rankings start without an analysis sidebar",
  );
  const toolsLink = page.getByRole("link", { name: "Tools Page", exact: true });
  assert.equal(await toolsLink.getAttribute("href"), "/tools");
  const headerBounds = await page
    .locator("[data-times-page] > header")
    .boundingBox();
  assert.equal(headerBounds.x, 0);
  assert.equal(headerBounds.width, 1440, "The header spans the viewport");
  const summary = page.getByLabel("Selected times filters");
  assert.equal(
    await summary
      .locator("dt")
      .first()
      .evaluate((node) => getComputedStyle(node).position),
    "absolute",
    "Ranking filter labels remain accessible but are visually hidden",
  );
  assert.equal(await page.getByText("R = relay", { exact: true }).count(), 0);
  assert.equal(
    await page
      .locator("label")
      .filter({ hasText: /^Event$/ })
      .first()
      .evaluate((node) => getComputedStyle(node).position),
    "absolute",
    "Event selector label is visually hidden",
  );

  assert.deepEqual(await summary.locator("dd").allTextContents(), [
    "SCY",
    "100 Freestyle",
    "All ages",
    "Female",
  ]);
  const rankedTable = page.getByRole("table").first();
  assert.deepEqual(
    await rankedTable.getByRole("columnheader").allTextContents(),
    ["Rank", "Athlete", "Time", "Date", "Team", "Meet"],
  );
  assert.equal(
    await rankedTable
      .getByRole("columnheader", { name: "Rank", exact: true })
      .locator("span")
      .getAttribute("class"),
    "sr-only",
  );
  assert.equal(
    await rankedTable
      .locator("tbody tr")
      .first()
      .locator("td")
      .first()
      .evaluate((cell) => getComputedStyle(cell).textAlign),
    "center",
  );
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Velocity Swimming", exact: true })
    .click();
  await summary.getByText("Velocity Swimming", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Age group", exact: true }).click();
  assert.deepEqual(
    await page.getByRole("dialog").getByRole("button").allTextContents(),
    [
      "",
      "All ages",
      "8 & under",
      "9–10",
      "11–12",
      "13–14",
      "15–16",
      "17–18",
      "19 & over",
      "Done",
    ],
  );

  await page
    .getByRole("dialog")
    .getByRole("button", { name: "11–12", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await summary.getByText("11–12", { exact: true }).waitFor();
  await rankedTable.getByText("Swimmer 00 Fixture", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  const female = page.getByRole("button", { name: "Female", exact: true }),
    male = page.getByRole("button", { name: "Male", exact: true });
  await female.click();
  assert.equal(await female.getAttribute("aria-pressed"), "true");
  await male.click();
  await page
    .getByRole("table")
    .getByText("Male Fixture", { exact: true })
    .waitFor();
  assert.equal(await female.getAttribute("aria-pressed"), "true");
  assert.equal(await male.getAttribute("aria-pressed"), "true");
  await male.click();
  await page
    .getByRole("table")
    .getByText("Swimmer 00 Fixture", { exact: true })
    .waitFor();
  await page
    .getByRole("navigation", { name: "Result pages" })
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await page
    .getByRole("table")
    .getByText("Swimmer 26 Fixture", { exact: true })
    .waitFor();
  await page.getByLabel("Search athletes", { exact: true }).fill("Swimmer 26");
  await page.waitForResponse((r) => r.url().includes("search=Swimmer+26"));
  assert.equal(
    (
      await page.getByRole("table").locator("tbody tr").first().innerText()
    ).startsWith("27"),
    true,
  );
  await page.getByRole("button", { name: /Analyze .*Swimmer 26/ }).click();
  await page.getByText("Performance percentile", { exact: true }).waitFor();
  await page
    .getByRole("table")
    .getByRole("button", { name: "Swimmer 26 Fixture", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Swimmer 26 Fixture", exact: true })
    .waitFor();
  await page.getByRole("table").first().waitFor();
  await page
    .getByRole("group", { name: "Event history", exact: true })
    .getByRole("heading", { name: "Free", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Meet Results", exact: true }).click();
  const meetBrowser = page.getByRole("region", {
    name: "Meet browser",
    exact: true,
  });
  const loadingCards = meetBrowser.locator("[data-loading-meets]");
  await loadingCards.waitFor();
  assert.equal(await loadingCards.locator(":scope > div").count(), 6);
  assert.equal(
    await analysisPanel.count(),
    0,
    "Meet browsing starts without analysis",
  );
  await page.getByText("Fixture meet", { exact: true }).first().waitFor();
  await page
    .getByLabel("Meet search course", { exact: true })
    .selectOption("LCM");
  await meetBrowser.getByText(/No matching meets/).waitFor();
  assert.ok(
    calls.some((q) => q.get("view") === "meets" && q.get("course") === "LCM"),
  );
  await page
    .getByLabel("Meet search course", { exact: true })
    .selectOption("SCY");
  await page
    .getByLabel("Meet search year", { exact: true })
    .selectOption("2026");
  await page.getByText("Fixture meet", { exact: true }).first().waitFor();
  assert.ok(
    calls.some((q) => q.get("view") === "meets" && q.get("year") === "2026"),
  );
  await page.getByLabel("Meet search year", { exact: true }).selectOption("");
  await page.getByText("Fixture meet", { exact: true }).first().click();
  assert.equal(
    await meetBrowser.count(),
    0,
    "Selecting a meet closes the finder",
  );
  await page
    .getByRole("button", { name: "Find another meet", exact: true })
    .click();
  await meetBrowser.waitFor();
  assert.equal(
    await page.getByLabel("Meet search course", { exact: true }).inputValue(),
    "SCY",
  );
  await page
    .getByRole("button", { name: "Hide meet finder", exact: true })
    .click();
  assert.equal(await meetBrowser.count(), 0);

  await page
    .getByRole("heading", { name: "Fixture meet", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Team Records", exact: true }).click();
  const recordsPanel = page.getByRole("region", {
    name: "Team records",
    exact: true,
  });
  const recordTable = recordsPanel
    .getByRole("region", { name: "SCY 11–12 record table", exact: true })
    .getByRole("table");
  await recordTable.waitFor();
  assert.deepEqual(
    await recordTable.getByRole("columnheader").allTextContents(),
    ["Girls", "Event", "Boys"],
  );
  const recordBoard = recordTable
    .getByRole("button", {
      name: "View girls 11–12 SCY 100 FR rankings",
      exact: true,
    })
    .first();
  const boardText = await recordBoard
    .locator(":scope > span")
    .allTextContents();
  assert.equal(
    boardText.length,
    3,
    "Each record board contains only name, time, and year",
  );
  assert.ok(boardText[0].includes("Swimmer"));
  assert.match(boardText[1], /^\d+:\d{2}\.\d{2}$/);
  assert.match(boardText[2], /^\d{4}$/);
  await recordsPanel
    .getByRole("heading", {
      name: "Velocity Swimming · 11–12 · SCY",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await recordTable.locator("caption time").textContent(),
    new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/Los_Angeles",
    }),
  );
  const headingLabels = recordTable.locator("caption > div > span");
  assert.deepEqual(await headingLabels.allTextContents(), ["Girls", "Boys"]);
  assert.equal(
    await headingLabels
      .first()
      .evaluate((node) => getComputedStyle(node).textAlign),
    "left",
  );
  assert.equal(
    await headingLabels
      .last()
      .evaluate((node) => getComputedStyle(node).textAlign),
    "right",
  );
  assert.equal(
    await recordTable
      .locator("caption")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    "rgba(0, 0, 0, 0)",
  );
  assert.equal(
    await recordTable
      .locator("tbody td")
      .first()
      .evaluate((node) => getComputedStyle(node).borderBottomWidth),
    "0px",
  );
  for (const side of ["first-child", "last-child"]) {
    const walls = await recordsPanel
      .locator(
        `tbody > tr > td:${side} > div > :is(button, div) > :nth-child(2)`,
      )
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().right),
      );
    assert.ok(walls.length > 1);
    assert.ok(
      Math.max(...walls) - Math.min(...walls) < 1,
      "Record time right edges align across all tables",
    );
  }
  await recordTable
    .getByRole("rowheader", { name: "100 Freestyle", exact: true })
    .waitFor();
  await recordTable
    .getByRole("rowheader", { name: "200 Medley relay", exact: true })
    .waitFor();
  const relayEvent = recordTable.getByRole("rowheader", {
    name: "200 Medley relay",
    exact: true,
  });
  const eventHeight = (await relayEvent.locator("span").boundingBox()).height;
  const recordHeights = await relayEvent
    .locator("..")
    .locator("td > div > div")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height),
    );
  assert.ok(
    Math.abs(eventHeight - Math.max(...recordHeights)) < 1,
    "Relay event cards match the tallest record card",
  );
  assert.equal(
    await recordBoard.evaluate((node) => getComputedStyle(node).color),
    "rgb(255, 255, 255)",
  );
  assert.equal(
    await recordTable
      .getByRole("rowheader")
      .first()
      .locator("span")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    await recordTable
      .evaluate((node) =>
        getComputedStyle(node).getPropertyValue("--primary-dark").trim(),
      )
      .then((color) => {
        const hex = color.slice(1);
        return `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
      }),
  );
  assert.equal(
    await recordsPanel
      .locator('[aria-label="No available record"]')
      .first()
      .textContent(),
    "",
  );

  assert.equal(
    await recordTable
      .getByRole("rowheader")
      .first()
      .evaluate((node) => getComputedStyle(node).textAlign),
    "center",
  );
  assert.equal(
    await page.getByLabel("Selected times filters").count(),
    0,
    "Team records has no filter summary bar",
  );
  await recordsPanel
    .getByRole("button", {
      name: "View girls 11–12 SCY 200 MED-R rankings",
      exact: true,
    })
    .first()
    .waitFor();
  await recordsPanel
    .getByRole("button", {
      name: "View boys 11–12 SCY 200 MED-R rankings",
      exact: true,
    })
    .first()
    .waitFor();
  assert.equal(
    await recordsPanel
      .getByText("Girls fixture relay", { exact: true })
      .count(),
    0,
  );
  assert.equal(
    await recordsPanel.getByText("Boys fixture relay", { exact: true }).count(),
    0,
  );
  assert.equal(
    await recordsPanel
      .getByRole("columnheader", { name: "Mixed", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await recordsPanel.getByRole("button", { name: /^View mixed / }).count(),
    0,
  );
  assert.equal(
    await recordsPanel
      .getByText("Mixed-only fixture relay", { exact: true })
      .count(),
    0,
  );
  assert.equal(
    await recordsPanel.getByText("300 FR-R", { exact: true }).count(),
    0,
  );
  assert.equal(
    await recordsPanel
      .getByRole("heading", { name: "13-15", exact: true })
      .count(),
    0,
  );
  const recordLineup = recordsPanel
    .getByRole("list", { name: "Relay swimmers" })
    .first();
  await recordLineup.waitFor();
  assert.deepEqual(await recordLineup.getByRole("listitem").allTextContents(), [
    "Swimmer F.",
    "Swimmer F.",
    "Unlinked F.",
    "Swimmer F.",
  ]);
  assert.equal(
    await recordLineup.evaluate(
      (list) => getComputedStyle(list).gridTemplateColumns.split(" ").length,
    ),
    2,
  );
  await page
    .getByRole("button", {
      name: "View girls 11–12 SCY 200 MED-R rankings",
      exact: true,
    })
    .first()
    .click();
  await page
    .getByRole("button", {
      name: "Analyze 2:10.00 by Girls fixture relay",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("table")
      .getByText("Girls fixture relay", { exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Mixed", exact: true }).count(),
    1,
  );
  await page.getByRole("button", { name: "Athletes", exact: true }).click();
  await page
    .getByRole("button", { name: "← Back to team athletes", exact: true })
    .click();
  await page.getByLabel("Athlete team", { exact: true }).selectOption("VS");
  await page.getByText("3-event score", { exact: true }).first().waitFor();
  const pager = page.getByRole("navigation", { name: "Ranked athletes pages" });
  await pager.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .locator("#athlete-search")
    .getByText("Swimmer 26 Fixture", { exact: true })
    .waitFor();
  await page.getByLabel("Search team athletes").fill("Swimmer 26");
  await page.waitForResponse((r) => r.url().includes("search=swimmer+26"));
  const row = page
    .locator("#athlete-search")
    .getByRole("button")
    .filter({ hasText: "Swimmer 26 Fixture" });
  assert.equal(await row.locator("> span").first().innerText(), "27");
  await row.click();
  await page
    .getByRole("heading", { name: "Swimmer 26 Fixture", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "← Back to team athletes", exact: true })
    .click();
  assert.equal(await page.getByLabel("Athlete team").inputValue(), "VS");
  await page
    .locator("#athlete-search")
    .getByText("Swimmer 26 Fixture", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Event Rankings", exact: true })
    .click();
  await Promise.all([
    page.waitForRequest(
      (r) =>
        r.url().includes("view=rankings") && r.url().includes("course=LCM"),
    ),
    page.getByRole("button", { name: "LCM", exact: true }).click(),
  ]);
  await page.getByRole("button", { name: "SCY", exact: true }).click();
  await page
    .getByRole("table")
    .getByText("Swimmer 00 Fixture", { exact: true })
    .waitFor();
  await page.waitForTimeout(550);
  await page
    .getByRole("table")
    .getByText("Swimmer 00 Fixture", { exact: true })
    .waitFor();
  // Wide results panels expose the six-column selector without a popup.
  const eventSelector = page.getByRole("group", { name: "Event", exact: true });
  await eventSelector.waitFor();
  await eventSelector
    .getByRole("button", { name: "200 Medley relay", exact: true })
    .waitFor();
  if (process.env.VELOCITY_SELECTOR_SCREENSHOTS)
    await eventSelector.screenshot({
      path: "/tmp/velocity-selector-desktop.png",
    });
  assert.equal(
    await page.getByRole("button", { name: "Event", exact: true }).count(),
    0,
  );
  await eventSelector
    .getByRole("button", { name: "200 Freestyle relay", exact: true })
    .click();
  assert.equal(
    await page.getByRole("group", { name: "Result type", exact: true }).count(),
    0,
  );
  await page
    .getByLabel("Selected times filters")
    .getByText("200 Freestyle relay", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Mixed", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Analyze 2:00.00 by Mixed fixture relay",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("table")
      .getByText("Mixed fixture relay", { exact: true })
      .count(),
    0,
  );
  const rankedLineup = page
    .getByRole("table")
    .first()
    .getByRole("list", { name: "Relay swimmers" })
    .first();
  assert.deepEqual(await rankedLineup.getByRole("listitem").allTextContents(), [
    "Swimmer F.",
    "Swimmer F.",
    "Unlinked F.",
    "Swimmer F.",
  ]);
  assert.equal(
    await rankedLineup.evaluate(
      (list) => getComputedStyle(list).gridTemplateColumns.split(" ").length,
    ),
    2,
  );
  await page
    .getByRole("button", {
      name: "Analyze 2:00.00 by Mixed fixture relay",
      exact: true,
    })
    .click();
  const detail = page.getByRole("complementary", {
    name: "Performance analysis",
  });
  await detail
    .getByRole("heading", { name: "Relay lineup", exact: true })
    .waitFor();
  await detail
    .getByText(
      "All four members are reported; some athlete profiles are unlinked.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await detail.getByRole("listitem").count(), 4);
  assert.equal(
    await detail
      .getByRole("button", { name: "Unlinked Fixture", exact: true })
      .count(),
    0,
  );
  await detail.getByText("Unlinked Fixture", { exact: true }).waitFor();
  await detail.getByRole("table").getByText("50 yd", { exact: true }).waitFor();
  await detail
    .getByText(
      "Partial validated split coverage; some distances are unavailable.",
      { exact: true },
    )
    .waitFor();
  await page.getByRole("button", { name: "LCM", exact: true }).click();
  assert.equal(
    await eventSelector
      .getByRole("button", { name: "100 Freestyle relay", exact: true })
      .count(),
    0,
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await page
    .getByLabel("Selected times filters")
    .getByText("100 Freestyle", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Mixed", exact: true }).count(),
    0,
  );
  // An eligible lead-off remains an individual PB when the parent team is disqualified.
  await eventSelector
    .getByRole("button", { name: "50 Freestyle", exact: true })
    .click();
  await page
    .getByRole("table")
    .getByText("Verified lead-off", { exact: true })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Analyze 28.00 by Swimmer 00 Fixture",
      exact: true,
    })
    .click();
  await detail.getByText("Verified relay lead-off", { exact: true }).waitFor();
  await detail
    .getByRole("button", { name: "Load parent relay", exact: true })
    .click();
  await detail
    .getByRole("button", {
      name: "View parent relay · 200 Freestyle relay",
      exact: true,
    })
    .click();
  await detail
    .getByText("Disqualified fixture relay · 11-12", { exact: true })
    .waitFor();
  await detail.getByText("DQ", { exact: true }).waitFor();
  await detail
    .getByRole("button", { name: "Swimmer 00 Fixture", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Swimmer 00 Fixture", exact: true })
    .waitFor();
  const participation = page.getByRole("region", {
    name: "Athlete relay participation",
  });
  await participation.getByRole("table").waitFor();
  await participation
    .getByRole("navigation", { name: "Relay participation pages" })
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await participation.getByText("26–30 of 30", { exact: true }).waitFor();
  // Numbered and fallback groups share the same event selection behavior.
  await page.getByRole("button", { name: "Meet Results", exact: true }).click();
  await page.getByLabel("Search meets", { exact: true }).fill("Fixture meet");
  await page.getByText("Fixture meet", { exact: true }).first().click();
  const eventNav = page.getByRole("navigation", {
    name: "Meet events",
    exact: true,
  });
  await eventNav
    .getByRole("heading", { name: "Official event order", exact: true })
    .waitFor();
  await eventNav
    .getByRole("heading", {
      name: "Event order unavailable — grouped by event",
      exact: true,
    })
    .waitFor();
  assert.match(await eventNav.getByRole("button").first().innerText(), /^#2/);
  const eventResults = page.getByRole("region", {
    name: "Selected event results",
    exact: true,
  });
  await eventResults.getByRole("button", { name: "Next", exact: true }).click();
  await eventResults.getByText(/26–/).waitFor();
  await eventNav
    .getByRole("button", { name: /Mixed.*200 Freestyle relay/ })
    .focus();
  await page.keyboard.press("Enter");
  await eventResults
    .getByRole("columnheader", { name: "Relay team", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Search meets", { exact: true }).inputValue(),
    "Fixture meet",
    "Changing a meet's result category must preserve the meet-name search.",
  );
  await page
    .getByRole("button", {
      name: "Analyze 2:00.00 by Mixed fixture relay",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("table")
      .getByText("Mixed fixture relay", { exact: true })
      .count(),
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileEvents = page.getByLabel("Meet event", { exact: true });
  await mobileEvents.waitFor();
  const selectedEvent = await mobileEvents.inputValue();
  await mobileEvents.selectOption({ index: 0 });
  await eventResults
    .getByRole("columnheader", { name: "Athlete", exact: true })
    .waitFor();
  assert.notEqual(await mobileEvents.inputValue(), selectedEvent);
  assert.equal(await eventNav.isVisible(), false);
  await page.screenshot({
    path: "/tmp/meet-events-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "/tmp/meet-events-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Event Rankings", exact: true })
    .click();
  await page
    .getByRole("table")
    .getByText("Swimmer 00 Fixture", { exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await rankedTable
      .getByRole("columnheader", { name: "Meet", exact: true })
      .count(),
    0,
  );
  const mobileHeaderBounds = await page
    .locator("[data-times-page] > header")
    .boundingBox();
  assert.equal(mobileHeaderBounds.x, 0);
  assert.equal(mobileHeaderBounds.width, 390);
  await page.getByRole("button", { name: "Event", exact: true }).click();
  const dialog = page.getByRole("dialog");
  assert.deepEqual(
    await dialog.getByRole("heading", { level: 3 }).allTextContents(),
    ["IM", "Fly", "Back", "Breast", "Free", "Dist"],
  );
  assert.equal(
    await dialog
      .getByRole("button", { name: "100 Freestyle", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  if (process.env.VELOCITY_SELECTOR_SCREENSHOTS)
    await dialog.screenshot({ path: "/tmp/velocity-selector-mobile.png" });
  const selectorBounds = await dialog.boundingBox();
  assert.ok(
    selectorBounds.x >= 0 && selectorBounds.x + selectorBounds.width <= 390,
  );
  await dialog
    .getByRole("button", { name: "200 Freestyle relay", exact: true })
    .click();
  await page
    .getByLabel("Selected times filters")
    .getByText("200 Freestyle relay", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Event", exact: true }).click();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(
    await eventSelector
      .getByRole("button", { name: "200 Freestyle relay", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.evaluate(() => window.scrollTo(0, 450));
  const summaryBounds = await summary.boundingBox();
  assert.ok(
    summaryBounds.y >= 0 && summaryBounds.y + summaryBounds.height < 250,
    "The filter summary stays visible under the tabs while scrolling on mobile",
  );
  await page.getByRole("button", { name: "Team Records", exact: true }).click();
  const mobileLineup = page
    .getByRole("region", { name: "Team records", exact: true })
    .getByRole("list", { name: "Relay swimmers" })
    .first();
  await mobileLineup.scrollIntoViewIfNeeded();
  assert.equal(
    await mobileLineup.evaluate((node) => getComputedStyle(node).fontWeight),
    "650",
    "Relay swimmers are bold like individual record holders",
  );
  const firstMember = await mobileLineup
    .getByRole("listitem")
    .nth(0)
    .boundingBox();
  const secondMember = await mobileLineup
    .getByRole("listitem")
    .nth(1)
    .boundingBox();
  assert.ok(
    firstMember.x + firstMember.width < secondMember.x,
    "Relay member names keep their column gap in narrow record tables",
  );
  await page.close();
  const recovery = await setup({ failure: true });
  await recovery.page.goto(base + "/tools/times");
  await recovery.page
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  await recovery.page.getByRole("table").waitFor();
  await recovery.page.close();
  const expiry = await setup({ expiry: true });
  await expiry.page.goto(base + "/tools/times");
  await expiry.page.getByRole("table").waitFor();
  await expiry.page.waitForResponse(
    (r) =>
      r.url().includes("view=rankings") &&
      expiry.calls.filter((q) => q.get("view") === "rankings").length >= 2,
  );
  assert.equal(
    expiry.calls.filter((q) => q.get("view") === "rankings").length,
    2,
  );
  await expiry.page.close();
  assert.deepEqual(errors, []);
  console.log(
    "Times browser checks passed: every view, relay/Mixed filters, validated lineup/splits, lead-off parent DQ, athlete relay paging, course/category resets, ties/ranks, search, cancellation, retries, cache expiry, mobile and keyboard event selection; no bulk downloads.",
  );
} finally {
  await browser.close();
}
