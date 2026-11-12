import test from "node:test";
import assert from "node:assert/strict";
import { splitImportBatches, stageImportBatches } from "../scripts/collection/upload-import.mjs";

test("chunked upload preserves source provenance and counts receipts", async () => {
  const capture = {
    division: "times",
    sourceUrl: "https://example.test/fixture.zip",
    capturedAt: "2026-10-01T00:00:00Z",
    coverage: "partial",
    sourceScope: "Synthetic meet archive",
    sha256: "e".repeat(64),
  };
  const rows = Array.from({ length: 101 }, (_, index) => ({
    kind: "swim",
    id: `swim-${index}`,
    data: { timeMs: 60_000 },
  }));
  const batches = splitImportBatches([{ ...capture, rows }]);
  assert.deepEqual(batches.map((batch) => batch.rows.length), [100, 1]);
  assert.deepEqual(batches.flatMap((batch) => batch.rows), rows);
  assert.deepEqual(batches, [{ ...capture, rows: rows.slice(0, 100) }, { ...capture, rows: rows.slice(100) }]);

  const requests = [];
  const client = {
    rpc(name, payload) {
      requests.push({ name, payload });
      const count = payload.batch.rows.length;
      return {
        async abortSignal() {
          return {
            data: {
              batchId: "batch-1",
              staged: count === 100 ? 99 : 0,
              duplicates: count === 100 ? 0 : 1,
              blocked: count === 100 ? 1 : 0,
              exceptions: count === 100 ? [{ id: "swim-99", reason: "Existing result differs" }] : [],
            },
          };
        },
      };
    },
  };
  assert.deepEqual(await stageImportBatches({ client, workerToken: "collector", batches }), {
    staged: 99,
    duplicates: 1,
    blocked: 1,
    captureBatches: 1,
    batchIds: ["batch-1"],
    exceptionExamples: [{ reason: "Existing result differs", count: 1 }],
  });
  assert.deepEqual(requests, batches.map((batch) => ({
    name: "stage_velocity_import",
    payload: { batch, worker_token: "collector" },
  })));
});

test("size checks account for UTF-8 payload bytes", () => {
  const rows = [{ data: "é".repeat(500_000) }, { data: "é".repeat(300_000) }];
  assert.deepEqual(splitImportBatches([{ rows }]).map((batch) => batch.rows.length), [1, 1]);
  assert.throws(() => splitImportBatches([{ rows: [{ data: "é".repeat(800_000) }] }]), /size limit/);
});
