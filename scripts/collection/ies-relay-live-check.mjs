import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import {
  eventLabel,
  resultName,
} from "../../src/components/collection/times-data.ts";
import { formatSwimTime } from "../../src/features/swim-resources/lib/domain/swim-time.ts";

const base = process.env.VELOCITY_LIVE_TEST_URL;
assert.ok(
  base,
  "Set VELOCITY_LIVE_TEST_URL to the new deployed site's URL after publishing imports.",
);
const site = new URL(base);
assert.equal(site.protocol, "https:", "Live verification requires HTTPS.");
const prepared = resolve(
  process.env.VELOCITY_RELAYS_PREPARED_DIR ??
    "backups/ies-relays/2026-10-13/prepared",
);
const output = resolve(
  process.env.VELOCITY_LIVE_TEST_OUTPUT ??
    "backups/ies-relays/2026-10-13/live-browser",
);
const relays = JSON.parse(
  await readFile(resolve(prepared, "relay-results.json"), "utf8"),
);
const leadOffs = [];
let splitUpdate;
for (const file of (await readdir(resolve(prepared, "batches"))).sort()) {
  if (!file.endsWith(".json")) continue;
  const batch = JSON.parse(
    await readFile(resolve(prepared, "batches", file), "utf8"),
  );
  for (const write of batch.writes ?? []) {
    if (write.after?.resultOrigin === "relay_leadoff")
      leadOffs.push({ id: write.path.slice("swims/".length), ...write.after });
    if (
      !splitUpdate &&
      write.path.startsWith("swims/") &&
      write.after?.isRelay === false &&
      write.after?.status === "OK" &&
      write.after?.splitCoverage === "complete" &&
      write.after?.splits?.length
    )
      splitUpdate = {
        id: write.path.slice("swims/".length),
        ...write.after,
      };
  }
}
assert.ok(
  leadOffs.length,
  "Prepared verified lead-offs are required for this release check.",
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(30000);
const errors = [];
const apiFailures = [];
const apiResponses = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  const url = new URL(response.url());
  if (url.pathname === "/api/times") {
    if (response.status() >= 400)
      apiFailures.push({
        status: response.status(),
        view: url.searchParams.get("view"),
      });
    apiResponses.push({
      view: url.searchParams.get("view"),
      params: Object.fromEntries(url.searchParams),
      status: response.status(),
    });
  }
});

