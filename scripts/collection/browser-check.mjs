import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
const config = JSON.parse(
  execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
assert.equal(
  config.API_URL,
  "http://127.0.0.1:54321",
  "Browser checks refuse hosted databases.",
);
const token = randomUUID(),
  hash = createHash("sha256").update(token).digest("hex");
execFileSync(
  "docker",
  [
    "exec",
    "supabase_db_aboutvelocityswimming",
    "psql",
    "-U",
    "postgres",
    "-c",
    `insert into private.collection_workers(name,token_hash,divisions) values('Browser fixture','${hash}',array['knowledge']);`,
  ],
  { stdio: "pipe" },
);
const client = createClient(config.API_URL, config.PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const id = "browser_" + Date.now(),
  title = "Browser reviewed meet " + id;
const batch = {
  division: "knowledge",
  scope: title,
  sourceUrl: "https://example.test/meet",
  capturedAt: new Date().toISOString(),
  coverage: "partial",
  evidence: { text: "Synthetic source for browser verification" },
  writes: [
    {
      path: "knowledge_entries/" + id,
      after: { kind: "meet", title, sourceUrl: "https://example.test/meet" },
    },
  ],
};
const staged = await client.rpc("stage_collection", {
  worker_token: token,
  batch,
});
assert.ifError(staged.error);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3001/tools/knowledge");
  await page
    .getByRole("heading", { name: "USA Swimming Knowledge Base", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("heading", { name: title, exact: true }).count(),
    0,
  );
  await page.goto("http://127.0.0.1:3001/login");
  await page.getByRole("button", { name: /password/i }).click();
  await page.locator("input[type=email]").fill("coach@velocity-swimming.com");
  await page.locator("input[type=password]").fill("Velocity-local-test-2026!");
  await page.locator("button[type=submit]").click();
  await page.waitForURL("**/tools/workshare/admin/families");
  await page.goto("http://127.0.0.1:3001/tools/review");
  const article = page.locator("article").filter({ hasText: title });
  await article.getByRole("button", { name: "Hold", exact: true }).click();
  await article.waitFor({ state: "detached" });
  await page.getByLabel("Status", { exact: true }).selectOption("held");
  await article
    .getByLabel("Review note")
    .fill("Verified synthetic source in browser");
  await article
    .getByRole("button", { name: "Approve all changes", exact: true })
    .click();
  await article.waitFor({ state: "detached" });
  await page.goto("http://127.0.0.1:3001/tools/knowledge");
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  await page.goto("http://127.0.0.1:3001/tools/times");
  await page
    .getByRole("button", { name: "Avery Example", exact: true })
    .click();
  await page.getByText("1:04.00", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3001/tools/review");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Review page overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Verified staging → hold → approval → public Knowledge Base, public race history, and mobile review page.",
  );
} finally {
  await browser.close();
  execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_aboutvelocityswimming",
      "psql",
      "-U",
      "postgres",
      "-c",
      `update private.collection_workers set revoked_at=now() where token_hash='${hash}';`,
    ],
    { stdio: "pipe" },
  );
}
