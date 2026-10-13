import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
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
const anon = createClient(config.API_URL, config.PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const sql = (q) =>
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
      q,
    ],
    { stdio: "pipe" },
  );
const token = randomUUID(),
  hash = createHash("sha256").update(token).digest("hex");
const set = JSON.parse(
  readFileSync("research/time-standards-2026-10-13/motivational.json", "utf8"),
);
set.id = "browser_standards_" + Date.now();
set.name = "Browser standards fixture";
const path = "standards/" + set.id;
const batch = {
  division: "times",
  scope: set.name,
  sourceUrl: set.sourceUrl,
  capturedAt: new Date().toISOString(),
  coverage: "complete",
  evidence: { method: "Browser fixture" },
  reads: [{ path, before: null }],
  writes: [{ path, after: set }],
};
sql(
  `insert into private.collection_workers(name,token_hash,divisions) values('Standards browser','${hash}',array['times']);`,
);
const browser = await chromium.launch({ headless: true });
const base = process.env.STANDARDS_TEST_URL ?? "http://127.0.0.1:3001";
try {
  const result = await anon.rpc("stage_collection", {
    worker_token: token,
    batch,
  });
  assert.ifError(result.error);
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/tools/times");
  await page
    .getByRole("button", { name: "Time Standards", exact: true })
    .click();
  await page
    .getByText("Loading approved standards…", { exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    await page.locator("option").filter({ hasText: set.name }).count(),
    0,
  );
  await page.goto(base + "/login");
  await page.getByRole("button", { name: /password/i }).click();
  await page.locator("input[type=email]").fill("coach@velocity-swimming.com");
  await page.locator("input[type=password]").fill("Velocity-local-test-2026!");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(base + "/tools");
  await page.goto(base + "/tools/review");
  const article = page.locator("article").filter({ hasText: set.name });
  await article
    .getByText("Review records, conflicts and source evidence", { exact: true })
    .click();
  await article
    .locator("details[aria-label]")
    .first()
    .locator("summary")
    .first()
    .click();
  await article.getByRole("region", { name: "Standard changes" }).waitFor();
  assert.ok(
    await article
      .getByText("3648 added · 0 changed · 0 removed", { exact: true })
      .isVisible(),
  );
  await article
    .getByRole("button", { name: "Approve all changes", exact: true })
    .click();
  await article.waitFor({ state: "detached" });
  assert.equal(
    (await anon.from("standards").select("id").eq("id", set.id)).data.length,
    1,
  );
  await page.goto(base + "/tools/times");
  await page
    .getByRole("button", { name: "Time Standards", exact: true })
    .click();
  await page.getByLabel("Standard", { exact: true }).selectOption(set.id);
  await page.getByLabel("Age group", { exact: true }).selectOption("10&U");
  await page.getByLabel("Tier", { exact: true }).selectOption("B");
  assert.ok(
    await page.getByLabel("50 Freestyle: 39.79", { exact: true }).isVisible(),
  );
  assert.ok(
    await page
      .getByLabel("200 Individual Medley relay: 3:14.99", { exact: true })
      .isVisible(),
  );
  assert.ok(
    await page
      .getByLabel("400 Individual Medley: No published cut", { exact: true })
      .isVisible(),
  );
  await page.screenshot({ path: "/tmp/standards-desktop.png", fullPage: true });
  await page.getByLabel("Course", { exact: true }).selectOption("LCM");
  await page.getByLabel("Gender", { exact: true }).selectOption("M");
  await page.getByLabel("Age group", { exact: true }).selectOption("17-18");
  await page.getByLabel("Tier", { exact: true }).selectOption("AAAA");
  assert.ok(
    await page.getByLabel("50 Freestyle: 23.99", { exact: true }).isVisible(),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({ path: "/tmp/standards-mobile.png", fullPage: true });
  for (const name of [
    "Event Rankings",
    "Team Records",
    "Meet Results",
    "Athletes",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Browser: private staging → review preview → approval → exact cuts, filters, mobile and existing tabs passed.",
  );
} finally {
  await browser.close();
  await admin.from("standards").delete().eq("id", set.id);
  sql(
    `delete from public.collection_reviews where batch_id in (select id from public.collection_batches where worker_id in (select id from private.collection_workers where token_hash='${hash}'));delete from public.collection_batches where worker_id in (select id from private.collection_workers where token_hash='${hash}');delete from private.collection_workers where token_hash='${hash}';`,
  );
}