async function times(view, input = {}) {
  const params = new URLSearchParams({ view });
  for (const [key, value] of Object.entries(input))
    params.set(key, String(value));
  const response = await page.request.get(
    new URL("/api/times?" + params, base).href,
  );
  assert.equal(response.status(), 200, "Live API failed for " + view);
  return response.json();
}
function publicRace(race) {
  assert.ok(race && race.id, "Expected a published public race.");
  const forbidden = [
    "sourceObservation",
    "sourceRecords",
    "metadata",
    "leadOffVerification",
    "birthDate",
    "dob",
    "registration",
    "email",
    "privateRegistration",
  ];
  for (const key of forbidden)
    assert.ok(!Object.hasOwn(race, key), "Private field exposed: " + key);
  for (const member of race.members ?? []) {
    assert.ok(
      Object.keys(member).every((key) =>
        [
          "leg",
          "athleteId",
          "name",
          "gender",
          "stroke",
          "timeMs",
          "leadOffEligible",
        ].includes(key),
      ),
      "Unexpected public member field.",
    );
  }
  for (const split of race.splits ?? [])
    assert.ok(
      Object.keys(split).every((key) =>
        ["distance", "cumulativeMs", "lapMs"].includes(key),
      ),
      "Unexpected public split field.",
    );
}
async function chooseEvent(label, event) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: eventLabel(event), exact: true })
    .click();
}
async function fullScreenshot(file) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.scrollTo({ top: 0, behavior: "instant" });
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
  await page.screenshot({ path: resolve(output, file), fullPage: true });
}
const detail = page.getByRole("complementary", {
  name: "Performance analysis",
});
try {
  const facets = await times("facets");
  assert.ok(
    facets.relayEvents?.length,
    "Relay facets must contain published events.",
  );
  const mixed = await times("rankings", {
    relay: true,
    course: "SCY",
    event: "200_MED-R",
    genders: "X",
    mode: "performances",
    limit: 25,
  });
  assert.ok(
    mixed.total > 0 && mixed.rows.length,
    "Mixed medley relay rankings must exist.",
  );
  for (const { race } of mixed.rows) {
    publicRace(race);
    assert.equal(race.relay, true);
    assert.equal(race.gender, "X");
    assert.equal(race.athleteId, "");
  }
  const selectedMixed = mixed.rows.find(
    ({ race }) => race.members?.length === 4 && race.splits?.length,
  )?.race;
  assert.ok(
    selectedMixed,
    "A first-page mixed relay with members and splits is needed.",
  );
  assert.ok(
    relays.some((race) => race.id === selectedMixed.id),
    "Selected public relay must match the reviewed import.",
  );

  const velocityRecords = await times("records", { team: "velocity-swimming" });
  const relayRecord = velocityRecords.races.find(
    (race) => race.relay && race.gender !== "X" && race.members?.length === 4,
  );
  assert.ok(
    relayRecord,
    "Velocity relay records need a complete reported lineup.",
  );
  publicRace(relayRecord);
  let lead, profile;
  for (const candidate of leadOffs) {
    const current = await times("profile", { athleteId: candidate.athleteId });
    if (current.pbs?.some((race) => race.id === candidate.id)) {
      lead = candidate;
      profile = current;
      break;
    }
  }
  assert.ok(
    lead && profile,
    "At least one verified lead-off must become an actual individual PB.",
  );
  const eligible = profile.pbs.find((race) => race.id === lead.id);
  publicRace(eligible);
  assert.equal(eligible.relay, false);
  assert.equal(eligible.resultOrigin, "relay_leadoff");
  assert.equal(eligible.parentRelayResultId, lead.parentRelayResultId);
  const participation = await times("athlete_relays", {
    athleteId: lead.athleteId,
    limit: 25,
  });
  assert.ok(
    participation.total > 0 && participation.rows.length,
    "Lead-off swimmer must have relay participation.",
  );
  assert.ok(
    participation.rows.every(({ race }) =>
      race.members?.some((member) => member.athleteId === lead.athleteId),
    ),
  );
  if (participation.total > 1) {
    const firstRelayPage = await times("athlete_relays", {
      athleteId: lead.athleteId,
      limit: 1,
      offset: 0,
    });
    const secondRelayPage = await times("athlete_relays", {
      athleteId: lead.athleteId,
      limit: 1,
      offset: 1,
    });
    assert.equal(firstRelayPage.total, participation.total);
    assert.equal(secondRelayPage.total, participation.total);
    assert.equal(firstRelayPage.rows.length, 1);
    assert.equal(secondRelayPage.rows.length, 1);
    assert.notEqual(
      firstRelayPage.rows[0].race.id,
      secondRelayPage.rows[0].race.id,
      "Relay participation pagination must advance to a distinct team result.",
    );
  }

  const championshipRelayResults = await times("meet_results", {
    meetId: lead.meet.id,
    relay: true,
    limit: 25,
  });
  assert.ok(
    championshipRelayResults.total > 0 && championshipRelayResults.rows.length,
    "Championship relay meet results must load without a scan timeout.",
  );
  assert.ok(championshipRelayResults.rows.every(({ race }) => race.relay));
  assert.ok(splitUpdate, "A reviewed individual split update is required.");
  const individualResult = await times("race", { raceId: splitUpdate.id });
  const individual = individualResult.rows?.[0]?.race;
  publicRace(individual);
  assert.equal(individual.relay, false);
  assert.equal(individual.splitCoverage, "complete");
  assert.deepEqual(individual.splits, splitUpdate.splits);
  await page.goto(new URL("/tools/times", base).href);
  await page.getByRole("table").first().waitFor();
  await page.getByRole("button", { name: "Relays", exact: true }).click();
  await page.getByRole("button", { name: "Mixed", exact: true }).click();
  await page.getByRole("button", { name: "Female", exact: true }).click();
  await chooseEvent("Event", "200_MED-R");
  await page
    .getByRole("button", {
      name: `Analyze ${formatSwimTime(selectedMixed.time)} by ${resultName(selectedMixed, new Map())}`,
      exact: true,
    })
    .first()
    .click();
  await detail
    .getByRole("heading", { name: "Relay lineup", exact: true })
    .waitFor();
  assert.equal(await detail.getByRole("listitem").count(), 4);
  await detail
    .getByRole("region", { name: "Race splits" })
    .getByRole("table")
    .waitFor();
  for (const member of selectedMixed.members)
    await detail.getByText(member.name, { exact: true }).waitFor();
  await detail
    .getByText(/eligible relay performances in this comparison group/)
    .waitFor();
  await fullScreenshot("mixed-relay-lineup-splits.png");

  await page.getByRole("button", { name: "Meet results", exact: true }).click();
  await page
    .getByLabel("Search meets", { exact: true })
    .fill(selectedMixed.meet);
  await page.getByText(selectedMixed.meet, { exact: true }).first().click();
  const meetHeading = page.getByRole("heading", {
    name: selectedMixed.meet,
    exact: true,
  });
  await meetHeading.waitFor();
  const meetPanel = page
    .locator('section[tabindex="-1"]')
    .filter({ has: meetHeading });
  await meetPanel
    .getByRole("table")
    .getByRole("columnheader", { name: "Athlete", exact: true })
    .waitFor();
  assert.equal(
    await meetPanel
      .getByRole("button", { name: "Individual", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await meetPanel.getByRole("button", { name: "Relays", exact: true }).click();
  assert.equal(
    await page.getByLabel("Search meets", { exact: true }).inputValue(),
    selectedMixed.meet,
    "Changing Individual/Relays must preserve the meet-name search.",
  );
  await chooseEvent("Meet event", "200_MED-R");
  await meetPanel.getByRole("button", { name: "Mixed", exact: true }).click();
  await meetPanel
    .getByRole("table")
    .getByRole("columnheader", { name: "Relay team", exact: true })
    .waitFor();
  await meetPanel
    .getByRole("button", {
      name: `Analyze ${formatSwimTime(selectedMixed.time)} by ${resultName(selectedMixed, new Map())}`,
      exact: true,
    })
    .first()
    .click();
  await detail
    .getByRole("heading", { name: "Relay lineup", exact: true })
    .waitFor();
  await detail
    .getByRole("region", { name: "Race splits" })
    .getByRole("table")
    .waitFor();
  await detail
    .getByText(/eligible relay performances in this comparison group/)
    .waitFor();
  await fullScreenshot("meet-mixed-relay-details.png");
  await page.getByRole("button", { name: "Team Records", exact: true }).click();
  await page.getByRole("region", { name: "Team records" }).waitFor();
  for (const member of relayRecord.members) {
    await page
      .getByRole("region", { name: "Team records" })
      .locator("small")
      .filter({ hasText: member.name })
      .first()
      .waitFor();
  }
  await page
    .getByRole("region", { name: "Team records" })
    .locator("small")
    .filter({ hasText: relayRecord.members[0].name })
    .first()
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: resolve(output, "velocity-relay-records.png"),
    fullPage: false,
  });

  await page
    .getByRole("button", { name: "Event rankings", exact: true })
    .click();
  await page
    .getByRole("button", { name: individual.course, exact: true })
    .click();
  await chooseEvent("Event", individual.event);
  if (individual.gender === "M") {
    await page.getByRole("button", { name: "Male", exact: true }).click();
    await page.getByRole("button", { name: "Female", exact: true }).click();
  }
  await page.getByRole("button", { name: "Performances", exact: true }).click();
  await page
    .getByLabel("Search athletes", { exact: true })
    .fill(individual.athleteName);
  await page
    .getByRole("button", {
      name: `Analyze ${formatSwimTime(individual.time)} by ${individual.athleteName}`,
      exact: true,
    })
    .first()
    .click();
  const individualSplits = detail.getByRole("region", { name: "Race splits" });
  await individualSplits.getByRole("table").waitFor();
  assert.equal(
    await individualSplits.locator("tbody tr").count(),
    individual.splits.length,
  );
  for (const split of individual.splits)
    await individualSplits
      .getByRole("rowheader", {
        name: `${split.distance} ${individual.course === "SCY" ? "yd" : "m"}`,
        exact: true,
      })
      .waitFor();
  await detail.getByText("Performance percentile", { exact: true }).waitFor();
  await fullScreenshot("individual-validated-splits.png");

  await page
    .getByRole("button", { name: "Event rankings", exact: true })
    .click();
  await chooseEvent("Event", eligible.event);
  if (eligible.gender === "M") {
    await page.getByRole("button", { name: "Male", exact: true }).click();
    await page.getByRole("button", { name: "Female", exact: true }).click();
  }
  await page.getByLabel("Search athletes", { exact: true }).fill(profile.name);
  const leadButton = page.getByRole("button", {
    name: `Analyze ${formatSwimTime(eligible.time)} by ${profile.name}`,
    exact: true,
  });
  await leadButton.click();
  await detail.getByText("Verified relay lead-off", { exact: true }).waitFor();
  await detail
    .getByRole("button", { name: "Load parent relay", exact: true })
    .click();
  const parentResult = await times("race", {
    raceId: lead.parentRelayResultId,
  });
  const parent = parentResult.rows?.[0]?.race;
  publicRace(parent);
  assert.equal(parent.relay, true);
  await detail
    .getByRole("button", {
      name: "View parent relay · " + eventLabel(parent.event),
      exact: true,
    })
    .click();
  await detail
    .getByRole("heading", { name: "Relay lineup", exact: true })
    .waitFor();
  await detail.getByRole("button", { name: profile.name, exact: true }).click();
  const heading = page.getByRole("heading", {
    name: profile.name,
    exact: true,
  });
  await heading.waitFor();
  const profilePanel = page
    .locator('section[tabindex="-1"]')
    .filter({ has: heading });
  await profilePanel
    .getByText("Verified lead-off", { exact: true })
    .first()
    .waitFor();
  const leadPB = profilePanel
    .getByRole("button")
    .filter({ hasText: "Verified lead-off" })
    .filter({ hasText: formatSwimTime(eligible.time) });
  await leadPB.scrollIntoViewIfNeeded();
  await leadPB.click();
  await profilePanel
    .getByRole("navigation", { name: "Result pages", exact: true })
    .waitFor();
  await profilePanel
    .getByRole("table")
    .first()
    .getByText("Verified lead-off", { exact: true })
    .waitFor();
  const relayHistory = page.getByRole("region", {
    name: "Athlete relay participation",
  });
  await relayHistory.getByRole("table").waitFor();
  assert.equal(
    await relayHistory.locator("tbody tr").count(),
    Math.min(participation.total, 25),
    "First relay history page must include exactly the published page size.",
  );
  const relayPager = relayHistory.getByRole("navigation", {
    name: "Relay participation pages",
  });
  assert.equal(
    await relayPager
      .getByRole("button", { name: "Previous", exact: true })
      .isDisabled(),
    true,
  );
  if (participation.total > 25) {
    await relayHistory
      .getByRole("navigation", { name: "Relay participation pages" })
      .getByRole("button", { name: "Next", exact: true })
      .click();
    await relayHistory
      .getByText(
        new RegExp(`26–.* of ${participation.total.toLocaleString("en-US")}`),
      )
      .waitFor();
    assert.equal(
      await relayHistory.locator("tbody tr").count(),
      Math.min(participation.total - 25, 25),
      "Second relay history page must include exactly the remaining published page size.",
    );
    assert.equal(
      await relayPager
        .getByRole("button", { name: "Previous", exact: true })
        .isDisabled(),
      false,
    );
  } else {
    assert.equal(
      await relayPager
        .getByRole("button", { name: "Next", exact: true })
        .isDisabled(),
      true,
      "Single-page relay history must disable Next.",
    );
  }
  await fullScreenshot("verified-leadoff-athlete-relays.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await leadPB.scrollIntoViewIfNeeded();
  const relayScroll = await relayHistory
    .getByRole("table")
    .evaluate((table) => {
      const container = table.parentElement;
      container.scrollLeft = container.scrollWidth;
      return { left: container.scrollLeft, width: container.clientWidth };
    });
  assert.ok(
    relayScroll.left > 0 && relayScroll.width < 390,
    "Mobile relay table must scroll within the profile to reveal leg/team time.",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile profile must stay within the viewport.",
  );
  await fullScreenshot("mobile-athlete-relays.png");
  assert.deepEqual(errors, [], "Unexpected browser errors.");
  assert.deepEqual(apiFailures, [], "Unexpected API failures.");
  const result = {
    checkedAt: new Date().toISOString(),
    url: base,
    mixedRelayCount: mixed.total,
    championshipRelayResultCount: championshipRelayResults.total,
    mixedMeetId: selectedMixed.meetId,
    mixedRelayId: selectedMixed.id,
    relayRecordId: relayRecord.id,
    individualSplitResultId: individual.id,
    verifiedLeadOffId: lead.id,
    parentRelayId: parent.id,
    athleteId: lead.athleteId,
    athleteName: profile.name,
    athleteRelayCount: participation.total,
    apiCalls: apiResponses,
    errors,
    apiFailures,
  };
  await writeFile(
    resolve(output, "verification.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    "Live relay browser verification passed: " +
      JSON.stringify({
        mixedRelays: mixed.total,
        athlete: profile.name,
        athleteRelays: participation.total,
        leadOff: lead.id,
        output,
      }),
  );
} catch (error) {
  await page
    .screenshot({ path: resolve(output, "failure.png"), fullPage: true })
    .catch(() => {});
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify(
      {
        error: error.message,
        pageUrl: page.url(),
        errors,
        apiFailures,
        apiResponses,
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  await browser.close();
}
