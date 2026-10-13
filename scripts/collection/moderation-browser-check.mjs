import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
const base = process.env.VELOCITY_TEST_URL ?? "http://127.0.0.1:3001";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
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
const id = "mod-browser-" + randomUUID(),
  email = id + "@example.test",
  password = randomUUID() + "aA1!";
const account = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
assert.ifError(account.error);
const uid = account.data.user.id;
const result = await admin.from("administrators").insert({ user_id: uid });
assert.ifError(result.error);
const team = id + "-team",
  athlete = id + "-athlete",
  meet = id + "-meet",
  bad = id + "-bad",
  next = id + "-next";
const swim = (rid, time) => ({
  id: rid,
  athleteId: athlete,
  eventCode: "100_FR_LCM",
  course: "LCM",
  timeMs: time,
  status: "OK",
  round: "F",
  isOfficial: true,
  isRelay: false,
  gender: "M",
  ageAtSwim: 12,
  teamId: team,
  meet: {
    id: meet,
    name: "2026 IE PSA Pendleton Open fixture",
    date: "2026-07-04",
  },
});
const writes = [
  {
    path: "teams/" + team,
    after: { name: "Atomic browser fixture " + id, lscCode: "IE" },
  },
  {
    path: "meets/" + meet,
    after: { name: "2026 IE PSA Pendleton Open fixture" },
  },
  {
    path: "athletes/" + athlete,
    after: {
      id: athlete,
      name: { first: "Maison", last: "Velasquez" },
      status: "active",
      teamId: team,
    },
  },
  { path: "swims/" + bad, after: swim(bad, 26150) },
  { path: "swims/" + next, after: swim(next, 60000) },
];
const collected = await admin.rpc("collect_records", { reads: [], writes });
assert.ifError(collected.error);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.setDefaultNavigationTimeout(60000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await context.route("**/auth/v1/**", (route) => {
  if (
    !["127.0.0.1", "localhost"].includes(
      new URL(route.request().url()).hostname,
    )
  )
    return route.abort();
  return route.continue();
});
const rankings = () =>
  page.request
    .get(
      base +
        "/api/times?view=rankings&team=" +
        team +
        "&course=LCM&event=100_FR&genders=M",
    )
    .then((r) => r.json());
try {
  const baseline = await rankings();
  assert.equal(
    baseline.rows?.[0]?.race.id,
    bad,
    "Frontend must use the seeded local database",
  );
  await page.goto(base + "/tools/times");
  await page.getByRole("button", { name: "LCM", exact: true }).first().click();
  await page.getByRole("button", { name: "Male", exact: true }).click();
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page
    .getByRole("button", { name: "Atomic browser fixture " + id, exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Analyze 26.15 by Maison Velasquez",
      exact: true,
    })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Flag result", exact: true })
      .count(),
    0,
    "signed-out visitor cannot flag",
  );
  await page.goto(base + "/login");
  await page.getByRole("button", { name: /password/i }).click();
  await page.locator("input[type=email]").fill(email);
  await page.locator("input[type=password]").fill(password);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(base + "/tools");
  await page.goto(base + "/tools/times");
  await page.getByRole("button", { name: "LCM", exact: true }).first().click();
  await page.getByRole("button", { name: "Male", exact: true }).click();
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page
    .getByRole("button", { name: "Atomic browser fixture " + id, exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Analyze 26.15 by Maison Velasquez",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Flag result", exact: true }).click();
  await page
    .getByLabel("Staff note (optional)")
    .fill("Browser review of incorrect upload");
  // A failed save must preserve the form and leave calculations unchanged.
  await page.route(
    "**/api/times/moderation",
    (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 503,
            json: { error: "Synthetic save failure" },
          })
        : route.continue(),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Flag and exclude result" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Synthetic save failure" })
    .waitFor();
  assert.equal(
    await page.getByLabel("Staff note (optional)").inputValue(),
    "Browser review of incorrect upload",
  );
  assert.equal((await rankings()).rows[0].race.id, bad);
  await page.getByRole("button", { name: "Flag and exclude result" }).click();
  await page
    .getByText("Result flagged and excluded.", { exact: true })
    .waitFor();
  await page
    .getByText("Under review · excluded from rankings and records", {
      exact: true,
    })
    .first()
    .waitFor();
  assert.equal(
    (await rankings()).rows[0].race.id,
    next,
    "successful mutation expires server cache",
  );
  await page
    .getByRole("button", {
      name: "Analyze 1:00.00 by Maison Velasquez",
      exact: true,
    })
    .waitFor();
  await page.goto(base + "/tools/review/results");
  const card = page.locator("article").filter({ hasText: "Maison" });
  await card
    .getByRole("button", { name: "Review details and history" })
    .click();
  await card
    .getByLabel("Restoration explanation")
    .fill("Original source checked");
  await card
    .getByRole("button", { name: "Restore result", exact: true })
    .click();
  await card.waitFor({ state: "detached" });
  assert.equal(
    (await rankings()).rows[0].race.id,
    bad,
    "restoration expires server cache",
  );
  await page.getByLabel("Include restored results").check();
  const restored = page.locator("article").filter({ hasText: "Maison" });
  await restored
    .getByRole("button", { name: "Review details and history" })
    .click();
  await restored.getByText("Review history (2)", { exact: true }).click();
  await restored
    .getByText("Browser review of incorrect upload", { exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "mobile review fits viewport",
  );
  await page.screenshot({
    path: "/tmp/velocity-moderation-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Verified staff flagging, failed-save recovery, immediate ranking refresh, history, restoration, signed-out restrictions, and mobile layout.",
  );
} finally {
  await browser.close();
  // Synthetic source rows are removed; immutable audit history remains local.
  await admin.from("result_moderation").delete().in("result_id", [bad, next]);
  const cleanup = await admin.rpc("collect_records", {
    reads: [],
    writes: [...writes]
      .reverse()
      .filter(({ path }) => !path.startsWith("teams/"))
      .map(({ path }) => ({ path, after: null })),
  });
  if (cleanup.error) console.error("Fixture cleanup:", cleanup.error.message);
  await admin.from("people").delete().eq("team_id", team);
  await admin.from("teams").delete().eq("id", team);
  await admin.auth.admin.deleteUser(uid);
}
