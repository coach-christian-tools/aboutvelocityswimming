/** Local-only acceptance check: catalog → staff filters → saved selection → assisted export. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

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
const base = "http://127.0.0.1:3001";
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const prefix = `meet-queue-browser-${Date.now()}`;
const ids = Array.from({ length: 36 }, (_, index) => `${prefix}-${index}`);
const sentinel = ids.at(-1);
const rows = ids.map((id, index) => {
  const last = index === 35;
  const date = last
    ? "2007-03-03"
    : `2026-09-${String((index % 28) + 1).padStart(2, "0")}`;
  return {
    id,
    starts_on: date,
    ends_on: date,
    data: {
      kind: "meet",
      title: last
        ? `Catalog browser sentinel ${prefix}`
        : `Catalog browser meet ${index} ${prefix}`,
      startsOn: date,
      endsOn: date,
      sourceUrl: "https://example.test/meet",
      lscId: "usa-lsc-ie",
      meetCategory: last ? "observed" : "sanctioned",
      discipline: "pool",
      sourceCourses: ["SCY", "SCY", "unsupported"],
      catalogConflicts: [
        {
          field: "archiveIdentity",
          approved: "2007-03-03",
          proposed: "2007-03-02",
          sourceUrl: "https://example.test/results",
          sha256: "a".repeat(64),
          member: "synthetic-results.hy3",
        },
      ],
      participationCoverage: "partial",
      participationScope:
        "Synthetic local fixture, incomplete meet-wide coverage",
      participants: [
        {
          id: "test-ie-club",
          name: "Local test IE club",
          clubCode: "TEST",
          lscCode: "IE",
          basis: "recorded",
          representation: "club",
          evidence: [
            {
              sourceUrl: "https://example.test/results",
              kind: "individual",
              status: "OK",
              line: 14,
            },
          ],
        },
      ],
    },
  };
});
const inserted = await admin.from("knowledge_entries").insert(rows);
assert.ifError(inserted.error);
const browser = await chromium.launch({ headless: true });
const screenshotPath = "backups/meet-queue-browser";
await mkdir(screenshotPath, { recursive: true });
const login = async (page, email) => {
  await page.goto(base + "/login");
  await page.getByRole("button", { name: /password/i }).click();
  await page.locator("input[type=email]").fill(email);
  await page.locator("input[type=password]").fill("Velocity-local-test-2026!");
  await page.locator("button[type=submit]").click();
  await page.waitForURL((url) => url.pathname !== "/login");
};
const api = async (page, path, method = "GET", body) =>
  page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, body: await response.json() };
    },
    { path, method, body },
  );
try {
  const guest = await browser.newPage();
  await guest.goto(base + "/tools/review/meets");
  assert.equal((await api(guest, "/api/collection/meets")).status, 401);
  await guest.close();
  const family = await browser.newPage();
  await login(family, "family-a@example.test");
  assert.equal((await api(family, "/api/collection/meets")).status, 403);
  await family.goto(base + "/tools/review/meets");
  await family.getByText(/staff access is required/i).waitFor();
  await family.close();

  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page, "coach@velocity-swimming.com");
  await page.goto(base + "/tools/review/meets");
  await page
    .getByRole("heading", { name: /meet collection/i, exact: true })
    .waitFor();
  await page.getByRole("searchbox").fill(`Catalog browser sentinel ${prefix}`);
  const card = page.locator(`[data-meet-id="${sentinel}"]`);
  await card.waitFor();
  await card.getByText("Result courses: SCY", { exact: true }).waitFor();
  await card.locator("summary").first().click();
  await card.getByText("Courses in captured results:", { exact: true }).waitFor();
  await card.getByText(/archiveIdentity/).waitFor();
  const search = await api(
    page,
    `/api/collection/meets?search=${encodeURIComponent(prefix)}&year=2007&category=observed&ies=confirmed`,
  );
  assert.equal(search.status, 200);
  assert.equal(
    search.body.total,
    1,
    "Year, category and attendance search must filter before pagination.",
  );
  assert.equal(search.body.rows[0].id, sentinel);
  await card.getByLabel("Select meet", { exact: true }).check();
  await card.getByLabel("Priority", { exact: true }).fill("4");
  await card
    .getByLabel("Notes", { exact: true })
    .fill("Collect complete meet results on the next assisted run.");
  await card.getByRole("button", { name: "Save changes", exact: true }).click();
  await card.getByText("Saved", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("searchbox").fill(`Catalog browser sentinel ${prefix}`);
  await card.waitFor();
  await card.locator("summary").first().click();
  await assert.doesNotReject(async () =>
    assert.equal(
      await card.getByLabel("Select meet", { exact: true }).isChecked(),
      true,
    ),
  );
  assert.equal(
    await card.getByLabel("Priority", { exact: true }).inputValue(),
    "4",
  );
  assert.equal(
    await card.getByLabel("Notes", { exact: true }).inputValue(),
    "Collect complete meet results on the next assisted run.",
  );
  const exported = await api(
    page,
    `/api/collection/meets?export=1&search=${encodeURIComponent(prefix)}`,
  );
  assert.equal(exported.status, 200);
  assert.deepEqual(
    exported.body.rows.map((row) => row.id),
    [sentinel],
  );
  assert.equal(
    exported.body.rows[0].importState,
    "not_started",
    "Selection must not import results.",
  );
  const original = exported.body.rows[0];
  const payload = {
    meetId: sentinel,
    selected: true,
    priority: 4,
    notes: original.notes,
    blockers: [],
    updatedAt: original.updatedAt,
  };
  assert.equal(
    (
      await api(page, "/api/collection/meets", "PATCH", {
        ...payload,
        importState: "complete",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(page, "/api/collection/meets", "PATCH", {
        ...payload,
        notes: "Concurrent staff update",
      })
    ).status,
    200,
  );
  assert.equal(
    (await api(page, "/api/collection/meets", "PATCH", payload)).status,
    409,
  );
  await page.screenshot({
    path: `${screenshotPath}/desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Meet queue must fit mobile width.",
  );
  await page.screenshot({
    path: `${screenshotPath}/mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Expanded meet queue must fit 320px width.",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Verified staff/family isolation, search before pagination, selection persistence, private export, completion checks, conflict detection, and mobile layout.",
  );
} finally {
  await browser.close();
  const removed = await admin.from("knowledge_entries").delete().in("id", ids);
  assert.ifError(removed.error);
}
