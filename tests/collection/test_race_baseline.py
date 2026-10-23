"""Complete bundle coverage and failure tests; no network or database access."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/collection"))
import race_baseline as bundle


class BaselineBundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / "baseline.json"
        self.baseline = {"version": 1, "project": "synthetic", "capturedAt": "2026-10-15T00:00:00Z",
            "canonicalRevision": "7", "consistency": {"verified": True, "revision": "7", "exportVersion": 1},
            "completeCollections": list(bundle.CANONICAL), "collectionCounts": {c: 0 for c in bundle.CANONICAL},
            **{c: [] for c in bundle.CANONICAL}, "catalog": [{"id": "meet", "data": {"kind": "meet"}}],
            "catalogCount": 1, "catalogComplete": True, "identityClaims": {c: [] for c in bundle.CLAIMS}}
        self.baseline["swims"] = [{"id": str(i), "data": {"id": str(i), "extra": "fixture"}} for i in range(1001)]
        self.baseline["collectionCounts"]["swims"] = 1001

    def manifest(self):
        return json.loads(self.path.read_bytes())

    def replace_manifest(self, value):
        self.path.write_bytes(bundle.encoded(value))

    def test_roundtrip_complete_rows_and_immutable_reuse_across_verified_revisions(self):
        bundle.write(self.baseline, self.path)
        loaded, raw = bundle.load(self.path)
        self.assertEqual(loaded["swims"], self.baseline["swims"])
        self.assertEqual(loaded["identityClaims"], self.baseline["identityClaims"])
        self.assertEqual(len(self.manifest()["chunks"]["swims"]), 3)
        before = {p.name: (p.stat().st_ino, p.stat().st_mtime_ns, p.read_bytes()) for p in (self.root / "chunks").iterdir()}
        changed = copy.deepcopy(self.baseline)
        changed["canonicalRevision"] = changed["consistency"]["revision"] = "8"
        bundle.write(changed, self.root / "baseline-8.json")
        self.assertEqual(before, {p.name: (p.stat().st_ino, p.stat().st_mtime_ns, p.read_bytes()) for p in (self.root / "chunks").iterdir()})
        self.assertEqual(bundle.load(self.root / "baseline-8.json")[0]["swims"], loaded["swims"])
        self.assertLess(len(raw), 5000)

    def test_missing_corrupted_and_truncated_chunks_fail_closed(self):
        bundle.write(self.baseline, self.path)
        p = self.root / self.manifest()["chunks"]["swims"][0]["file"]
        original = p.read_bytes()
        p.write_bytes(original[:-1])
        with self.assertRaisesRegex(ValueError, "size changed"):
            bundle.load(self.path)
        p.write_bytes(original.replace(b"fixture", b"changed", 1))
        with self.assertRaisesRegex(ValueError, "digest changed"):
            bundle.load(self.path)
        p.unlink()
        with self.assertRaises(FileNotFoundError):
            bundle.load(self.path)

    def test_coverage_revision_shadow_paths_and_memory_budget_fail_closed(self):
        bundle.write(self.baseline, self.path)
        original = self.manifest()
        mutations = [lambda m: m["chunks"].pop("identity-results"),
            lambda m: m["collectionCounts"].update(swims=1002),
            lambda m: m["consistency"].update(revision="6"),
            lambda m: m.update(swims=[]),
            lambda m: m["chunks"]["swims"][0].update(file="../outside.json")]
        for mutate in mutations:
            value = copy.deepcopy(original)
            mutate(value)
            self.replace_manifest(value)
            with self.assertRaises(ValueError):
                bundle.load(self.path)
        self.replace_manifest(original)
        with patch.object(bundle, "MAX_TOTAL_BYTES", sum(p.stat().st_size for p in (self.root / "chunks").iterdir()) - 1):
            with self.assertRaisesRegex(ValueError, "input budget"):
                bundle.load(self.path)

    def test_duplicate_rows_and_mixed_revision_chunks_are_rejected_even_with_new_digest(self):
        bundle.write(self.baseline, self.path)
        original = self.manifest()
        for bad_revision in (False, True):
            m = copy.deepcopy(original)
            item = m["chunks"]["swims"][0]
            value = json.loads((self.root / item["file"]).read_bytes())
            if bad_revision:
                value["revision"] = "6"
            else:
                value["rows"][1] = value["rows"][0]
            data = bundle.encoded(value)
            new_file = "chunks/mutated-" + str(bad_revision) + ".json"
            (self.root / new_file).write_bytes(data)
            item.update(file=new_file, sha256=bundle.digest(data), bytes=len(data))
            self.replace_manifest(m)
            with self.assertRaises(ValueError):
                bundle.load(self.path)

    def test_writer_splits_byte_budget_and_never_publishes_incomplete_snapshot(self):
        with patch.object(bundle, "MAX_CHUNK_BYTES", 800):
            bundle.write(self.baseline, self.path)
            self.assertEqual(len(bundle.load(self.path)[0]["swims"]), 1001)
            self.assertTrue(all(p.stat().st_size <= 800 for p in (self.root / "chunks").iterdir()))
        incomplete = copy.deepcopy(self.baseline)
        incomplete["swims"].pop()
        target = self.root / "incomplete.json"
        with self.assertRaises(ValueError):
            bundle.write(incomplete, target)
        self.assertFalse(target.exists())

    def test_refresh_reuses_only_authoritatively_unchanged_complete_sets(self):
        fingerprints = {root: {"count": len(self.baseline[root]), "snapshotHash": "a" * 32 if self.baseline[root] else None} for root in (*bundle.CANONICAL, "catalog")}
        self.baseline["exportProvenance"] = {"serverSnapshotHashes": fingerprints}
        proof = {"project": "synthetic", "revision": "8", "capturedAt": "2026-10-15T01:00:00Z",
            "fingerprints": {root: {**value, "unchangedHash": value["snapshotHash"], "unchangedCount": value["count"]} for root, value in fingerprints.items()},
            "additions": [{"path": "swims/new", "data": {"id": "new"}}],
            "identityClaims": {name: [] for name in bundle.CLAIMS}, "identityCounts": {name: 0 for name in bundle.CLAIMS},
            "snapshotFunctionHash": "b" * 32, "athleteSnapshotFunctionHash": "c" * 32}
        proof["fingerprints"]["swims"].update(count=1002, snapshotHash="d" * 32)
        closing = {"project": "synthetic", "revision": "8", "capturedAt": "2026-10-15T01:01:00Z",
            "counts": {root: value["count"] for root, value in proof["fingerprints"].items()}, "identityCounts": proof["identityCounts"]}
        fresh = bundle.refresh_additions(self.baseline, proof, closing, ["swims/new"])
        self.assertEqual(fresh["swims"][:-1], self.baseline["swims"])
        self.assertEqual(fresh["swims"][-1], {"id": "new", "data": {"id": "new"}})
        self.assertEqual(fresh["canonicalRevision"], "8")
        self.assertEqual(len(fresh["catalog"]), 1)
        for invalid_hash in [None, "not-a-hash", ""]:
            prior = copy.deepcopy(self.baseline)
            changed = copy.deepcopy(proof)
            prior["exportProvenance"]["serverSnapshotHashes"]["catalog"]["snapshotHash"] = invalid_hash
            changed["fingerprints"]["catalog"]["unchangedHash"] = invalid_hash
            with self.assertRaisesRegex(ValueError, "unchanged-set hash"):
                bundle.refresh_additions(prior, changed, closing, ["swims/new"])
        prior = copy.deepcopy(self.baseline)
        changed = copy.deepcopy(proof)
        prior["exportProvenance"]["serverSnapshotHashes"]["catalog"].pop("snapshotHash")
        changed["fingerprints"]["catalog"].pop("unchangedHash")
        with self.assertRaisesRegex(ValueError, "unchanged-set hash"):
            bundle.refresh_additions(prior, changed, closing, ["swims/new"])
        for mutate in [lambda p, c: c.update(revision="9"),
                lambda p, c: p["fingerprints"]["swims"].update(unchangedHash="e" * 32),
                lambda p, c: p["fingerprints"]["swims"].update(unchangedCount=1000),
                lambda p, c: p["fingerprints"].pop("catalog"),
                lambda p, c: p.update(additions=[]),
                lambda p, c: p["identityCounts"].update(results=1)]:
            changed, close = copy.deepcopy(proof), copy.deepcopy(closing)
            mutate(changed, close)
            with self.assertRaises(ValueError):
                bundle.refresh_additions(self.baseline, changed, close, ["swims/new"])

    def test_writer_rejects_truncated_missing_and_contradictory_identity_claims(self):
        for change in [lambda b: b.update(identityCounts={"athletes": 1, "occurrences": 0, "results": 0}),
                lambda b: b["identityClaims"].pop("results"),
                lambda b: b.update(identityCounts=None),
                lambda b: b.update(identityCounts={"athletes": False, "occurrences": 0, "results": 0})]:
            baseline = copy.deepcopy(self.baseline)
            change(baseline)
            with self.assertRaises(ValueError):
                bundle.write(baseline, self.path)
            self.assertFalse(self.path.exists())


if __name__ == "__main__":
    unittest.main()
