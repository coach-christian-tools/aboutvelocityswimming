import { chromium } from "playwright";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
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
page.on("pageerror", (e) => errors.push(e.message));
try {
  for (const path of [
    "/",
    "/tools",
    "/tools/swim-resources/times",
    "/tools/workshare/jobs",
    "/login",
    "/store",
    "/privacy",
  ]) {
    const response = await page.goto(base + path, { waitUntil: "domcontentloaded" });
    assert.ok(response.status() < 400, path);
    await page.locator("body").waitFor();
    console.log("Opened " + path);
  }
  await page.goto(base + "/login");
  await page.getByRole("button", { name: /password/i }).click();
  await page.locator("input[type=email]").fill("coach@velocity-swimming.com");
  await page.locator("input[type=password]").fill("Velocity-local-test-2026!");
  await page.locator("button[type=submit]").click();
  await page.waitForURL("**/tools/workshare/admin/families");
  await page.getByText("Example A.", { exact: true }).first().waitFor();
  console.log("Staff password session and linked families verified");
  await page.goto(base + "/tools/swim-resources/attendance/admin");
  await page.getByRole("heading", { name: "Practice attendance" }).waitFor();
  await page.getByLabel("Attendance for Avery Example").selectOption("present");
  await page.getByRole("button", { name: "Save attendance" }).click();
  await page.getByText("Attendance saved.", { exact: true }).waitFor();
  console.log("Attendance browser → API → database verified");
  await page.goto(base + "/tools/swim-resources/admin/data/athletes");
  await page.getByText("test-swimmer-a", { exact: false }).first().waitFor();
  console.log("Shared staff session across tools verified");
  await page.goto(base+'/tools/swim-resources/admin/import');
  const batch=JSON.parse(readFileSync('backups/browser/import.json','utf8'));
  await page.getByRole('button',{name:'Structured batch',exact:true}).click();
  await page.getByLabel('Import batch JSON',{exact:true}).fill(JSON.stringify(batch));
  await page.getByRole('button',{name:'Preview changes',exact:true}).click();
  await page.getByRole('checkbox',{name:'Select Velocity Swimming Browser Test',exact:true}).check();
  await page.getByRole('button',{name:'Apply 1 selected changes',exact:true}).click();
  await page.getByText(/1 changes applied/).waitFor();
  await page.getByRole('checkbox',{name:'Reverse velocity-swimming',exact:true}).check();
  await page.getByLabel('Restore previous values for these 1 records').check();
  await page.getByRole('button',{name:'Reverse selected changes',exact:true}).click();
  await page.getByText(/1 changes reversed/).waitFor();
  console.log('Reviewed import, private evidence, receipt, and guarded reversal verified');
  await page.goto(base+'/tools/workshare/jobs');
  await page.getByRole('button',{name:/Create Shift|Post.*Shift|Add.*Shift/}).first().click();
  await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + "/tools");
    await page
      .getByRole("link", { name: "Staff Tools", exact: true })
      .waitFor();
    await page.screenshot({
      path: "/tmp/velocity-tools-" + width + ".png",
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false, "Tools overflow at " + width);
  }
  const response = await page.goto(base + "/tools/workshare/no-such-page");
  assert.equal(response.status(), 404);
  console.log("Native deep-link 404 verified");
  assert.deepEqual(errors, []);
  console.log("Browser checks passed");
} finally {
  await browser.close();
}
