import assert from "node:assert/strict";
import test from "node:test";
import { syntheticStandard } from "../scripts/unified/synthetic-standard.mjs";
import { validateStandard } from "../src/components/collection/validate-standard.ts";
import { assertCollectionTarget } from "../scripts/collection/target.mjs";

test("the local seed standard satisfies the shared standards contract", () => {
  assert.doesNotThrow(() => validateStandard(syntheticStandard, "test-standard"));
  assert.equal(new URL(syntheticStandard.sourceUrl).hostname, "example.test");
});

test("offline, stale, and provenance-free race proposals cannot be staged", () => {
  const evidence = { project: "intended", sourceManifestRequired: true, baselineComplete: false };
  assert.throws(() => assertCollectionTarget({ evidence }, "https://intended.supabase.co"), /complete baseline/);
  evidence.baselineComplete = true;
  evidence.baselineCapturedAt = "2020-01-01T00:00:00Z";
  assert.throws(() => assertCollectionTarget({ evidence }, "https://intended.supabase.co"), /stale/);
  evidence.baselineCapturedAt = new Date().toISOString();
  assert.throws(() => assertCollectionTarget({ evidence }, "https://intended.supabase.co"), /hashes/);
  evidence.inputHashes = Object.fromEntries(["sources", "baseline", "mappings", "code", "parser", "relayHelper"].map((key) => [key, "a".repeat(64)]));
  evidence.baselineCounts = Object.fromEntries(["teams", "meets", "athletes", "swims", "relay_results"].map((key) => [key, 0]));
  evidence.baselineRecordsSha256 = "b".repeat(64);
  evidence.identityGuard = { version: 1, revision: "1" };
  evidence.catalogScope = "pilot";
  assert.doesNotThrow(() => assertCollectionTarget({ evidence }, "https://intended.supabase.co"));
  const missingTarget = { ...evidence };
  delete missingTarget.project;
  assert.throws(() => assertCollectionTarget({ evidence: missingTarget }, "https://unrelated.supabase.co"), /explicit project/);
  delete evidence.baselineCounts;
  assert.throws(() => assertCollectionTarget({ evidence }, "https://intended.supabase.co"), /collection counts/);
});

test("prepared batches refuse a different hosted project or a local/hosted mixup", () => {
  const batch = { evidence: { project: "intended-project" } };
  assert.doesNotThrow(() => assertCollectionTarget(batch, "https://intended-project.supabase.co"));
  assert.throws(() => assertCollectionTarget(batch, "https://other-project.supabase.co"), /differs/);
  assert.throws(() => assertCollectionTarget(batch, "http://intended-project.supabase.co"), /differs/);
  for (const endpoint of ["https://intended-project.supabase.co:444", "http://127.0.0.1:80", "https://localhost:54321"]) {
    assert.throws(() => assertCollectionTarget(batch, endpoint), /differs/);
  }
  for (const endpoint of ["https://intended-project.supabase.co/proxy", "https://intended-project.supabase.co?key=example", "https://user:example@intended-project.supabase.co"]) {
    assert.throws(() => assertCollectionTarget(batch, endpoint), /base URL/);
  }
  assert.throws(() => assertCollectionTarget(batch, "http://127.0.0.1:54321"), /differs/);
  assert.doesNotThrow(() => assertCollectionTarget({ evidence: { project: "local:aboutvelocityswimming" } }, "http://127.0.0.1:54321"));
  assert.throws(() => assertCollectionTarget({ evidence: { project: "local:aboutvelocityswimming" } }, "https://intended-project.supabase.co"), /differs/);
  assert.doesNotThrow(() => assertCollectionTarget({ division: "knowledge" }, "https://existing.supabase.co"));
});
