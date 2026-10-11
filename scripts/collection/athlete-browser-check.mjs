import { chromium } from "playwright";
import assert from "node:assert/strict";

// Serve deterministic public API responses; never write to a database.
const today = new Date().toLocaleDateString("en-CA", {
  timeZone: "America/Los_Angeles",
});
const events = [
  ["50_FR", 30000],
  ["100_BR", 90000],
  ["200_IM", 150000],
];
const standard = {
  id: "fixture",
  category: "motivational",
  governingBody: "USA_Swimming",
  name: "Browser verified standards",
  seasonYears: "2024-2028",
  effectiveDate: "2024-09-01",
  expirationDate: "2028-08-31",
  cuts: {
    SCY: Object.fromEntries(
      ["F", "M"].map((gender) => [
        gender,
        {
          "11-12": Object.fromEntries(
            events.map(([event, time]) => [
              `${event}_SCY`,
              {
                cutsByTier: [{ tierName: "A", timeMs: time, timeDisplay: "" }],
              },
            ]),
          ),
        },
      ]),
    ),
  },
};
const athletes = Array.from({ length: 29 }, (_, i) => ({
  id: `athlete${i}`,
  data: {
    name: {
      first: i === 28 ? "Provisional" : `Swimmer ${String(i).padStart(2, "0")}`,
      last: "Fixture",
    },
  },
}));
const swims = athletes.flatMap((a, i) =>
  (i === 28 ? events.slice(0, 1) : events).map(([event, time], j) => ({
    id: `${a.id}_${j}`,
    athlete_id: a.id,
    swim_date: today,
    data: {
      eventCode: `${event}_SCY`,
      timeMs: time * (1 + i / 100),
      status: "OK",
      isOfficial: true,
      gender: i === 27 ? "M" : "F",
      ageAtSwim: 12,
      teamId: "VS",
      teamName: "Velocity Swimming",
      meet: { id: "fixture-meet", name: "Fixture meet" },
    },
  })),
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let failStandards = false;
  let emptyStandards = false;
  let delayStandards = false;
  await page.route("**/rest/v1/**", async (route) => {
    const table = new URL(route.request().url()).pathname.split("/").at(-1);
    if (table === "standards" && delayStandards)
      await new Promise((resolve) => setTimeout(resolve, 500));
    if (table === "standards" && failStandards)
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Fixture standards error" }),
      });
    const data =
      table === "public_athletes"
        ? athletes
        : table === "public_swims"
          ? swims
          : table === "standards"
            ? emptyStandards
              ? []
              : [{ id: "fixture", data: standard }]
            : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("http://127.0.0.1:3001/tools/times");
  await page.getByRole("button", { name: "Athletes", exact: true }).click();
  await page.getByLabel("Athlete team", { exact: true }).waitFor();
  assert.equal(
    await page
      .locator("#athlete-search")
      .getByText("Swimmer 00 Fixture", { exact: true })
      .count(),
    0,
  );
  await page.getByLabel("Athlete team", { exact: true }).selectOption("VS");
  await page.getByText("3-event score", { exact: true }).first().waitFor();
  assert.equal(
    await page
      .locator("#athlete-search")
      .getByText("Swimmer 26 Fixture", { exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: /Show more ranked athletes/ }).click();
  await page
    .locator("#athlete-search")
    .getByText("Swimmer 26 Fixture", { exact: true })
    .waitFor();
  await page
    .locator("#athlete-search")
    .getByText("Provisional Fixture", { exact: true })
    .waitFor();
  const rankBefore = await page
    .getByRole("button")
    .filter({ hasText: "Swimmer 26 Fixture" })
    .locator("> span")
    .first()
    .innerText();
  await page.getByLabel("Search team athletes").fill("Swimmer 26");
  assert.equal(
    await page
      .getByRole("button")
      .filter({ hasText: "Swimmer 26 Fixture" })
      .locator("> span")
      .first()
      .innerText(),
    rankBefore,
  );
  await page.getByLabel("Search team athletes").fill("");
  await page
    .locator("#athlete-search")
    .getByText("Swimmer 26 Fixture", { exact: true })
    .scrollIntoViewIfNeeded();
  const directoryScroll = await page.evaluate(() => window.scrollY);
  await page
    .locator("#athlete-search")
    .getByText("Swimmer 26 Fixture", { exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Swimmer 26 Fixture", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "← Back to team athletes", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Athlete team", { exact: true }).inputValue(),
    "VS",
  );
  await page.waitForFunction(
    (expected) => Math.abs(window.scrollY - expected) < 5,
    directoryScroll,
  );
  await page
    .locator("#athlete-search")
    .getByText("Swimmer 26 Fixture", { exact: true })
    .waitFor();
  await page.getByLabel("Athlete course").selectOption("LCM");
  await page
    .getByText("No eligible official LCM results in this group and period.", {
      exact: true,
    })
    .first()
    .waitFor();
  await page.getByLabel("Athlete course").selectOption("SCY");
  assert.equal(
    await page
      .locator("#athlete-search")
      .getByText("Swimmer 26 Fixture", { exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "13–14", exact: true }).click();
  await page
    .getByText(
      "No matching athletes. Try another name, age group, team, or period.",
      { exact: true },
    )
    .waitFor();
  await page.getByRole("button", { name: "All ages", exact: true }).click();
  await page.getByLabel("Athlete period").selectOption("all");
  await page
    .locator("#athlete-search")
    .getByText("Swimmer 00 Fixture", { exact: true })
    .waitFor();
  await page.getByLabel("Athlete period").selectOption("recent");
  await page.getByText("How this score works", { exact: true }).click();
  await page.getByText(/Scores of 110, 105, and 100 give/).waitFor();
  await page.screenshot({
    path: "/tmp/athlete-browser-desktop.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/athlete-browser-mobile.png",
    fullPage: false,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile page must not overflow horizontally",
  );
  await page.getByLabel("Athlete team").focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page
      .getByLabel("Athlete course")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  failStandards = true;
  delayStandards = true;
  await page.reload();
  await page.getByRole("button", { name: "Athletes", exact: true }).click();
  await page.getByText("Loading scoring standards…", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Retry standards", exact: true })
    .waitFor();
  await page.getByLabel("Athlete team").selectOption("VS");
  await page
    .locator("#athlete-search")
    .getByText("Swimmer 00 Fixture", { exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Swimmer 00 Fixture", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "← Back to team athletes", exact: true })
    .click();
  failStandards = false;
  emptyStandards = true;
  delayStandards = false;
  await page
    .getByRole("button", { name: "Retry standards", exact: true })
    .click();
  await page
    .getByText(
      "Current verified motivational standards unavailable. Athletes are listed alphabetically without scores.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.getByText("3-event score", { exact: true }).count(),
    0,
  );
  emptyStandards = false;
  // A fresh page recovers the standard and the independent athlete controls.
  await page.reload();
  await page.getByRole("button", { name: "Athletes", exact: true }).click();
  await page.getByLabel("Athlete team").selectOption("VS");
  await page.getByText("3-event score", { exact: true }).first().waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Athlete browser verified: team-first, scores, provisional lists, search ranks, pagination resets, profile return, filters, mobile, keyboard, and standards loading/failure/missing/recovery.",
  );
} catch (error) {
  for (const page of browser.contexts().flatMap((context) => context.pages())) {
    console.log((await page.locator("main").innerText()).slice(0, 3000));
    await page.screenshot({ path: "/tmp/athlete-browser-failure.png" });
  }
  throw error;
} finally {
  await browser.close();
}
