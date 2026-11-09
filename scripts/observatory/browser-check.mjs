import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const base = "http://127.0.0.1:3001";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/*.supabase.co/**", (route) => {
  errors.push("Hosted backend refused");
  return route.abort();
});
try {
  await page.goto(base + "/tools/overview");
  await page.waitForURL(base + "/login");
  await page.getByRole("button", { name: /password/i }).click();
  await page.locator("input[type=email]").fill("christiancutter02@gmail.com");
  await page.locator("input[type=password]").fill("Velocity-local-test-2026!");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(base + "/tools");
  await page.goto(base + "/tools/overview");
  const explorer = page.getByRole("region", { name: "Archive explorer" });
  await explorer
    .locator('[aria-label^="Swims by year"] button')
    .first()
    .waitFor();
  const api = await page.request.get(base + "/api/times/observatory");
  assert.equal(api.status(), 200);
  const data = await api.json();
  assert.ok(data.totals.swims > 0);
  const controls = page.getByRole("group", {
    name: "Archive visualization",
    exact: true,
  });
  for (const name of [
    "Every Swim",
    "Meet Skyline",
    "Athlete Fingerprints",
    "Swimming Universe",
    "Archive Growth",
    "Swim Atlas",
  ]) {
    await controls.getByRole("button", { name, exact: true }).click();
    await explorer.getByRole("heading", { name, exact: true }).waitFor();
    assert.equal(
      await controls
        .getByRole("button", { name, exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(await explorer.getByRole("alert").count(), 0);
  }
  await explorer
    .locator('[aria-label^="Swims by year"] button')
    .first()
    .click();
  await page.waitForURL(/year=/);
  await explorer
    .locator('[aria-label^="Swims by meet"] button')
    .first()
    .click();
  await page.getByRole("region", { name: "Selected race results" }).waitFor();
  await controls
    .getByRole("button", { name: "Every Swim", exact: true })
    .click();
  await explorer
    .getByRole("heading", { name: "Every Swim", exact: true })
    .waitFor();
  const firstRaceButton = explorer.locator("button[title][aria-label]").first();
  await firstRaceButton.click();
  await page
    .getByRole("heading", { name: "Selected swim", exact: true })
    .waitFor();
  await page.getByTitle("Reset all filters").click();
  await explorer.locator('button[aria-label*="swims"]').first().waitFor();
  await page
    .getByLabel("Search meets or swimmers")
    .fill("no-results-observatory-zzzz");
  await page
    .getByRole("button", { name: "Search archive", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "No swims in this selection" })
    .waitFor();
  await page.getByRole("button", { name: "Explore the full archive" }).click();
  await page.waitForURL((url) => !url.searchParams.has("search"));
  await explorer.locator('button[aria-label*="swims"]').first().waitFor();
  await controls
    .getByRole("button", { name: "Swim Atlas", exact: true })
    .click();
  await explorer
    .locator('[aria-label^="Swims by year"] button')
    .first()
    .waitFor();
  mkdirSync("/tmp/velocity-observatory-check", { recursive: true });
  await page.screenshot({
    path: "/tmp/velocity-observatory-check/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of [
    "Swim Atlas",
    "Every Swim",
    "Meet Skyline",
    "Athlete Fingerprints",
    "Swimming Universe",
    "Archive Growth",
  ]) {
    await controls.getByRole("button", { name, exact: true }).click();
    await explorer.getByRole("heading", { name, exact: true }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      "No mobile page overflow in " + name,
    );
  }
  await controls
    .getByRole("button", { name: "Swim Atlas", exact: true })
    .click();
  await page.screenshot({
    path: "/tmp/velocity-observatory-check/mobile.png",
    fullPage: true,
  });
  await page.route("**/api/times/observatory?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary fixture failure" }),
    }),
  );
  await page.reload();
  await page
    .getByRole("alert")
    .filter({ hasText: "Temporary fixture failure" })
    .waitFor();
  await page.unroute("**/api/times/observatory?*");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await explorer
    .locator('[aria-label^="Swims by year"] button')
    .first()
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Passed: real local API, access gate, six views, year/meet/swim drill-down, search, empty state, mobile overflow, and error recovery.",
  );
} finally {
  await browser.close();
}
