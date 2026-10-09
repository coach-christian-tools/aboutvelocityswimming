import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
const config = JSON.parse(
  execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
assert.equal(
  config.API_URL,
  "http://127.0.0.1:54321",
  "Integration tests refuse hosted databases.",
);
const make = () =>
  createClient(config.API_URL, config.PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anon = make(),
  staff = make(),
  familyA = make(),
  familyB = make();
const login = async (client, email) => {
  const { error } = await client.auth.signInWithPassword({
    email,
    password: "Velocity-local-test-2026!",
  });
  assert.ifError(error);
};
await login(staff, "coach@velocity-swimming.com");
await login(familyA, "family-a@example.test");
await login(familyB, "family-b@example.test");
const query = async (client, path) => {
  const { data, error } = await client.rpc("query_records", {
    collection_path: path,
  });
  assert.ifError(error);
  return data;
};
const record = async (client, path) => {
  const parts = path.split("/");
  const { data, error } = await client.rpc("query_records", {
    collection_path: parts.slice(0, -1).join("/"),
    record_id: parts.at(-1),
  });
  assert.ifError(error);
  return data?.[0]?.data ?? null;
};
const collect = async (path, after) => {
  const { error } = await admin.rpc("collect_records", {
    reads: [],
    writes: [{ path, after }],
  });
  assert.ifError(error);
};
const action = async (client, operation, input) =>
  client.rpc("workshare_action", { operation, input });
await test("database policies isolate family records and staff data", async () => {
  assert.deepEqual(
    (await query(familyA, "families")).map((r) => r.path),
    ["families/family-a"],
  );
  assert.deepEqual(
    (await query(familyB, "families")).map((r) => r.path),
    ["families/family-b"],
  );
  assert.equal((await query(familyA, "athletes")).length, 0);
  assert.equal((await query(anon, "families")).length, 0);
  assert.equal((await query(anon, "sources")).length, 0);
  assert.equal((await query(staff, "athletes")).length, 2);
  assert.equal((await query(anon, "public_athletes")).length, 2);
  assert.equal((await staff.rpc("is_staff")).data, true);
  assert.equal((await familyA.rpc("is_staff")).data, false);
  const denied = await familyA.rpc("commit_records", {
    reads: [],
    writes: [{ path: "teams/forged", after: { name: "forged" } }],
  });
  assert.ok(denied.error);
  await familyA
    .from("families")
    .update({ data: { accountName: "forged" } })
    .eq("id", "family-b");
  assert.equal(
    await record(familyB, "families/family-b").then((r) => r.accountName),
    "Example Family B",
  );
  const stored = await record(familyA, "families/family-a");
  assert.equal(stored.children[0].id, "test-swimmer-a");
  assert.equal(stored.children[0].name, "Avery Example");
});
await test("reviewed writes reject stale state and roll back all writes", async () => {
  const before = await record(staff, "teams/velocity-swimming");
  const commit = await staff.rpc("commit_records", {
    reads: [{ path: "teams/velocity-swimming", before }],
    writes: [
      {
        path: "teams/velocity-swimming",
        after: { ...before, name: "Synthetic updated team" },
      },
    ],
  });
  assert.ifError(commit.error);
  const stale = await staff.rpc("commit_records", {
    reads: [{ path: "teams/velocity-swimming", before }],
    writes: [
      { path: "teams/should-not-exist", after: { name: "Bad" } },
      { path: "teams/velocity-swimming", after: before },
    ],
  });
  assert.equal(stale.error?.code, "40001");
  assert.equal(await record(staff, "teams/should-not-exist"), null);
  await collect("teams/velocity-swimming", before);
});
await test("bests follow corrections, invalid status, deletion, and relay eligibility", async () => {
  const first = await record(staff, "swims/test-race-1");
  let best = await query(anon, "athletes/test-swimmer-a/bests");
  assert.equal(best[0].data.bestTimeMs, 64000);
  await collect("swims/test-race-1", { ...first, status: "DQ" });
  best = await query(anon, "athletes/test-swimmer-a/bests");
  assert.equal(best[0].data.bestTimeMs, 65000);
  await collect("swims/test-race-1", {
    ...first,
    timeMs: 63000,
    isRelay: true,
    relay: { isLeadOffFlatStart: false },
  });
  assert.equal(
    (await query(anon, "athletes/test-swimmer-a/bests"))[0].data.bestTimeMs,
    65000,
  );
  await collect("swims/test-race-1", {
    ...first,
    timeMs: 63000,
    isRelay: true,
    relay: { isLeadOffFlatStart: true },
  });
  assert.equal(
    (await query(anon, "athletes/test-swimmer-a/bests"))[0].data.bestTimeMs,
    63000,
  );
  await collect("swims/test-race-1", null);
  assert.equal(
    (await query(anon, "athletes/test-swimmer-a/bests"))[0].data.bestTimeMs,
    65000,
  );
  await collect("swims/test-race-1", first);
});
await test("invitations preserve scope, hide family data, and serialize the final spot", async () => {
  const base = await record(staff, "postings/test-shift");
  const shiftId = "capacity-" + Date.now();
  await collect("postings/" + shiftId, {
    ...base,
    id: shiftId,
    positions: { min: 1, desired: 1, max: 1 },
  });
  const forged = await action(familyB, "createGuestInvitation", {
    familyId: "family-a",
    postingId: shiftId,
  });
  assert.ok(forged.error);
  const created = await action(familyA, "createGuestInvitation", {
    familyId: "family-a",
    postingId: shiftId,
  });
  assert.ifError(created.error);
  const token = created.data.token;
  const preview = await action(anon, "getGuestInvitation", { token });
  assert.ifError(preview.error);
  assert.equal(preview.data.authorizedEmails, undefined);
  const requests = await Promise.all([
    action(anon, "redeemGuestInvitation", {
      token,
      firstName: "Guest",
      lastName: "Example",
      relation: "Friend",
      familyId: "family-b",
      postingId: "forged",
    }),
    action(familyB, "registerForShift", {
      familyId: "family-b",
      postingId: shiftId,
      name: "Second Volunteer",
    }),
  ]);
  assert.equal(requests.filter((r) => !r.error).length, 1);
  const registrations = await query(staff, "registrations");
  assert.equal(
    registrations.filter((r) => r.data.postingId === shiftId).length,
    1,
  );
  if (!requests[0].error) {
    const retry = await action(anon, "redeemGuestInvitation", {
      token,
      firstName: "Guest",
      lastName: "Example",
      relation: "Friend",
    });
    assert.ifError(retry.error);
    assert.equal(retry.data.registrationId, requests[0].data.registrationId);
    const reg = registrations.find((r) =>
      r.path.endsWith(retry.data.registrationId),
    );
    assert.equal(reg.data.familyId, "family-a");
  }
  const denied = await action(anon, "redeemGuestInvitation", {
    token: "bad",
    firstName: "Guest",
    lastName: "Example",
    relation: "Friend",
  });
  assert.ok(denied.error);
});
await test("completed hour snapshots survive shift edits", async () => {
  const base = await record(staff, "postings/test-shift");
  const regId = "credit-" + Date.now();
  await collect("registrations/" + regId, {
    postingId: "test-shift",
    familyId: "family-a",
    assignee: { name: "Credit Test " + regId, isGuest: false },
    status: "Complete",
  });
  await collect("postings/test-shift", {
    ...base,
    endTime: new Date(
      new Date(base.startTime).getTime() + 7200000,
    ).toISOString(),
  });
  const reg = await record(staff, "registrations/" + regId);
  assert.equal(reg.shiftSnapshot.endTime, base.endTime);
  await collect("postings/test-shift", base);
});
await test("private captures deny public access and immutable evidence prevents overwrite", async () => {
  const bytes = new TextEncoder().encode("synthetic evidence");
  const hash = Buffer.from(
    await crypto.subtle.digest("SHA-256", bytes),
  ).toString("hex");
  const path = "evidence/127/velocity-v2/test-source/" + hash;
  const { error: upload } = await admin.storage
    .from("evidence")
    .upload(path, bytes, { upsert: false });
  if (upload && !upload.message.includes("already")) assert.ifError(upload);
  await collect("sources/test-source", {
    id: "test-source",
    name: "Synthetic source",
    reference: "https://example.test/evidence",
    enabled: true,
  });
  const revisionPath = "sources/test-source/revisions/" + hash;
  const value = {
    hash,
    bucket: "evidence",
    storagePath: path,
    contentType: "text/plain",
  };
  const existing = await record(staff, revisionPath);
  if (!existing) await collect(revisionPath, value);
  const denied = await anon.storage.from("evidence").download(path);
  assert.ok(denied.error);
  const allowed = await staff.storage.from("evidence").download(path);
  assert.ifError(allowed.error);
  const overwrite = await admin.rpc("collect_records", {
    reads: [],
    writes: [{ path: revisionPath, after: { ...value, hash: "forged" } }],
  });
  assert.ok(overwrite.error);
});
await test("authorization uses verified server identity and explicit administrator records", async () => {
  const user = (await familyA.auth.getUser()).data.user;
  await familyA.auth.updateUser({
    data: { staff: true, isAdmin: true, role: "administrator" },
  });
  assert.equal((await familyA.rpc("is_staff")).data, false);
  let result = await admin.from("administrators").insert({ user_id: user.id });
  assert.ifError(result.error);
  assert.equal((await familyA.rpc("is_staff")).data, true);
  await admin.from("administrators").delete().eq("user_id", user.id);
  assert.equal((await familyA.rpc("is_staff")).data, false);
  const users = (await admin.auth.admin.listUsers()).data.users;
  const unverified = users.find(
    (u) => u.email === "unverified@velocity-swimming.com",
  );
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
      `begin;set local role authenticated;select set_config('request.jwt.claim.sub','${unverified.id}',true);do $$ begin if private.is_staff() then raise exception 'Unverified staff gained access';end if;end $$;rollback;`,
    ],
    { stdio: "pipe" },
  );
});
await test("Times roster edits preserve independent Workshare identities and update inactive ranks", async () => {
  const before = await record(staff, "athletes/test-swimmer-a");
  await collect("athletes/test-swimmer-a", {
    ...before,
    name: { first: "Avery", last: "Updated" },
    currentGroup: { ...before.currentGroup, name: "Seniors", id: "seniors" },
    status: "inactive",
  });
  const family = await record(familyA, "families/family-a");
  assert.equal(family.children[0].name, "Avery Example");
  assert.equal(family.children[0].group, "Juniors");
  const best = (await query(anon, "athletes/test-swimmer-a/bests"))[0].data;
  assert.equal(best.clubRankActiveRoster, null);
  await collect("athletes/test-swimmer-a", before);
  const invalid = await staff.rpc("commit_records", {
    reads: [],
    writes: [{ path: "teams/no-reviewed-state", after: { name: "Forged" } }],
  });
  assert.ok(invalid.error);
});
await test("expired and revoked invitations cannot create registrations", async () => {
  const created = await action(familyA, "createGuestInvitation", {
    familyId: "family-a",
    postingId: "test-shift",
  });
  assert.ifError(created.error);
  await action(familyA, "revokeGuestInvitation", {
    invitationId: created.data.invitationId,
  });
  assert.ok(
    (
      await action(anon, "redeemGuestInvitation", {
        token: created.data.token,
        firstName: "Test",
        lastName: "Guest",
        relation: "Friend",
      })
    ).error,
  );
  const expired = await action(familyA, "createGuestInvitation", {
    familyId: "family-a",
    postingId: "test-shift",
  });
  assert.ifError(expired.error);
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
      `update private.guest_invitations set expires_at=now()-interval '1 minute' where id='${expired.data.invitationId}'`,
    ],
    { stdio: "pipe" },
  );
  assert.ok(
    (await action(anon, "getGuestInvitation", { token: expired.data.token }))
      .error,
  );
});
await test("reminder queue claims once across workers and preserves delivery receipts", async () => {
  const base = await record(staff, "postings/test-shift"),
    id = "reminder-" + Date.now();
  const at = new Date();
  at.setDate(at.getDate() + 2);
  at.setUTCHours(18, 0, 0, 0);
  await collect("postings/" + id, {
    ...base,
    id,
    date: at.toISOString(),
    startTime: at.toISOString(),
    endTime: new Date(at.getTime() + 3600000).toISOString(),
  });
  await collect("registrations/" + id, {
    postingId: id,
    familyId: "family-a",
    assignee: { name: "Reminder Test", isGuest: false },
    status: "Pending",
  });
  const denied = await familyA.rpc("claim_shift_reminders", { dry_run: false });
  assert.ok(denied.error);
  const results = await Promise.all([
    admin.rpc("claim_shift_reminders", { dry_run: false }),
    admin.rpc("claim_shift_reminders", { dry_run: false }),
  ]);
  results.forEach((r) => assert.ifError(r.error));
  const matches = results
    .flatMap((r) => r.data)
    .filter((r) => r.registrationId === id);
  assert.equal(matches.length, 1);
  const reminder = matches[0];
  const finished = await admin.rpc("finish_shift_reminder", {
    registration_id: id,
    reminder_date: reminder.date,
    delivery_id: "synthetic-delivery",
  });
  assert.ifError(finished.error);
  assert.equal(
    (await admin.rpc("claim_shift_reminders", { dry_run: false })).data.some(
      (r) => r.registrationId === id,
    ),
    false,
  );
});
await test("collection is staging-only, isolated, deduplicated and atomically reviewed", async () => {
  const token = "local-collector-" + crypto.randomUUID();
  const tokenHash = (await import("node:crypto")).createHash("sha256").update(token).digest("hex");
  execFileSync("docker", ["exec", "supabase_db_aboutvelocityswimming", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
    `insert into private.collection_workers(name,token_hash,divisions) values('Synthetic collector','${tokenHash}',array['times','workshare','knowledge']);`], { stdio: "pipe" });
  const base = { division: "knowledge", scope: "Synthetic test", sourceUrl: "https://example.test/meet/" + crypto.randomUUID(), capturedAt: new Date().toISOString(), coverage: "partial", evidence: { text: "Synthetic meet evidence" } };
  const suffix = Date.now();
  const id = "test-knowledge-" + suffix;
  const batch = { ...base, writes: [{ path: "knowledge_entries/" + id, after: { kind: "meet", title: "Synthetic meet", sourceUrl: base.sourceUrl, startsOn: "2026-10-01", endsOn: "2026-10-02" } }] };
  const stage = (value, worker_token = token) => anon.rpc("stage_collection", { worker_token, batch: value });
  assert.ok((await stage(batch, "wrong-token")).error);
  const staged = await stage(batch); assert.ifError(staged.error);
  assert.equal((await anon.from("knowledge_entries").select("id").eq("id", id)).data.length, 0);
  assert.equal((await familyA.from("collection_batches").select("id")).data.length, 0);
  assert.equal((await anon.from("collection_batches").select("id")).data?.length ?? 0, 0);
  const duplicate = await stage(batch); assert.ifError(duplicate.error); assert.equal(duplicate.data, staged.data);
  assert.ok((await familyA.rpc("review_collection", { batch_id: staged.data, decision: "approved", note: "" })).error);
  assert.ifError((await staff.rpc("review_collection", { batch_id: staged.data, decision: "held", note: "Check source" })).error);
  assert.equal((await anon.from("knowledge_entries").select("id").eq("id", id)).data.length, 0);
  assert.ifError((await staff.rpc("review_collection", { batch_id: staged.data, decision: "approved", note: "Verified" })).error);
  assert.equal((await anon.from("knowledge_entries").select("id").eq("id", id)).data.length, 1);
  assert.ok((await staff.rpc("review_collection", { batch_id: staged.data, decision: "approved", note: "Again" })).error);
  assert.ok((await stage({ ...batch, division: "workshare" })).error);
  assert.ok((await stage({ ...batch, writes: [{ path: "knowledge_entries/" + id, after: null }] })).error);

  const declined = await stage({ ...batch, writes: [{ ...batch.writes[0], path: "knowledge_entries/declined-" + suffix }] }); assert.ifError(declined.error);
  assert.ifError((await staff.rpc("review_collection", { batch_id: declined.data, decision: "declined", note: "Wrong match" })).error);
  const repeated = await stage({ ...batch, writes: [{ ...batch.writes[0], path: "knowledge_entries/declined-" + suffix }] });
  assert.equal(repeated.data, declined.data);
  assert.equal((await staff.from("collection_batches").select("status").eq("id", declined.data).single()).data.status, "declined");

  const before = await record(staff, "teams/velocity-swimming");
  const stale = await stage({ ...base, division: "times", writes: [
    { path: "teams/stale-" + suffix, after: { name: "Must not be written" } },
    { path: "teams/velocity-swimming", after: { ...before, name: "Collected name" } }
  ] }); assert.ifError(stale.error);
  await collect("teams/velocity-swimming", { ...before, name: "Edited since collection" });
  const decision = await staff.rpc("review_collection", { batch_id: stale.data, decision: "approved", note: "" });
  assert.equal(decision.error?.code, "40001");
  assert.equal(await record(staff, "teams/stale-" + suffix), null);
  await collect("teams/velocity-swimming", before);

  const family = await record(staff, "families/family-a");
  assert.ok((await stage({ ...base, division: "workshare", writes: [{ path: "families/family-a", after: { ...family, children: [] } }] })).error);
  assert.ok((await stage({ ...base, division: "workshare", writes: [{ path: "families/family-a", after: { ...family, authorizedEmails: [] } }] })).error);
  const members = await stage({ ...base, division: "workshare", writes: [{ path: "families/family-a", after: { ...family, accountName: "Reviewed household" } }] }); assert.ifError(members.error);
  assert.ifError((await staff.rpc("review_collection", { batch_id: members.data, decision: "approved", note: "Verified roster" })).error);
  assert.equal((await record(familyA, "families/family-a")).accountName, "Reviewed household");
  await collect("families/family-a", family);
  execFileSync("docker", ["exec", "supabase_db_aboutvelocityswimming", "psql", "-U", "postgres", "-c", `update private.collection_workers set revoked_at=now() where token_hash='${tokenHash}';`], { stdio: "pipe" });
  assert.ok((await stage(batch)).error);
});
await test("Workshare-only children never become public athletes", async () => {
  const before = await record(staff, "families/family-a");
  const athletesBefore = await query(anon, "public_athletes");
  await collect("families/family-a", { ...before, children: [...before.children, { name: "Private Child", group: "No Assignment" }] });
  assert.equal((await record(familyA, "families/family-a")).children.length, 2);
  assert.equal((await query(anon, "public_athletes")).length, athletesBefore.length);
  const members = await familyB.from("workshare_members").select("id").eq("family_id", "family-a");
  assert.deepEqual(members.data, []);
  await collect("families/family-a", before);
});
await test("public race history never exposes private source fields", async () => {
  const before = await record(staff, "swims/test-race-1");
  await collect("swims/test-race-1", { ...before, dob: "2012-02-15", notes: "private", swimsId: "private-id" });
  const publicRace = await anon.from("public_swims").select("*").eq("id", "test-race-1").single();
  assert.ifError(publicRace.error);
  assert.equal(publicRace.data.data.timeMs, 64000);
  assert.equal(publicRace.data.data.dob, undefined);
  assert.equal(publicRace.data.data.notes, undefined);
  assert.equal(publicRace.data.data.swimsId, undefined);
  await collect("swims/test-race-1", before);
});
