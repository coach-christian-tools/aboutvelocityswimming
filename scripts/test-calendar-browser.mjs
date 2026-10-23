import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.VELOCITY_TEST_URL ?? "http://127.0.0.1:3006";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) {
  throw new Error("Calendar browser checks run against a local server only.");
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(60000);
const errors = [];
const requests = [];
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => {
  if (new URL(request.url()).pathname === "/api/calendar") requests.push(request.url());
});
const main = page.locator("main");
const escapeHtml = text => text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[character]);
async function loaded() {
  await main.locator('[aria-busy="true"]').waitFor({ state: "detached" });
  await main.getByRole("heading", { level: 3 }).first().waitFor();
}
async function navigate(name) {
  const response = page.waitForResponse(response => new URL(response.url()).pathname === "/api/calendar");
  await main.getByRole("button", { name, exact: true }).click();
  const result = await response;
  await loaded();
  return result;
}

try {
  const start = performance.now();
  const response = await page.goto(base + "/schedule", { waitUntil: "domcontentloaded" });
  assert.equal(response.status(), 200);
  await loaded();
  console.log(`Initial server-rendered calendar: ${Math.round(performance.now() - start)} ms`);
  const html = await response.text();
  const initialHeading = await main.getByRole("heading", { level: 3 }).first().textContent();
  const event = await main.locator("button[aria-label]").evaluateAll(buttons => {
    const button = buttons.find(button => button.offsetWidth && button.getAttribute("aria-label").includes(", ") && !button.hasAttribute("aria-controls"));
    return button && { label: button.getAttribute("aria-label"), title: button.textContent };
  });
  assert.ok(event, "the current live month contains an event for interaction checks");
  assert.ok(html.includes(`aria-label="${escapeHtml(event.label)}"`), "event markup arrives in the server response");
  await main.getByRole("searchbox", { name: "Search", exact: true }).fill("no-matching-calendar-event-7f592");
  await main.getByRole("heading", { name: "No events match your search.", exact: true }).waitFor();
  assert.equal(requests.length, 0, "hydration and filtering do not fetch the initial month again");
  await main.getByRole("button", { name: "Clear search", exact: true }).first().click();
  await main.getByRole("button", { name: event.label, exact: true }).first().click();
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.getByRole("dialog").getByRole("heading", { level: 2 }).textContent(), event.title);
  await page.getByRole("button", { name: "Close event details", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await main.getByRole("button", { name: "Agenda", exact: true }).click();
  assert.ok(await main.locator("time").count() > 0);
  await main.getByRole("button", { name: "Month", exact: true }).click();
  assert.equal((await navigate("Next month")).status(), 200);
  assert.notEqual(await main.getByRole("heading", { level: 3 }).first().textContent(), initialHeading);
  assert.equal((await navigate("Today")).status(), 200);
  assert.equal(await main.getByRole("heading", { level: 3 }).first().textContent(), initialHeading);
  assert.equal((await navigate("Previous month")).status(), 200);
  assert.equal((await navigate("Next month")).status(), 200);

  await page.route("**/api/calendar?*", route => route.fulfill({
    status: 502, contentType: "application/json", body: JSON.stringify({ error: "Synthetic calendar outage" }),
  }), { times: 1 });
  assert.equal((await navigate("Next month")).status(), 502);
  await main.getByRole("alert").waitFor();
  assert.ok(await main.getByRole("link", { name: "Open Google Calendar ↗", exact: true }).isVisible());
  assert.equal((await navigate("Try again")).status(), 200);
  await main.getByRole("alert").waitFor({ state: "detached" });
  await navigate("Today");

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 800) {
      await main.getByRole("button", { name: "Today", exact: true }).click();
      await main.getByRole("heading", { level: 2 }).waitFor();
      assert.ok(await main.locator('[aria-current="date"][aria-pressed="true"]').isVisible());
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `no overflow at ${width}px`);
    await page.screenshot({ path: `/tmp/velocity-calendar-${width}.png`, fullPage: true });
  }

  for (const path of ["/schedule", "/api/calendar?month=" + new URL(requests[0]).searchParams.get("month")]) {
    const start = performance.now();
    const warm = await fetch(base + path);
    await warm.text();
    assert.equal(warm.status, 200);
    console.log(`Warm ${path}: ${Math.round(performance.now() - start)} ms`);
  }
  assert.equal((await fetch(base + "/api/calendar?month=invalid")).status, 400);
  assert.deepEqual(errors, [], "no browser runtime or hydration errors");
  console.log("Calendar browser checks passed: server HTML, no duplicate initial request, desktop/mobile controls, errors and retry.");
} finally {
  await browser.close();
}
