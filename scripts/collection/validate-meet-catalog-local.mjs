/** Exercise retained catalog proposals through the local queue; clean every fixture. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Supply the prepared summary.json path.");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const config = JSON.parse(
  execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
assert.equal(
  config.API_URL,
  "http://127.0.0.1:54321",
  "Archive validation refuses hosted databases.",
);
const client = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const prefix = `archive-validation-${Date.now()}-`;
const writes = (
  await Promise.all(
    manifest.batches.map(
      async (path) => JSON.parse(await readFile(path, "utf8")).writes,
    ),
  )
).flat();
assert.equal(new Set(writes.map((write) => write.path)).size, writes.length);
const fixtures = writes.map((write) => ({
  id: prefix + write.path.split("/")[1],
  data: { ...write.after, title: prefix + write.after.title },
  starts_on: write.after.startsOn,
  ends_on: write.after.endsOn,
}));
const confirmed = (row) =>
  (row.data.participants ?? []).some(
    (team) =>
      team.basis === "recorded" &&
      team.lscCode === "IE" &&
      ["club", "unattached"].includes(team.representation),
  );
const expectedConfirmed = fixtures.filter(confirmed).length;
const expectedObservations = fixtures.reduce(
  (total, row) => total + (row.data.participants ?? []).length,
  0,
);
async function queue(input = {}) {
  const { data, error } = await client.rpc("meet_collection_queue", {
    input: { search: prefix, ...input },
  });
  assert.ifError(error);
  return data;
}
try {
  for (let start = 0; start < fixtures.length; start += 100) {
    const { error } = await client
      .from("knowledge_entries")
      .insert(fixtures.slice(start, start + 100));
    assert.ifError(error);
  }
  const first = await queue();
  assert.equal(first.total, fixtures.length);
  assert.equal(first.rows.length, Math.min(30, fixtures.length));
  assert.equal((await queue({ ies: "confirmed" })).total, expectedConfirmed);
  assert.equal(
    (await queue({ ies: "none" })).total,
    0,
    "Partial archives cannot establish no IES representation.",
  );
  let observed = 0;
  for (let offset = 0; offset < fixtures.length; offset += 30) {
    const result = offset ? await queue({ offset }) : first;
    for (const row of result.rows) {
      observed += row.participants.length;
      assert.notEqual(row.teamCoverage, "complete");
      assert.notEqual(row.importState, "complete");
    }
  }
  assert.equal(
    observed,
    expectedObservations,
    "The queue must preserve every proposed team observation.",
  );
  const oldest = fixtures.reduce((a, b) => (a.starts_on < b.starts_on ? a : b));
  const oldYear = Number(oldest.starts_on.slice(0, 4));
  assert.equal(
    (await queue({ year: oldYear })).total,
    fixtures.filter((row) => row.starts_on.startsWith(String(oldYear))).length,
  );
  console.log(
    `Validated ${fixtures.length} retained meet proposals and ${observed} team observations through the local queue (${expectedConfirmed} confirmed IES meets). No full import was marked complete.`,
  );
} finally {
  const { error } = await client
    .from("knowledge_entries")
    .delete()
    .like("id", prefix + "%");
  assert.ifError(error);
}
