import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const base = process.env.VELOCITY_TEST_URL ?? "http://127.0.0.1:3001";
const localOnly = (value) => assert.ok(["127.0.0.1", "localhost"].includes(new URL(value).hostname));
localOnly(base);
const config = process.env.VELOCITY_TEST_SUPABASE_URL
  ? { API_URL: process.env.VELOCITY_TEST_SUPABASE_URL, PUBLISHABLE_KEY: process.env.VELOCITY_TEST_SUPABASE_KEY }
  : JSON.parse(execFileSync("supabase", ["status", "--output", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }));
localOnly(config.API_URL);
assert.ok(config.PUBLISHABLE_KEY);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const providedToken = process.env.VELOCITY_TEST_COLLECTOR_TOKEN;
const token = providedToken ?? randomUUID();
const tokenHash = sha256(token);
const project = readFileSync("supabase/config.toml", "utf8").match(/^project_id = "([a-zA-Z0-9_-]+)"/m)?.[1];
function workerSql(sql) {
  assert.equal(config.API_URL, "http://127.0.0.1:54321", "For a custom local stack, supply a test collector token.");
  assert.ok(project);
  execFileSync("docker", ["exec", `supabase_db_${project}`, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "pipe" });
}
if (!providedToken) {
  workerSql(`insert into private.collection_workers(name,token_hash,divisions) values('Imports browser fixture','${tokenHash}',array['knowledge','times']);`);
}

const client = createClient(config.API_URL, config.PUBLISHABLE_KEY, { auth: { persistSession: false } });
const prefix = `import-browser-${randomUUID()}`;
const scope = `Imports browser ${prefix}`;
const sourceUrl = `https://example.test/${prefix}`;
const date = "2026-10-06";
const catalog = (label, id) => ({
  kind: "catalog_meet",
  id: `${prefix}-${id}`,
  data: { kind: "meet", title: `${scope} ${label}`, sourceUrl, startsOn: date, endsOn: date },
});
const meet = {
  kind: "meet",
  id: `${prefix}-meet`,
  data: { name: `${scope} Results meet`, startsOn: date, endsOn: date, course: "SCY" },
};
const team = { kind: "team", id: `${prefix}-team`, data: { name: `Browser Fresh Team ${prefix}` } };
const athlete = {
  kind: "athlete",
  id: `${prefix}-athlete`,
  data: {
    name: { first: "Browser Fresh", last: `Athlete ${prefix}` },
    sourceObservation: { memberIdHash: sha256(prefix).slice(0, 24) },
    teamId: team.id,
  },
};
const swim = {
  kind: "swim",
  id: `${prefix}-swim`,
  data: {
    athleteId: athlete.id,
    teamId: team.id,
    meet: { id: meet.id, name: meet.data.name, date },
    eventCode: "100_FR_SCY", course: "SCY", distance: 100, stroke: "FR", round: "F",
    gender: "F", ageAtSwim: 15, ageGroup: "15-16", timeMs: 60000, status: "OK", isOfficial: true,
  },
  prerequisites: [athlete, team],
};
const excluded = catalog("Catalog 01", "catalog-1");
const late = catalog("Late meet", "late");

async function stage(division, rows) {
  const { data, error } = await client.rpc("stage_velocity_import", {
    worker_token: token,
    batch: {
      division, sourceUrl, sourceScope: scope, coverage: "partial", capturedAt: new Date().toISOString(),
      sha256: sha256(JSON.stringify(rows)), rows,
    },
  });
  assert.ifError(error);
  assert.equal(data.staged, rows.length);
  assert.equal(data.blocked, 0);
}

async function publicRow(table, id) {
  const { data, error } = await client.from(table).select("id").eq("id", id).maybeSingle();
  assert.ifError(error);
  return data;
}

