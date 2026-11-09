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
  const navigation = page.getByRole("navigation", { name: "Tools navigation", exact: true });
  const overview = navigation.locator('a[href="/tools"]');
  const home = page.getByRole("link", { name: "Back to Home", exact: true });
  const reviewHeading = page.getByRole("heading", { name: "Review queue", exact: true });
  const toolNames = ["Velocity Times", "Velocity Workshare", "Swim Atlas", "Velocity Imports"];
  const toolLink = (name) => navigation.getByRole("link", { name, exact: true });
  async function toolSection(name) {
    const sectionId = await toolLink(name).getAttribute("aria-controls");
    assert.ok(sectionId);
    return page.locator(`[id="${sectionId}"]`);
  }
  async function openTool(name) {
    const link = toolLink(name);
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL(base + href);
    await page.getByRole("heading", { name: `Explore ${name}`, exact: true }).waitFor();
    assert.equal(await link.getAttribute("aria-current"), "page");
    for (const tool of toolNames) {
      assert.equal(await toolLink(tool).getAttribute("aria-expanded"), String(tool === name));
    }
    return toolSection(name);
  }
  await overview.waitFor();
  assert.equal(await overview.getAttribute("aria-current"), "page");
  for (const name of toolNames) {
    assert.equal(await toolLink(name).getAttribute("aria-expanded"), "false");
    assert.equal(await (await toolSection(name)).isVisible(), false);
  }
  const workshareSection = await openTool("Velocity Workshare");
  await workshareSection.getByRole("link", { name: "Job Board", exact: true }).waitFor();
  assert.equal(await page.getByRole("main").getByRole("link", { name: /^Families / }).count(), 1);
  assert.equal(await page.getByRole("main").getByRole("link", { name: /^Volunteer Logs / }).count(), 0);
  // Keyboard navigation opens a landing page and closes the previous tool.
  await toolLink("Velocity Times").press("Enter");
  await page.waitForURL(base + "/tools/times/overview");
  await workshareSection.waitFor({ state: "hidden" });
  const timesNavigation = await openTool("Velocity Times");
  const rankings = timesNavigation.getByRole("link", { name: "Event Rankings", exact: true });
  assert.equal(await rankings.getAttribute("aria-current"), null);
  await page.getByRole("main").getByRole("link", { name: /^Event Rankings / }).click();
  await page.waitForURL((url) => url.pathname === "/tools/times");
  await rankings.waitFor();
  assert.equal(await rankings.getAttribute("aria-current"), "page");
  await page.goBack();
  await page.waitForURL(base + "/tools/times/overview");
  await page.getByRole("heading", { name: "Explore Velocity Times", exact: true }).waitFor();
  assert.equal(await toolLink("Velocity Times").getAttribute("aria-current"), "page");
  const atlasNavigation = await openTool("Swim Atlas");
  const atlasMeets = atlasNavigation.getByRole("link", { name: "Meets", exact: true });
  await atlasMeets.click();
  await page.waitForURL((url) => url.pathname === "/tools/knowledge");
  await page.getByRole("searchbox", { name: "Search meets" }).waitFor();
  assert.equal(await atlasMeets.getAttribute("aria-current"), "page");
  await page.reload();
  const restoredAtlasMeets = (await toolSection("Swim Atlas")).getByRole("link", { name: "Meets", exact: true });
  await restoredAtlasMeets.waitFor();
  assert.equal(await restoredAtlasMeets.getAttribute("aria-current"), "page");

  let reviewNavigation = await openTool("Velocity Imports");
  assert.equal(await page.getByRole("main").getByRole("list").getByRole("link").count(), 6);
  let queueItem = reviewNavigation.getByRole("link", { name: "Review queue", exact: true });
  await queueItem.click();
  await page.waitForURL(base + "/tools/review");
  await reviewHeading.waitFor();
  await queueItem.waitFor();
  assert.equal(await queueItem.getAttribute("aria-current"), "page");
  await page.getByRole("combobox", { name: "Status", exact: true }).waitFor();
  await overview.click();
  await page.waitForURL(base + "/tools");
  await home.click();
  await page.waitForURL(base + "/");
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
  reviewNavigation = await openTool("Velocity Imports");
  queueItem = reviewNavigation.getByRole("link", { name: "Review queue", exact: true });
  await queueItem.click();
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
  console.log("Tool landing pages, exclusive navigation, browser back, Atlas deep link, and retired staff URLs verified");
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

  const workshareNavigation = await openTool("Velocity Workshare");
  const families = workshareNavigation.getByRole("link", { name: "Families", exact: true });
  await families.click();
  await page.waitForURL(base + "/tools/workshare/admin/families");
  await page.getByText("Example A.", { exact: true }).first().waitFor();
  assert.equal(await families.getAttribute("aria-current"), "page");
  await page.goto(base + "/tools/workshare/admin/families/family-a");
  await page.getByRole("button", { name: "View Client", exact: true }).click();
  await page.waitForURL(base + "/tools/workshare");
  await page.getByText("Example Family A", { exact: true }).first().waitFor();
  await navigation.getByRole("link", { name: "Volunteer Logs", exact: true }).waitFor();
  assert.equal(await navigation.getByRole("link", { name: "Families", exact: true }).count(), 0);
  await page.getByRole("button", { name: "To Admin", exact: true }).click();
  await page.waitForURL(base + "/tools/workshare/admin/families");
  await navigation.getByRole("link", { name: "Families", exact: true }).waitFor();
  console.log("Workshare navigation and administrator family preview verified");
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
    await page.getByRole("region", { name: "Your tools", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Staff Tools", exact: true }).count(), 0);
    await page.screenshot({
      path: "/tmp/velocity-tools-" + width + ".png",
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false, "Tools overflow at " + width);
    for (const [name, path, count] of [
      ["Velocity Times", "times", 5],
      ["Velocity Workshare", "workshare", 5],
      ["Swim Atlas", "knowledge", 5],
      ["Velocity Imports", "review", 6],
    ]) {
      await page.getByRole("main").getByRole("link", { name, exact: true }).click();
      await page.waitForURL(base + `/tools/${path}/overview`);
      await page.getByRole("heading", { name: `Explore ${name}`, exact: true }).waitFor();
      assert.equal(await page.getByRole("main").getByRole("list").getByRole("link").count(), count);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflow at ${width}`);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      if (width >= 768) await navigation.waitFor();
      await page.screenshot({ path: `/tmp/velocity-${path}-home-${width}.png`, fullPage: true });
      await page.getByRole("main").getByRole("link", { name: "All tools", exact: true }).click();
      await page.waitForURL(base + "/tools");
    }
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(base + "/tools/times");
  const openDrawer = page.getByRole("button", { name: "Open navigation sidebar", exact: true });
  await openDrawer.click();
  await toolLink("Velocity Imports").click();
  await page.waitForURL(base + "/tools/review/overview");
  await page.getByRole("heading", { name: "Explore Velocity Imports", exact: true }).waitFor();
  await navigation.waitFor({ state: "hidden" });
  await openDrawer.click();
  reviewNavigation = await toolSection("Velocity Imports");
  queueItem = reviewNavigation.getByRole("link", { name: "Review queue", exact: true });
  await queueItem.click();
  await page.waitForURL(base + "/tools/review");
  await reviewHeading.waitFor();
  await navigation.waitFor({ state: "hidden" });
  assert.equal(
    await page.getByRole("main").evaluate((main) => main.scrollWidth > main.clientWidth),
    false,
    "Velocity Imports content overflows at 390px",
  );
  await openDrawer.click();
  await queueItem.waitFor();
  await page.keyboard.press("Escape");
  await navigation.waitFor({ state: "hidden" });
  assert.equal(await openDrawer.evaluate((button) => button === document.activeElement), true);
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
