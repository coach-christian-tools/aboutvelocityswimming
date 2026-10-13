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
  race("relay", "athlete0", "100_FR-R", 60000, {
    relay: true,
    gender: "X",
    relayAgeGroup: "11-12",
    relayName: "Mixed fixture relay",
  }),
);
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
      genders: q.get("genders")?.split(",") ?? ["F"],
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
          race.athleteName
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
        stats: percentile(
          chosen.time,
          q.get("basis") === "swims" ? eligible : bestTimes(eligible),
        ),
      };
    }
    if (view === "profile")
      data = {
        name: names.get(q.get("athleteId")),
        count: own.length,
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
    const meet = {
      id: "meet",
      name: "Fixture meet",
      date: today,
      count: races.length,
      courses: ["SCY"],
    };
    if (view === "meets") data = { meets: [meet], total: 1 };
    if (view === "meet_results")
      data = {
        meet,
        rows: races
          .filter((r) => !r.relay)
          .slice(0, 25)
          .map((race) => ({ race })),
        total: races.filter((r) => !r.relay).length,
      };
    if (view === "records")
      data = { races: [...teamRecords(races, "VS").values()].flat() };
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
  await page.getByRole("table").first().waitFor();
  assert.deepEqual(calls.map((q) => q.get("view")).sort(), [
    "facets",
    "rankings",
  ]);
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
    .getByRole("button", { name: "Event history", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Freestyle", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Meet results", exact: true }).click();
  await page.getByText("Fixture meet", { exact: true }).first().click();
  await page
    .getByRole("heading", { name: "Fixture meet", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Team Records", exact: true }).click();
  await page
    .getByRole("button", {
      name: "View mixed 11–12 SCY 100 FR-R rankings",
      exact: true,
    })
    .first()
    .click();
  await page
    .getByRole("table")
    .getByText("Mixed fixture relay", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Mixed", exact: true }).count(),
    0,
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
    .getByRole("button", { name: "Event rankings", exact: true })
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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Event", exact: true }).click();
  const dialog = page.getByRole("dialog");
  assert.deepEqual(
    await dialog.getByRole("heading", { level: 3 }).allTextContents(),
    [
      "Freestyle",
      "Backstroke",
      "Breaststroke",
      "Butterfly",
      "Individual Medley",
    ],
  );
  assert.equal(
    await dialog
      .getByRole("button", { name: "100 Freestyle", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
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
  await expiry.page.waitForResponse((r) => r.url().includes("view=rankings"));
  assert.equal(
    expiry.calls.filter((q) => q.get("view") === "rankings").length,
    2,
  );
  await expiry.page.close();
  assert.deepEqual(errors, []);
  console.log(
    "Times browser checks passed: every view, drill-downs, combined genders, ties/ranks, paging, search, cancellation, retries, cache expiry, mobile and keyboard event selection; no bulk downloads.",
  );
} finally {
  await browser.close();
}
