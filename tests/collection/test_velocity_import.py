import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from test_race_import import fixture
import race_import as races
import velocity_import as imports


class VelocityImportTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.project = "local:aboutvelocityswimming"
        self.url = "https://example.test/results"
        self.captured_at = "2026-10-01T00:00:00Z"

    def write(self, name, value):
        path = self.root / name
        path.write_text(json.dumps(value))
        return path

    def capture(self, filename, source, **fields):
        raw = self.write(filename, source)
        return {"format": "structured", "file": raw.name, "sourceUrl": self.url,
                "capturedAt": self.captured_at, "coverage": "partial", "sourceScope": "Synthetic capture",
                "sha256": races.sha(raw.read_bytes()), **fields}

    def test_structured_and_catalog_rows_route_to_scoped_collectors(self):
        structured = self.capture("structured.json", {"rows": [
            {"kind": "meet", "id": "synthetic-meet", "data": {"name": "Synthetic Meet"}},
            {"kind": "catalog_meet", "id": "synthetic-catalog", "data": {"kind": "meet", "title": "Synthetic Meet"}},
        ]})
        catalog = self.capture("catalog.json", [
            {"id": {"value": 42}, "title": {"value": "Synthetic Swim Meet"},
             "startDate": {"displayValueISO": "2026-09-30"}, "endDate": {"displayValueISO": "2026-09-30"}},
            {"id": {"value": 43}, "title": {"value": "Coaches Meeting"},
             "startDate": {"displayValueISO": "2026-09-30"}, "endDate": {"displayValueISO": "2026-09-30"}},
        ], format="ies-catalog", cutoff="2026-10-01")
        manifest = self.write("manifest.json", {"version": 1, "project": self.project, "captures": [structured, catalog]})
        result = imports.prepare(manifest)
        self.assertEqual(result["project"], self.project)
        self.assertEqual([(batch["division"], [row["id"] for row in batch["rows"]]) for batch in result["batches"]],
                         [("times", ["synthetic-meet"]), ("knowledge", ["synthetic-catalog"]),
                          ("knowledge", ["usa-meet-ie-42"])])
        self.assertEqual(result["batches"][0]["sha256"], structured["sha256"])
        self.assertEqual(result["batches"][0]["coverage"], "partial")
        self.assertEqual(result["batches"][2]["rows"][0]["data"]["participationCoverage"], "unknown")
        (self.root / "structured.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            imports.prepare(manifest)

    def paired_manifest(self, **binding):
        raw, companion = fixture()
        archive = self.root / "results.zip"
        with zipfile.ZipFile(archive, "w") as writer:
            writer.writestr("results.hy3", raw)
            writer.writestr("results.cl2", companion)
        manifest = self.write("sources.json", {"version": 1, "project": self.project, "selectedMeetIds": ["meet"],
            "sources": [{"id": "capture", "meetId": "meet", "file": archive.name, "url": self.url,
                "sha256": races.sha(archive.read_bytes()), "hy3": "results.hy3", "cl2": "results.cl2",
                "capturedAt": self.captured_at, "official": True, "officialBasis": "Synthetic official archive",
                "sourceScope": {"kind": "club-filtered", "basis": "Export from one club"},
                "meet": {"name": "Synthetic Meet", "startsOn": "2025-10-25", "endsOn": "2025-10-25"},
                "meetIdentity": {"reviewed": True, "basis": "Exact synthetic B1 identity",
                    "fileMeet": {"name": "Synthetic Meet", "startsOn": "2025-10-25", "endsOn": "2025-10-25"},
                    **binding}}]})
        return manifest

    def mappings(self, identities=None):
        return self.write("mappings.json", {"teams": [{"teamId": "source-club", "clubCode": "VS", "lscCode": "IE",
            "name": "Source Club", "validFrom": "2025-10-25", "validThrough": "2025-10-25",
            "reviewed": True, "basis": "Synthetic dated code", "sourceUrl": self.url}], "identities": identities or []})

    def test_paired_archive_has_selectable_meet_and_linked_records_without_baseline(self):
        manifest, mappings = self.paired_manifest(), self.mappings()
        result = imports.prepare(manifest, mappings)
        self.assertEqual(result, imports.prepare(manifest, mappings))
        batch, = result["batches"]
        meet, swim = batch["rows"]
        self.assertEqual((meet["kind"], swim["kind"], swim["data"]["meet"]["id"]), ("meet", "swim", meet["id"]))
        self.assertEqual({parent["kind"] for parent in swim["prerequisites"]}, {"athlete", "team"})
        self.assertEqual(swim["data"]["ageAtSwim"], 15)
        self.assertEqual(batch["coverage"], "partial")
        self.assertNotIn("MEMBER000001", json.dumps(result))
        self.assertNotIn("01012010", json.dumps(result))
        self.assertEqual(result["holds"], [])

    def test_explicit_existing_references_are_not_proposed_for_creation(self):
        manifest = self.paired_manifest(canonicalMeet={"id": "existing-meet", "reviewed": True,
            "basis": "Exact catalog crosswalk", "sourceUrl": self.url})
        mappings = self.mappings([{"sourceMemberIdHash": races.digest("MEMBER000001"), "athleteId": "existing-athlete",
            "reviewed": True, "basis": "Exact member reference", "sourceUrl": self.url}])
        result = imports.prepare(manifest, mappings)
        swim, = result["batches"][0]["rows"]
        self.assertEqual(swim["data"]["athleteId"], "existing-athlete")
        self.assertEqual(swim["data"]["meet"]["id"], "existing-meet")
        self.assertEqual([parent["kind"] for parent in swim["prerequisites"]], ["team"])
        crosswalk = swim["data"]["sourceObservation"]["canonicalMeetCrosswalk"]
        self.assertEqual((crosswalk["startsOn"], crosswalk["endsOn"]), ("2025-10-25", "2025-10-25"))


if __name__ == "__main__":
    unittest.main()
