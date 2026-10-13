import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
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
  "Correction fixture requires the local database",
);
const base = process.env.VELOCITY_TEST_URL ?? "http://127.0.0.1:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await admin
  .from("swims")
  .select("data")
  .eq("id", "test-race-1")
  .single();
assert.ifError(error);
const original = data.data,
  changed = { ...original, timeMs: original.timeMs - 1000 };
const browser = await chromium.launch({ headless: true });
let mutated = false;
try {
  const page = await browser.newPage();
  const url =
    base + "/api/times?view=rankings&course=SCY&event=100_FR&genders=F";
  const before = await (await page.request.get(url)).json();
  assert.equal(
    before.rows.find((r) => r.race.id === original.id)?.race.time,
    original.timeMs,
    "Frontend must use synthetic local data",
  );
  await page.goto(base + "/login");
  await page.getByRole("button", { name: /password/i }).click();
  await page.locator("input[type=email]").fill("coach@velocity-swimming.com");
  await page.locator("input[type=password]").fill("Velocity-local-test-2026!");
  await page.locator("button[type=submit]").click();
  await page.waitForURL("**/tools/workshare/admin/families");
  const correction = await page.request.post(base + "/api/data", {
    headers: { Origin: base },
    data: {
      reads: [{ path: "swims/" + original.id, before: original }],
      writes: [{ path: "swims/" + original.id, after: changed }],
    },
  });
  assert.equal(correction.status(), 200, await correction.text());
  mutated = true;
  const after = await (await page.request.get(url)).json();
  assert.equal(
    after.rows.find((r) => r.race.id === original.id)?.race.time,
    changed.timeMs,
    "Successful app correction must invalidate the cached read immediately",
  );
  const restore = await page.request.post(base + "/api/data", {
    headers: { Origin: base },
    data: {
      reads: [{ path: "swims/" + original.id, before: changed }],
      writes: [{ path: "swims/" + original.id, after: original }],
    },
  });
  assert.equal(restore.status(), 200, await restore.text());
  mutated = false;
  const final = await (await page.request.get(url)).json();
  assert.equal(
    final.rows.find((r) => r.race.id === original.id)?.race.time,
    original.timeMs,
  );
  console.log(
    "Public read → authenticated app correction → immediate cache invalidation → restored data verified.",
  );
} finally {
  if (mutated) {
    const cleanup = await admin.rpc("collect_records", {
      reads: [],
      writes: [{ path: "swims/" + original.id, after: original }],
    });
    assert.ifError(cleanup.error);
  }
  await browser.close();
}