let browser;
try {
  const catalogRows = [excluded, ...Array.from({ length: 299 }, (_, index) =>
    catalog(`Catalog ${String(index + 2).padStart(3, "0")}`, `catalog-${index + 2}`))];
  for (let offset = 0; offset < catalogRows.length; offset += 100) {
    await stage("knowledge", catalogRows.slice(offset, offset + 100));
  }
  await stage("times", [meet, swim]);
  assert.equal(await publicRow("public_swims", swim.id), null);
  assert.equal(await publicRow("knowledge_entries", excluded.id), null);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/auth/v1/**", (route) => {
    if (new URL(route.request().url()).origin === config.API_URL) return route.continue();
    errors.push("Refused nonlocal authentication request");
    return route.abort();
  });
  await page.goto(base + "/login");
  await page.getByRole("button", { name: /password/i }).click();
  await page.locator("input[type=email]").fill("christiancutter02@gmail.com");
  await page.locator("input[type=password]").fill("Velocity-local-test-2026!");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(base + "/tools");
  await page.getByRole("navigation", { name: "Tools navigation" }).getByRole("link", { name: "Velocity Imports", exact: true }).click();
  await page.waitForURL(base + "/tools/review");
  await page.getByRole("heading", { name: "Review queue", exact: true }).waitFor();

  const meets = page.getByRole("region", { name: "Meets", exact: true });
  const swims = page.getByRole("region", { name: "Swims", exact: true });
  async function search(kind, query) {
    const form = page.getByRole("form", { name: `Filter pending ${kind}` });
    await form.getByRole("searchbox", { name: `Search ${kind}` }).fill(query);
    await form.getByRole("button", { name: "Apply filters" }).click();
  }
  await search("meets", scope);
  await search("swims", scope);
  const allMeets = meets.getByRole("button", { name: "Select all 301 matching meets" });
  await allMeets.waitFor();
  await meets.getByRole("checkbox", { name: "Select all meets on this page" }).check();
  await meets.getByText("30 selected", { exact: true }).waitFor();
  await meets.getByRole("button", { name: "Next" }).click();
  await meets.getByText("Showing 31–60 of 301 rows").waitFor();
  assert.equal(await meets.getByRole("checkbox", { name: "Select all meets on this page" }).isChecked(), false);
  await meets.getByRole("button", { name: "Previous" }).click();
  await meets.getByRole("button", { name: "Clear meets selection" }).click();
  await allMeets.click();
  await meets.getByText("301 selected", { exact: true }).waitFor();

  await stage("knowledge", [late]);
  await search("meets", late.data.title);
  const lateCheckbox = meets.getByRole("checkbox", { name: `Select ${late.data.title}` });
  await lateCheckbox.waitFor();
  assert.equal(await lateCheckbox.isChecked(), false);

  await search("meets", excluded.data.title);
  const excludedCheckbox = meets.getByRole("checkbox", { name: `Select ${excluded.data.title}`, exact: true });
  await excludedCheckbox.waitFor();
  await excludedCheckbox.uncheck();
  await meets.getByText("300 selected", { exact: true }).waitFor();

  const swimLabel = `${athlete.data.name.first} ${athlete.data.name.last}`;
  await swims.getByRole("button", { name: `View details for ${swimLabel}` }).click();
  const details = page.getByRole("dialog", { name: swimLabel });
  await details.getByRole("link", { name: sourceUrl }).waitFor();
  await details.getByRole("button", { name: "Close" }).click();
  await swims.getByRole("checkbox", { name: `Select ${swimLabel}` }).check();
  await page.getByRole("button", { name: "Preview approval" }).click();
  const preview = page.getByRole("dialog", { name: "Approval preview" });
  await preview.getByText("300 meets · 1 swim").waitFor();
  await preview.getByText("2 linked records to publish", { exact: true }).click();
  await preview.getByText("Browser Fresh Team", { exact: false }).waitFor();
  await preview.getByText("301 selected rows", { exact: true }).click();
  await preview.getByLabel("Selected table").selectOption("swims");
  await preview.getByText(swimLabel, { exact: true }).waitFor();

  // Lose the first response after the database commits, then reload and resume.
  let interrupted = false;
  await page.route("**/api/collection/imports", async (route) => {
    if (interrupted || route.request().method() !== "POST" || route.request().postDataJSON()?.action !== "approve") return route.continue();
    interrupted = true;
    const response = await route.fetch();
    assert.ok(response.ok(), "Approval must commit before simulating a lost response");
    await route.abort("failed");
  });
  await preview.getByRole("button", { name: "Approve 301 rows" }).click();
  await page.getByRole("button", { name: "Retry approval" }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Resume approval" }).click();
  await page.getByText("301 approved · 0 duplicates · 0 blocked").waitFor();
  assert.ok(await publicRow("public_swims", swim.id));
  assert.equal(await publicRow("knowledge_entries", late.id), null);
  assert.equal(await publicRow("knowledge_entries", excluded.id), null);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.getByRole("main").evaluate((main) => main.scrollWidth > main.clientWidth), false);
  assert.deepEqual(errors, []);
  console.log("Verified pending inventory, frozen select all, linked records, approval resumption, and mobile layout.");
} finally {
  await browser?.close();
  if (!providedToken) {
    workerSql(`update private.collection_workers set revoked_at=now() where token_hash='${tokenHash}';`);
  }
}
