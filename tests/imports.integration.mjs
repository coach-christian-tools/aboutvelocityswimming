import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const workdir = process.env.VELOCITY_IMPORT_TEST_WORKDIR ?? ".";
const config = readFileSync(join(workdir, "supabase/config.toml"), "utf8");
const project = config.match(/^project_id = "([a-zA-Z0-9_-]+)"/m)?.[1];
assert.ok(project);
const status = JSON.parse(execFileSync("supabase", ["status", "--workdir", workdir, "--output", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
}));
assert.match(status.API_URL, /^http:\/\/127\.0\.0\.1:\d+$/, "Import tests require a loopback Supabase project.");
const client = (key = status.PUBLISHABLE_KEY) => createClient(status.API_URL, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const admin = client(status.SERVICE_ROLE_KEY);
const anon = client();
const token = randomUUID();
const prefix = `velocity-import-${randomUUID()}`;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const sql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${sql(JSON.stringify(value))}::jsonb`;
const write = (path, data) => `select private.put_record(${sql(path)}, ${json(data)});`;
function db(statement) {
  return execFileSync("docker", ["exec", "-i", `supabase_db_${project}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

async function rpc(c, name, args) {
  const result = await c.rpc(name, args).abortSignal(AbortSignal.timeout(15000));
  assert.ifError(result.error);
  return result.data;
}

function batch(label, rows, division = "times") {
  return {
    division, rows, sourceUrl: `https://example.test/imports/${prefix}/${label}`,
    capturedAt: "2026-11-10T15:00:00Z", coverage: "partial", sha256: digest(`${prefix}/${label}`), sourceScope: prefix,
  };
}

const athlete = { id: `${prefix}-swimmer`, name: { first: "Synthetic", last: "Swimmer" }, gender: "F", status: "active" };
const team = { id: `${prefix}-team`, name: "Synthetic Imports Team", lscCode: "IE", clubCode: "IEIMPORT" };
const meet = { id: `${prefix}-meet`, name: `${prefix} Synthetic Imports Meet`, dates: { startDate: "2026-11-10", endDate: "2026-11-10" } };
const earlierMeet = { id: `${prefix}-prior`, name: `${prefix} Prior Imports Meet`, dates: { startDate: "2026-10-10", endDate: "2026-10-10" } };
const earlier = {
  id: `${prefix}-earlier`, athleteId: athlete.id, teamId: team.id, eventCode: "100_FR_SCY", course: "SCY", distance: 100,
  stroke: "FR", round: "F", gender: "F", ageAtSwim: 15, ageGroup: "15-16", timeMs: 63000,
  status: "OK", isOfficial: true, isRelay: false,
  meet: { id: earlierMeet.id, date: earlierMeet.dates.startDate, name: earlierMeet.name },
};
const faster = { ...earlier, id: `${prefix}-faster`, timeMs: 55000, meet: { id: meet.id, date: meet.dates.startDate, name: meet.name } };
const newcomer = {
  id: `${prefix}-newcomer`, name: { first: "Synthetic", last: "Newcomer" }, gender: "F", status: "active",
  sourceObservation: { memberIdHash: digest(prefix).slice(0, 24) },
};
const newer = { ...faster, id: `${prefix}-new-race`, athleteId: newcomer.id, timeMs: 67000 };
const late = { ...faster, id: `${prefix}-late`, round: "P", timeMs: 56000 };
const row = (kind, data, other = {}) => ({ kind, id: data.id, data, ...other });

async function account(userIds, label, staff = false) {
  const email = `${prefix}-${label}@example.test`;
  const password = `${randomUUID()}!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const userId = created.data.user.id;
  userIds.push(userId);
  if (staff) {
    const result = await admin.from("administrators").insert({ user_id: userId });
    assert.ifError(result.error);
  }
  const session = client();
  const signedIn = await session.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  return session;
}

test("private import, frozen review and transactional publication", async (t) => {
  const userIds = [];
  t.after(async () => {
    db(`begin;
      set local velocity.defer_bests = 'true';
      delete from private.velocity_import_selection_rows where row_id in (
        select r.id from private.velocity_import_rows r join private.velocity_import_batches b on b.id = r.batch_id where b.source_scope = ${sql(prefix)}
      );
      delete from private.velocity_import_rows where batch_id in (select id from private.velocity_import_batches where source_scope = ${sql(prefix)});
      delete from private.velocity_import_batches where source_scope = ${sql(prefix)};
      delete from private.collection_workers where name in (${sql(prefix)},${sql(`${prefix}-catalog`)});
      delete from public.swims where id like ${sql(`${prefix}%`)};
      delete from public.relay_results where id like ${sql(`${prefix}%`)};
      delete from public.athlete_bests where athlete_id like ${sql(`${prefix}%`)};
      delete from public.athletes where id like ${sql(`${prefix}%`)};
      delete from public.people where id like ${sql(`person_${prefix}%`)};
      delete from public.meets where id like ${sql(`${prefix}%`)};
      delete from public.teams where id = ${sql(team.id)};
      delete from public.knowledge_entries where id like ${sql(`${prefix}%`)};
      commit;`);
    for (const userId of userIds) {
      assert.ifError((await admin.from("administrators").delete().eq("user_id", userId)).error);
      assert.ifError((await admin.auth.admin.deleteUser(userId)).error);
    }
  });
  const staff = await account(userIds, "staff", true);
  const nonStaff = await account(userIds, "member");
  const stage = (capture) => rpc(anon, "stage_velocity_import", { worker_token: token, batch: capture });
  const list = (kind, input = {}) => rpc(staff, "velocity_import_queue", { input: { kind, ...input } });
  const select = (input) => rpc(staff, "velocity_import_selection", { input });
  const approve = (selectionId) => rpc(staff, "approve_velocity_import", { selection_id: selectionId });
  const times = (query_kind, input) => rpc(anon, "ies_times_query", { query_kind, input });
  const archive = () => rpc(anon, "archive_observatory", { input: { meet: meet.id } });
  const best = () => db(`select data->>'swimId' from public.athlete_bests where athlete_id=${sql(athlete.id)} and event_code='100_FR_SCY';`);
  const source = batch("main", [
    row("meet", meet), row("swim", faster, { locator: "Event 1" }),
    row("swim", newer, { prerequisites: [row("athlete", newcomer)] }),
  ]);

  db(`insert into private.collection_workers(name,token_hash,divisions) values (${sql(prefix)},${sql(digest(token))},array['times']);
    ${write(`teams/${team.id}`, team)}
    ${write(`athletes/${athlete.id}`, athlete)}
    ${write(`meets/${earlierMeet.id}`, earlierMeet)}
    ${write(`swims/${earlier.id}`, earlier)}`);

  const staged = await stage(source);
  assert.equal(staged.staged, 3);
  assert.equal((await stage(source)).staged, 0);
  const badScope = await anon.rpc("stage_velocity_import", { worker_token: token, batch: batch("wrong-scope", source.rows, "knowledge") });
  assert.equal(badScope.error?.code, "42501");
  for (const session of [anon, nonStaff]) {
    const attempt = await session.rpc("velocity_import_queue", { input: { kind: "swims" } });
    assert.ok(attempt.error, "non-staff must be denied private queue access");
  }

  const { rows: meetRows } = await list("meets", { batchId: staged.batchId });
  const { rows: swimRows } = await list("swims", { batchId: staged.batchId });
  assert.equal(meetRows.length, 1);
  assert.equal(swimRows.length, 2);
  const fasterRow = swimRows.find((item) => item.recordId === faster.id);
  const detail = await rpc(staff, "velocity_import_detail", { input: { id: fasterRow.id } });
  assert.equal(detail.sourceUrl, source.sourceUrl);
  assert.equal(detail.sha256, source.sha256);
  assert.equal(detail.locator, "Event 1");
  assert.equal((await times("meet_results", { meetId: meet.id })).total, 0);
  assert.equal((await archive()).totals.swims, 0);
  assert.equal(best(), earlier.id);
  assert.ok((await times("records", { team: team.id })).races.some((race) => race.id === earlier.id));

  const swimSnapshot = await select({ matches: [{ kind: "swims", batchId: staged.batchId }], preview: false });
  assert.equal(swimSnapshot.selected, 2);
  assert.equal((await staff.rpc("approve_velocity_import", { selection_id: swimSnapshot.selectionId })).error?.code, "PT404");
  await stage({ ...source, rows: [row("swim", late)] });
  const preview = await select({ ids: [meetRows[0].id], selectionIds: [swimSnapshot.selectionId] });
  assert.equal(preview.selected, 3);
  assert.equal(preview.blocked, 0, JSON.stringify(preview.blockers));
  assert.ok(preview.prerequisites.some(({ kind, id }) => kind === "athlete" && id === newcomer.id));
  const selected = await list("swims", { selectionIds: [preview.selectionId], onlySelected: true });
  assert.equal(selected.total, 2);
  assert.ok(selected.rows.every(({ blocker }) => blocker === null));

  // An unrelated canonical write and a duplicate approval request must both be safe.
  db(write(`meets/${prefix}-unrelated`, { name: "Unrelated canonical write" }));
  const receipts = await Promise.all([approve(preview.selectionId), approve(preview.selectionId)]);
  assert.ok(receipts.every(({ done, approved }) => done && approved === 3));
  assert.equal(receipts.reduce((sum, result) => sum + result.published, 0), 3);
  assert.equal((await times("meet_results", { meetId: meet.id })).total, 2);
  assert.equal((await archive()).totals.swims, 2);
  assert.equal(best(), faster.id);
  assert.ok((await times("records", { team: team.id })).races.some((race) => race.id === faster.id));
  const remaining = await list("swims", { batchId: staged.batchId });
  assert.ok(remaining.rows.some(({ recordId }) => recordId === late.id));

  const conflict = await stage(batch("correction", [row("swim", { ...faster, timeMs: 54000 })]));
  assert.equal(conflict.blocked, 1);
  assert.equal(best(), faster.id);
  const publicRace = await anon.from("public_swims").select("data").eq("id", faster.id).single();
  assert.ifError(publicRace.error);
  assert.equal(publicRace.data.data.timeMs, 55000);

  const missingMeet = { ...meet, id: `${prefix}-blocked-meet`, name: `${prefix} Initially Missing Meet` };
  const blockedRace = {
    ...faster, id: `${prefix}-blocked-race`,
    meet: { ...faster.meet, id: missingMeet.id, name: missingMeet.name },
  };
  const pair = await stage(batch("blocked", [row("meet", missingMeet), row("swim", blockedRace)]));
  const blockedPreview = await select({ matches: [{ kind: "swims", batchId: pair.batchId }] });
  assert.equal(blockedPreview.blocked, 1);
  const blockers = await rpc(staff, "velocity_import_detail", { input: { selectionId: blockedPreview.selectionId, section: "blockers", offset: 0 } });
  assert.equal(blockers.total, 1);
  assert.match(blockers.rows[0].reason, /linked meet/i);
  const parentPreview = await select({ matches: [{ kind: "meets", batchId: pair.batchId }] });
  assert.equal((await approve(parentPreview.selectionId)).approved, 1);
  const blockedReceipt = await approve(blockedPreview.selectionId);
  assert.equal(blockedReceipt.approved, 0);
  assert.equal(blockedReceipt.blocked, 1);
  assert.equal((await times("meet_results", { meetId: missingMeet.id })).total, 0);
  const renewedPreview = await select({ matches: [{ kind: "swims", batchId: pair.batchId }] });
  assert.equal((await approve(renewedPreview.selectionId)).approved, 1);

  const relay = {
    id: `${prefix}-relay`, teamId: team.id, meet: faster.meet, eventCode: "200_FR-R_SCY", course: "SCY",
    distance: 200, stroke: "FR", round: "F", gender: "F", ageGroup: "15-16", timeMs: 120000,
    status: "OK", isOfficial: true, isRelay: true, relayName: "Synthetic A Relay", splitCoverage: "unavailable",
    members: [{ leg: 1, athleteId: athlete.id, name: "Synthetic Swimmer", stroke: "FR", gender: "F" }],
  };
  const relayCapture = await stage(batch("relay", [row("relay", relay)]));
  const publicRelay = () => anon.from("public_relay_results").select("data").eq("id", relay.id).maybeSingle();
  assert.equal((await publicRelay()).data, null);
  const relayPreview = await select({ matches: [{ kind: "swims", batchId: relayCapture.batchId }] });
  assert.equal((await approve(relayPreview.selectionId)).approved, 1);
  const publishedRelay = await publicRelay();
  assert.ifError(publishedRelay.error);
  assert.equal(publishedRelay.data.data.members[0].athleteId, athlete.id);

  const catalogToken = randomUUID();
  db(`insert into private.collection_workers(name,token_hash,divisions) values (${sql(`${prefix}-catalog`)},${sql(digest(catalogToken))},array['knowledge']);`);
  const catalogRows = Array.from({ length: 301 }, (_, i) => row("catalog_meet", {
    id: `${prefix}-catalog-${i}`, kind: "meet", title: `${prefix} Catalog Meet ${i}`, startsOn: "2026-11-10",
  }));
  const catalogBatch = batch("catalog", catalogRows.slice(0, 100), "knowledge");
  const catalogStage = (capture) => rpc(anon, "stage_velocity_import", { worker_token: catalogToken, batch: capture });
  const catalog = await catalogStage(catalogBatch);
  for (let offset = 100; offset < catalogRows.length; offset += 100) {
    const chunk = await catalogStage({ ...catalogBatch, rows: catalogRows.slice(offset, offset + 100) });
    assert.equal(chunk.batchId, catalog.batchId);
  }
  const page = await list("meets", { batchId: catalog.batchId });
  assert.equal(page.total, catalogRows.length);
  assert.ok(page.hasNext);
  assert.ok(page.rows.length < catalogRows.length);
  const catalogSnapshot = await select({ matches: [{ kind: "meets", batchId: catalog.batchId }] });
  assert.equal(catalogSnapshot.selected, catalogRows.length);
  assert.equal(catalogSnapshot.previewRemaining, 1);
  assert.equal((await staff.rpc("approve_velocity_import", { selection_id: catalogSnapshot.selectionId })).error?.code, "PT404");
  const catalogPreview = await select({ prepareSelectionId: catalogSnapshot.selectionId });
  assert.equal(catalogPreview.previewRemaining, 0);
  assert.equal(catalogPreview.selectionId, catalogSnapshot.selectionId);
  const before = await anon.from("knowledge_entries").select("id").eq("id", catalogRows[0].id);
  assert.ifError(before.error);
  assert.deepEqual(before.data, []);
  const chunk = await approve(catalogSnapshot.selectionId);
  assert.equal(chunk.done, false);
  assert.equal(chunk.approved + chunk.remaining, catalogRows.length);
  let receipt = chunk;
  for (let offset = 100; offset < catalogRows.length; offset += 100) {
    const next = await approve(catalogSnapshot.selectionId);
    assert.ok(next.remaining < receipt.remaining);
    receipt = next;
  }
  assert.equal(receipt.done, true);
  assert.equal(receipt.approved, catalogRows.length);
  const after = await anon.from("knowledge_entries").select("id").eq("id", catalogRows[0].id).single();
  assert.ifError(after.error);
  assert.equal(after.data.id, catalogRows[0].id);
});
