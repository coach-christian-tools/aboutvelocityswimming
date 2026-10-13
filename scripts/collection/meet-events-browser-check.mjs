// Live local browser → API → database verification. All fixtures are removed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
const base = process.env.VELOCITY_TEST_URL || "http://127.0.0.1:3001";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const config = JSON.parse(
  execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
assert.equal(config.API_URL, "http://127.0.0.1:54321");
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const prefix = `meet-nav-${Date.now()}`;
const team = prefix + "-team",
  athlete = prefix + "-athlete";
const title = prefix + " numbered",
  otherTitle = prefix + " fallback";
const date = "2026-10-13";
const writes = [
  {
    path: "teams/" + team,
    after: { name: prefix + " Club", lscCode: "IE", clubCode: "NAV" },
  },
  {
    path: "athletes/" + athlete,
    after: {
      id: athlete,
      name: { first: "Navigation", last: "Fixture" },
      gender: "F",
      teamId: team,
      status: "active",
    },
  },
  { path: "meets/" + prefix, after: { name: title } },
  { path: "meets/" + prefix + "-other", after: { name: otherTitle } },
];
for (const [suffix, event, eventNumber, other] of [
  ["two", "100_FR", "2", false],
  ["ten", "50_FR", "10", false],
  ["fallback", "200_IM", null, true],
]) {
  writes.push({
    path: "swims/" + prefix + suffix,
    after: {
      id: prefix + suffix,
      athleteId: athlete,
      teamId: team,
      gender: "F",
      ageAtSwim: 12,
      ageGroup: "11-12",
      eventCode: event + "_SCY",
      course: "SCY",
      timeMs: 65000,
      status: "OK",
      round: "F",
      isOfficial: true,
      isRelay: false,
      meet: {
        id: prefix + (other ? "-other" : ""),
        name: other ? otherTitle : title,
        date,
      },
      ...(eventNumber
        ? {
            metadata: { source: "hytek_hy3" },
            sourceObservation: {
              eventNumber,
              archiveSha256: "b".repeat(64),
              file: "verified.hy3",
              line: 20,
              url: "https://example.test/meet.zip",
              ageMinimum: 11,
              ageMaximum: 12,
            },
          }
        : {}),
    },
  });
}
let browser;
try {
  assert.ifError(
    (await admin.rpc("collect_records", { reads: [], writes })).error,
  );
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let failedCatalog = false;
  await page.route("**/api/times?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (
      query.get("view") === "meet_events" &&
      query.get("meetId") === prefix &&
      !failedCatalog
    ) {
      failedCatalog = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary test failure" }),
      });
    } else await route.continue();
  });
  await page.goto(base + "/tools/times");
  await page.getByRole("button", { name: "Meet Results", exact: true }).click();
  await page.getByLabel("Search meets", { exact: true }).fill(prefix);
  await page.getByText(title, { exact: true }).click();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const nav = page.getByRole("navigation", {
    name: "Meet events",
    exact: true,
  });
  const results = page.getByRole("region", {
    name: "Selected event results",
    exact: true,
  });
  await results.getByRole("table").waitFor();
  assert.match(await nav.getByRole("button").first().innerText(), /^#2/);
  assert.match(await nav.getByRole("button").nth(1).innerText(), /^#10/);
  assert.equal(
    await nav.getByRole("heading", { name: /unavailable/ }).count(),
    0,
  );
  assert.match(await results.getByRole("heading").innerText(), /^#2/);
  await nav.getByRole("button").nth(1).focus();
  await page.keyboard.press("Enter");
  await results.getByRole("heading", { name: /^#10/ }).waitFor();
  await results
    .getByRole("table")
    .getByText("SCY 50 FR", { exact: true })
    .waitFor();
  const catalogResponse = await page.request.get(
    `${base}/api/times?view=meet_events&meetId=${prefix}`,
  );
  assert.equal(catalogResponse.status(), 200);
  const catalog = await catalogResponse.json();
  assert.deepEqual(
    catalog.meetEvents.map((e) => e.eventNumber),
    [2, 10],
  );
  assert.ok(!JSON.stringify(catalog).includes("sourceObservation"));
  await page.screenshot({
    path: "/tmp/meet-events-live-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByLabel("Meet event", { exact: true })
    .selectOption(catalog.meetEvents[0].key);
  await results
    .getByRole("table")
    .getByText("SCY 100 FR", { exact: true })
    .waitFor();
  assert.equal(await nav.isVisible(), false);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "/tmp/meet-events-live-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Find another meet", exact: true })
    .click();
  await page.getByText(otherTitle, { exact: true }).click();
  await results
    .getByRole("table")
    .getByText("SCY 200 IM", { exact: true })
    .waitFor();
  await results
    .getByText("Event order unavailable — grouped by event", { exact: true })
    .waitFor();
  assert.match(
    await results.getByRole("heading").innerText(),
    /Event age group unreported/,
  );
  assert.equal(
    await page
      .getByLabel("Meet event", { exact: true })
      .locator("option")
      .count(),
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Live meet navigation passed: official order, fallback, keyboard, meet switching, mobile, and public API.",
  );
} finally {
  if (browser) await browser.close();
  const people = await admin
    .from("athletes")
    .select("person_id")
    .eq("id", athlete);
  const cleanup = [...writes]
    .reverse()
    .map((w) => ({ path: w.path, after: null }));
  assert.ifError(
    (
      await admin.rpc("collect_records", {
        reads: [],
        writes: [
          ...cleanup.filter((w) => !w.path.startsWith("teams/")),
          ...(people.data || []).map((p) => ({
            path: "people/" + p.person_id,
            after: null,
          })),
          ...cleanup.filter((w) => w.path.startsWith("teams/")),
        ],
      })
    ).error,
  );
}
