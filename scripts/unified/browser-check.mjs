import { chromium } from "playwright";
import assert from "node:assert/strict";
const base = process.env.VELOCITY_TEST_URL ?? "http://127.0.0.1:3001";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Browser checks use local synthetic data only.");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(60000);
const errors = [];
await context.route("**/auth/v1/**", (route) => {
  if (new URL(route.request().url()).origin === "http://127.0.0.1:54321")
    return route.continue();
  errors.push("Refused a nonlocal authentication request");
  return route.abort();
});
page.on("pageerror", (e) => errors.push(e.message));
try {
  for (const path of [
    "/",
    "/login",
    "/store",
    "/privacy",
  ]) {
    const response = await page.goto(base + path, { waitUntil: "domcontentloaded" });
    assert.ok(response.status() < 400, path);
    await page.locator("body").waitFor();
    console.log("Opened " + path);
  }
  await page.goto(base + "/tools/review");
  await page.waitForURL(base + "/login");
  await page.getByRole("button", { name: /password/i }).click();
  await page.locator("input[type=email]").fill("christiancutter02@gmail.com");
  await page.locator("input[type=password]").fill("Velocity-local-test-2026!");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(base + "/tools");
  const reviewLink = page.getByRole("link", { name: /^Velocity Imports\b/ });
  const reviewHeading = page.getByRole("heading", { name: "Review queue", exact: true });
  const reviewNavigation = page.getByRole("navigation", { name: "Velocity Imports navigation", exact: true });
  const queueItem = reviewNavigation.getByRole("link", { name: "Review queue", exact: true });
  const timesSwitcher = page.getByRole("button", { name: "Switch tool, current tool Velocity Times", exact: true });
  const importsChoice = page.getByRole("navigation", { name: "Switch tools", exact: true })
    .getByRole("link", { name: "Velocity Imports", exact: true });
  await reviewLink.click();
  await page.waitForURL(base + "/tools/review");
  await reviewHeading.waitFor();
  await queueItem.waitFor();
  assert.equal(await queueItem.getAttribute("aria-current"), "page");
  await page.getByRole("combobox", { name: "Status", exact: true }).waitFor();
  await reviewNavigation.getByRole("link", { name: "Back to Tools", exact: true }).click();
  await page.waitForURL(base + "/tools");
  for (const path of [
    "",
    "/import",
    "/maintenance?collection=teams",
    "/data/athletes",
  ]) {
    await page.goto(base + "/tools/swim-resources/admin" + path);
    await page.waitForURL(base + "/tools/review");
    await reviewHeading.waitFor();
  }
  await page.goto(base + "/tools/times");
  await timesSwitcher.click();
  await importsChoice.click();
  await page.waitForURL(base + "/tools/review");
  await reviewHeading.waitFor();
  await queueItem.waitFor();
  assert.equal(await page.getByText(/Collected changes stay private until approved/).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Download private race baseline", exact: true }).count(), 0);
  for (const [name, path] of [
    ["Meet collection", "meets"],
    ["Flagged results", "results"],
    ["Exports", "exports"],
  ]) {
    const item = reviewNavigation.getByRole("link", { name, exact: true });
    await item.click();
    await page.waitForURL(base + "/tools/review/" + path);
    await page.getByRole("heading", { name, exact: true }).waitFor();
    assert.equal(await item.getAttribute("aria-current"), "page");
    await queueItem.click();
    await page.waitForURL(base + "/tools/review");
    await reviewHeading.waitFor();
  }
  console.log("Velocity Imports is available from Tools, the tool switcher, and retired staff URLs");
  const swimsTab = reviewNavigation.getByRole("link", { name: "Swims", exact: true });
  await swimsTab.click();
  await page.waitForURL(base + "/tools/review/swims");
  assert.equal(await swimsTab.getAttribute("aria-current"), "page");
  await page.getByRole("searchbox", { name: "Search", exact: true }).fill("test-race-0");
  await page.getByRole("combobox", { name: "Missing data", exact: true }).selectOption("source");
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("gap") === "source");
  const swim = page.getByRole("table", { name: "Swim results", exact: true }).locator("tbody tr");
  await swim.getByText("test-race-0", { exact: true }).waitFor();
  assert.equal(await swim.count(), 1);
  await swim.getByText("Missing", { exact: true }).waitFor();

  const meetsTab = reviewNavigation.getByRole("link", { name: "Meets", exact: true });
  await meetsTab.click();
  await page.waitForURL(base + "/tools/review/meet-inventory");
  assert.equal(await meetsTab.getAttribute("aria-current"), "page");
  await page.getByRole("table", { name: "Meet inventory", exact: true })
    .getByRole("columnheader", { name: "Import status", exact: true }).waitFor();
  await page.getByRole("link", { name: "Manage meet collection", exact: true }).waitFor();
  console.log("Velocity Imports inventory tabs and missing-source filter verified");

  await page.goto(base + "/tools/workshare/admin/families");
  await page.getByText("Example A.", { exact: true }).first().waitFor();
  console.log("Staff password session and linked families verified");
  await page.goto(base + "/tools/swim-resources/attendance/admin");
  await page.waitForURL(base + "/tools");
  assert.equal(await page.getByRole("link", { name: /Coach attendance/ }).count(), 0);
  console.log("Retired attendance returns to Tools");
  await page.goto(base+'/tools/workshare/jobs');
  await page.getByRole('button',{name:/Create Shift|Post.*Shift|Add.*Shift/}).first().click();
  await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + "/tools");
    await reviewLink.waitFor();
    assert.equal(await page.getByRole("link", { name: "Staff Tools", exact: true }).count(), 0);
    await page.screenshot({
      path: "/tmp/velocity-tools-" + width + ".png",
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false, "Tools overflow at " + width);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(base + "/tools/times");
  const openDrawer = page.getByRole("button", { name: "Open navigation sidebar", exact: true });
  await openDrawer.click();
  await timesSwitcher.click();
  await importsChoice.click();
  await page.waitForURL(base + "/tools/review");
  await reviewHeading.waitFor();
  assert.equal(
    await page.getByRole("main").evaluate((main) => main.scrollWidth > main.clientWidth),
    false,
    "Velocity Imports content overflows at 390px",
  );
  await openDrawer.click();
  await queueItem.waitFor();
  await page.getByRole("button", { name: "Close navigation sidebar", exact: true }).click();
  await reviewHeading.waitFor();
  console.log("Velocity Imports mobile drawer and review layout verified");
  const response = await page.goto(base + "/tools/workshare/no-such-page");
  assert.equal(response.status(), 404);
  console.log("Native deep-link 404 verified");
  assert.deepEqual(errors, []);
  console.log("Browser checks passed");
} finally {
  await browser.close();
}
