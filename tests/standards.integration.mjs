import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const config = JSON.parse(
  execFileSync("supabase", ["status", "--output", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
assert.equal(
  config.API_URL,
  "http://127.0.0.1:54321",
  "Refuse hosted test fixtures",
);
const make = () =>
  createClient(config.API_URL, config.PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
const anon = make(),
  staff = make(),
  family = make();
const sql = (query) =>
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
      query,
    ],
    { stdio: "pipe" },
  );
const token = randomUUID(),
  hash = createHash("sha256").update(token).digest("hex");
const id = "standards_fixture_" + Date.now();
const body = {
  id,
  name: "Standards workflow fixture",
  category: "championship",
  governingBody: "LSC",
  seasonYears: "2026",
  effectiveDate: "2026-01-01",
  expirationDate: "2026-12-31",
  sourceUrl: "https://example.test/standards",
  cuts: {
    SCY: {
      F: {
        "10&U": {
          "50_FR_SCY": {
            cutsByTier: [
              { tierName: "Qualifying", timeMs: 39000, timeDisplay: "39.00" },
            ],
          },
        },
      },
    },
  },
};
const batch = {
  division: "times",
  scope: "Standards integration fixture",
  sourceUrl: body.sourceUrl,
  capturedAt: new Date().toISOString(),
  coverage: "complete",
  evidence: { method: "Synthetic fixture" },
  reads: [{ path: `standards/${id}`, before: null }],
  writes: [{ path: `standards/${id}`, after: body }],
};
const stage = (b) =>
  anon.rpc("stage_collection", { worker_token: token, batch: b });
const read = () => anon.from("standards").select("data").eq("id", id);
test("standards are validated, private until staff approval, and protected against stale publication", async () => {
  sql(
    `insert into private.collection_workers(name,token_hash,divisions) values('Standards test','${hash}',array['times']);`,
  );
  try {
    for (const [client, email] of [
      [staff, "coach@velocity-swimming.com"],
      [family, "family-a@example.test"],
    ])
      assert.ifError(
        (
          await client.auth.signInWithPassword({
            email,
            password: "Velocity-local-test-2026!",
          })
        ).error,
      );
    assert.ok(
      (await anon.rpc("stage_collection", { worker_token: "invalid", batch }))
        .error,
    );
    assert.ok((await stage({ ...batch, coverage: "partial" })).error);
    assert.ok((await stage({ ...batch, reads: [] })).error);
    const malformed = structuredClone(batch);
    malformed.writes[0].after.cuts.SCY.F["10&U"][
      "50_FR_SCY"
    ].cutsByTier[0].timeMs = 0;
    assert.ok((await stage(malformed)).error);
    const result = await stage(batch);
    assert.ifError(result.error);
    const bid = result.data;
    assert.equal(
      (await stage(batch)).data,
      bid,
      "Duplicate staging is idempotent",
    );
    assert.deepEqual((await read()).data, []);
    assert.ok(
      (
        await anon.rpc("review_collection", {
          batch_id: bid,
          decision: "approved",
        })
      ).error,
    );
    assert.ok(
      (
        await family.rpc("review_collection", {
          batch_id: bid,
          decision: "approved",
        })
      ).error,
    );
    assert.ifError(
      (
        await staff.rpc("review_collection", {
          batch_id: bid,
          decision: "held",
        })
      ).error,
    );
    assert.deepEqual((await read()).data, []);
    assert.ifError(
      (
        await staff.rpc("review_collection", {
          batch_id: bid,
          decision: "approved",
        })
      ).error,
    );
    assert.equal((await read()).data[0].data.name, body.name);
    assert.equal(
      (await anon.from("standard_cuts").select("time_ms").eq("standard_id", id))
        .data[0].time_ms,
      39000,
    );
    const update = structuredClone(batch);
    update.reads[0].before = body;
    update.writes[0].after.name = "Updated";
    const staged = await stage(update);
    assert.ifError(staged.error);
    sql(
      `update public.standards set data=jsonb_set(data,'{name}','"Intervening edit"') where id='${id}';`,
    );
    assert.ok(
      (
        await staff.rpc("review_collection", {
          batch_id: staged.data,
          decision: "approved",
        })
      ).error,
    );
    assert.equal((await read()).data[0].data.name, "Intervening edit");
    assert.ok((await stage(update)).error, "Reject stale preparation");
    assert.ifError(
      (
        await staff.rpc("review_collection", {
          batch_id: staged.data,
          decision: "declined",
        })
      ).error,
    );
    assert.throws(
      () =>
        sql(
          `update public.standards set data=jsonb_set(data,'{expirationDate}','"2026-02-30"') where id='${id}';`,
        ),
      "Publication boundary validates",
    );
  } finally {
    sql(
      `delete from public.collection_reviews where batch_id in (select id from public.collection_batches where worker_id in (select id from private.collection_workers where token_hash='${hash}')); delete from public.collection_batches where worker_id in (select id from private.collection_workers where token_hash='${hash}'); delete from private.collection_workers where token_hash='${hash}'; delete from public.standards where id='${id}';`,
    );
  }
});
