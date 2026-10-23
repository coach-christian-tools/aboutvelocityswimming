"""Synthetic end-to-end file preparation tests. Never contacts a database."""
import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/collection"))
import race_import as prep
import race_baseline as bundle

spec = importlib.util.spec_from_file_location("relay_fixtures", ROOT / "tests/swim-resources/test_hytek_relays.py")
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)


def fixture(rows=None, member="MEMBER000001", club="VS", lsc="IE", birth="01012010", first="First", last="Last", distance=100):
    rows = rows or [("F", "Y", " ", "  60.00", " 1", "10252025")]
    h = [fixtures.hy3("A107", {}), fixtures.hy3("B1", {2: "Synthetic Meet", 92: "10252025", 100: "10252025"}),
         fixtures.hy3("C1", {2: club, 7: "Source Club", 53: lsc}),
         fixtures.hy3("D1", {2: "F", 3: "    1", 8: last, 28: first, 69: member, 88: birth, 97: "15"})]
    c = [fixtures.fixed(160, "A0", {})]
    for rnd, course, flag, value, event, day in rows:
        h += [fixtures.hy3("E1", {3: "    1", 15: str(distance).rjust(6), 21: "A", 38: event}),
              fixtures.hy3("E2", {2: rnd, 4: value, 11: course, 12: flag, 87: day})]
        cl_value = value.strip() if flag in (" ", "S") else {"Q": "DQ", "F": "DFS", "R": "NS", "D": "DNF"}.get(flag, "NS")
        c.append(fixtures.fixed(160, "D0", {39: member[:12], 65: "F", 67: str(distance).rjust(4), 71: "1", 72: event, 80: day,
            {"P": 97, "S": 106, "F": 115}.get(rnd, 115): cl_value.rjust(8) + course}))
    return b"\r\n".join(h) + b"\r\n", "\r\n".join(c).encode("cp1252")


class RacePreparationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.private = patch.object(prep, "PRIVATE_ROOT", self.root)
        self.private.start()
        self.addCleanup(self.private.stop)
        network = patch("socket.socket", side_effect=AssertionError("File preparation must never open a socket"))
        network.start()
        self.addCleanup(network.stop)
        self.baseline = {"canonicalRevision": "1", "consistency": {"verified": True, "revision": "1", "exportVersion": 1}, "project": "synthetic-test", "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                         "completeCollections": list(prep.COLLECTIONS), "collectionCounts": {k: 0 for k in prep.COLLECTIONS},
                         **{k: [] for k in prep.COLLECTIONS}}
        self.manifest = {"version": 1, "project": "synthetic-test", "selectedMeetIds": ["meet"], "sources": []}
        self.mappings = {"teams": [{"teamId": "source-club", "clubCode": "VS", "lscCode": "IE", "name": "Source Club",
            "sourceNames": ["Source Club"], "validFrom": "2025-10-25", "validThrough": "2025-10-25", "reviewed": True,
            "basis": "Synthetic official C1 plus reviewed historical club identity", "sourceUrl": "https://example.test/results"}], "identities": []}
        self.source()

    def source(self, raw=None, sid="source", meet="meet", **options):
        raw, cl = raw or fixture(**options)
        path = self.root / (sid + ".zip")
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("results.hy3", raw)
            archive.writestr("results.cl2", cl)
        source = {"id": sid, "meetId": meet, "file": path.name, "url": "https://example.test/" + sid + ".zip",
            "sha256": prep.sha(path.read_bytes()), "hy3": "results.hy3", "cl2": "results.cl2",
            "capturedAt": "2026-10-01T00:00:00Z", "official": True, "officialBasis": "Synthetic official results export",
            "sourceScope": {"kind": "meet-wide", "basis": "Synthetic complete exported fixture; real-world completeness is separate"},
            "meet": {"name": "Synthetic Meet", "startsOn": "2025-10-25", "endsOn": "2025-10-25"},
            "meetIdentity": {"reviewed": True, "basis": "Synthetic catalog and exact B1 crosswalk", "fileMeet":
                {"name": "Synthetic Meet", "startsOn": "2025-10-25", "endsOn": "2025-10-25"}}}
        self.manifest["sources"] = [s for s in self.manifest["sources"] if s["id"] != sid] + [source]
        return source

    def run_prep(self, output="run", resume=False):
        if "collectionCounts" in self.baseline:
            self.baseline["collectionCounts"] = {key: len(self.baseline[key]) for key in prep.COLLECTIONS}
        for name, value in (("sources", self.manifest), ("baseline", self.baseline), ("mappings", self.mappings)):
            prep.save(self.root / (name + ".json"), value)
        return prep.prepare(self.root / "sources.json", self.root / "baseline.json", self.root / "mappings.json", self.root / output, resume)

    def writes(self, output="run"):
        manifest = prep.read(self.root / output / "manifest.json")
        return [w for batch in manifest["batches"] for w in prep.read(self.root / output / batch["file"])["writes"]]

    def date_crosswalk(self, source=None, individual_rows=1, relay_rows=0):
        source = source or self.manifest["sources"][0]
        catalog = {"kind": "meet", "sourceEventId": "1", "sourceUrl": "https://example.test/events/1",
            "startsOn": "2025-10-24", "endsOn": "2025-10-24", "title": "Synthetic catalog observation"}
        self.baseline.update(catalogComplete=True, catalogCount=1, catalog=[{"id": "meet", "data": catalog}])
        listing = [{"id": {"value": 1}, "startDate": {"displayValueISO": "2025-10-24", "value": "2025-10-24T23:00:00-07:00"},
            "endDate": {"displayValueISO": "2025-10-24", "value": "2025-10-24T23:00:00-07:00"}}]
        references, bindings = [], []
        def evidence(kind, body, source_url, **extra):
            filename = source["id"] + "-" + kind
            body_path = self.root / (filename + ".bin")
            body_path.write_bytes(body)
            receipt_path = self.root / (filename + ".receipt.json")
            prep.save(receipt_path, {"sourceUrl": source_url, "sha256": prep.sha(body), "httpStatus": 200, "capturedAt": "2026-10-01T00:00:00Z"})
            receipt_hash = prep.sha(receipt_path.read_bytes())
            references.append({"kind": kind, "sha256": prep.sha(body), "sourceUrl": source_url, "receiptSha256": receipt_hash, **extra})
            bindings.append({"sha256": prep.sha(body), "file": body_path.name, "receiptSha256": receipt_hash, "receiptFile": receipt_path.name})
        evidence("official_catalog_listing", prep.encode(listing), "https://example.test/events/raw")
        evidence("official_sanctioned_announcement", b"%PDF-1.7\nSynthetic reviewed date authority 10/25/2025\n", "https://example.test/announcement.pdf",
            numericDate="2025-10-25", page=1, sanction="SYNTHETIC-1")
        with zipfile.ZipFile(self.root / source["file"]) as archive:
            hy3_hash, cl2_hash = (prep.sha(archive.read(source[key])) for key in ("hy3", "cl2"))
        evidence("official_paired_result_archive", (self.root / source["file"]).read_bytes(), source["url"],
            hy3Sha256=hy3_hash, cl2Sha256=cl2_hash,
            individualRaceDates=({"2025-10-25": individual_rows} if individual_rows else {}),
            relayRaceDates=({"2025-10-25": relay_rows} if relay_rows else {}))
        crosswalk = {"version": 1, "reviewed": True, "basis": "Synthetic independent date authority; original conflicting observation retained without inferred cause",
            "sourceArchiveSha256": source["sha256"], "actualMeet": {"startsOn": "2025-10-25", "endsOn": "2025-10-25"},
            "catalogObservation": {"meetId": "meet", "canonicalRevisionReviewed": "1", "dataSha256": prep.sha(prep.encode(catalog)),
                "startsOn": "2025-10-24", "endsOn": "2025-10-24", "rawStartValue": "2025-10-24T23:00:00-07:00", "rawEndValue": "2025-10-24T23:00:00-07:00",
                "sourceUrl": catalog["sourceUrl"], "hashEncoding": "race_import.encode(catalog data): sorted compact UTF-8 JSON, no trailing newline",
                "rawListingSha256": references[0]["sha256"]}, "evidence": references, "preserveCatalogObservation": True,
            "reschedulingCauseOrSequenceEstablished": False}
        source["meetIdentity"]["dateCrosswalk"] = crosswalk
        source["dateEvidenceFiles"] = bindings
        return crosswalk

    def assert_date_source_held(self, output, reason=None):
        result = self.run_prep(output)
        self.assertEqual((result["summary"]["sourcesBlocked"], result["summary"]["individualsPrepared"], result["summary"]["relaysPrepared"], result["summary"]["prerequisites"]), (1, 0, 0, 0))
        review = prep.read(self.root / output / "manual-review.json")
        self.assertEqual(review[0]["kind"], "source")
        if reason:
            self.assertIn(reason, review[0]["reason"])
        return result

    def test_exact_date_crosswalk_preserves_catalog_conflict_per_result_run_and_receipts(self):
        crosswalk = self.date_crosswalk()
        original = copy.deepcopy(self.baseline["catalog"])
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 1)
        self.assertEqual(self.baseline["catalog"], original)
        swim = next(w["after"] for w in self.writes() if w["path"].startswith("swims/"))
        self.assertEqual(swim["meet"]["date"], "2025-10-25")
        self.assertEqual(swim["sourceObservation"]["knowledgeMeetId"], "meet")
        self.assertFalse(swim["sourceObservation"]["catalogDateMatch"])
        self.assertEqual(swim["sourceObservation"]["dateCrosswalk"], crosswalk)
        self.assertNotIn("dateEvidenceFiles", json.dumps(swim))
        self.assertNotIn(str(self.root), json.dumps(swim))
        self.assertEqual(result["dateCrosswalks"], [{"sourceId": "source", "meetId": "meet", "dateCrosswalk": crosswalk}])
        self.assertEqual(prep.read(self.root / "run/source-manifest.json")["sources"][0]["meetIdentity"]["dateCrosswalk"], crosswalk)

    def test_date_conflict_requires_crosswalk_and_null_or_unreviewed_decisions_are_rejected(self):
        self.date_crosswalk()
        source = self.manifest["sources"][0]
        saved = source["meetIdentity"].pop("dateCrosswalk")
        source.pop("dateEvidenceFiles")
        self.assert_date_source_held("missing-date-crosswalk", "reviewed dateCrosswalk required")
        for index, value in enumerate((None, {**saved, "reviewed": False}, {**saved, "reviewed": 1}, {**saved, "version": True})):
            source["meetIdentity"]["dateCrosswalk"] = value
            with self.subTest(case=index), self.assertRaises(ValueError):
                self.run_prep("invalid-date-crosswalk-" + str(index))

    def test_date_crosswalk_accepts_newer_unchanged_catalog_without_rewriting_review_revision(self):
        crosswalk = self.date_crosswalk()
        self.baseline["canonicalRevision"] = self.baseline["consistency"]["revision"] = "2"
        result = self.run_prep("newer-baseline")
        self.assertEqual(result["summary"]["individualsPrepared"], 1)
        self.assertEqual(result["dateCrosswalks"][0]["dateCrosswalk"]["catalogObservation"]["canonicalRevisionReviewed"], "1")
        crosswalk["catalogObservation"]["canonicalRevisionReviewed"] = "3"
        self.assert_date_source_held("future-review", "at or after the retained review revision")

    def test_date_crosswalk_rejects_changed_catalog_hash_dates_id_or_unknown_snapshot(self):
        self.date_crosswalk()
        original = copy.deepcopy(self.baseline)
        for index, change in enumerate((lambda b: b["catalog"][0]["data"].update(title="Changed observation"),
                lambda b: b["catalog"][0]["data"].update(startsOn="2025-10-23"),
                lambda b: b["catalog"][0].update(id="other"), lambda b: b.update(catalogComplete=False))):
            self.baseline = copy.deepcopy(original)
            change(self.baseline)
            self.assert_date_source_held("changed-catalog-" + str(index))

    def test_date_crosswalk_rejects_widened_actual_selected_span_or_wrong_header(self):
        crosswalk = self.date_crosswalk()
        source = self.manifest["sources"][0]
        crosswalk["actualMeet"]["startsOn"] = "2025-10-24"
        with self.assertRaisesRegex(ValueError, "one exact actual meet day"):
            self.run_prep("widened-crosswalk")
        crosswalk["actualMeet"]["startsOn"] = "2025-10-25"
        source["meet"]["startsOn"] = "2025-10-24"
        self.assert_date_source_held("widened-selected-span", "exact source/B1 actual endpoints")
        source["meet"]["startsOn"] = "2025-10-25"
        source["meetIdentity"]["fileMeet"]["startsOn"] = "2025-10-24"
        self.assert_date_source_held("wrong-file-header", "exact HY3 name/date binding")

    def test_date_crosswalk_checks_original_rows_even_when_status_or_identity_would_hold_them(self):
        self.source(raw=fixture(rows=[("F", "Y", " ", "  60.00", " 1", "10252025"), ("F", "Y", "D", "   0.00", " 2", "10242025")]))
        self.date_crosswalk(individual_rows=2)
        self.mappings["identityHolds"] = [self.identity_hold()]
        self.assert_date_source_held("out-of-date-held-row", "Original HY3/CL2 race dates")

    def test_date_crosswalk_cannot_override_existing_default_or_explicit_canonical_meet_dates(self):
        self.date_crosswalk()
        for index, body in enumerate(({}, {"startsOn": "2025-10-24", "endsOn": "2025-10-24"},
                {"startsOn": "2025-10-25", "endsOn": "2025-10-25", "dates": {"startDate": "2025-10-24", "endDate": "2025-10-25"}})):
            self.baseline["meets"] = [{"id": "meet", "data": body}]
            result = self.run_prep("canonical-conflict-" + str(index))
            self.assertEqual((result["summary"]["individualsPrepared"], result["summary"]["prerequisites"]), (0, 0))
        self.baseline["meets"] = [{"id": "existing", "data": {"startsOn": "2025-10-24", "endsOn": "2025-10-24"}}]
        self.manifest["sources"][0]["meetIdentity"]["canonicalMeet"] = {"id": "existing", "reviewed": True, "basis": "Synthetic explicit target", "sourceUrl": "https://example.test/identity"}
        self.assertEqual(self.run_prep("explicit-canonical-conflict")["summary"]["individualsPrepared"], 0)

    def test_valid_date_crosswalk_keeps_identity_holds_independent_and_row_accounting_exact(self):
        self.date_crosswalk()
        self.mappings["identityHolds"] = [self.identity_hold()]
        result = self.run_prep()
        self.assertEqual((result["summary"]["sourcesValidated"], result["summary"]["individualsPrepared"], result["summary"]["prerequisites"]), (1, 0, 0))
        counts = result["summary"]["reconciliation"]["source"]
        self.assertEqual((counts["individualSourceRows"], counts["heldIndividuals"], counts["individualRowsAccountedFor"]), (1, 1, 1))
        self.assertIn("identityHold", prep.read(self.root / "run/manual-review.json")[0])

    def test_date_crosswalk_whole_catalog_retains_all_940_observations(self):
        self.date_crosswalk()
        self.baseline["catalog"].extend({"id": "meet-" + str(i), "data": {"kind": "meet"}} for i in range(939))
        self.baseline["catalogCount"] = 940
        self.manifest.update(scope="whole-catalog", catalogRevision="1", selectedMeetIds=[r["id"] for r in self.baseline["catalog"]])
        self.manifest["sources"].extend({"id": "pending-" + row["id"], "meetId": row["id"], "available": False,
            "receiptStatus": "pending", "reason": "Synthetic pending source"} for row in self.baseline["catalog"][1:])
        result = self.run_prep()
        self.assertEqual(result["summary"]["selectedMeets"], 940)
        self.assertEqual(result["summary"]["individualsPrepared"], 1)
        self.assertEqual(len(result["summary"]["meetCoverage"]), 940)
        self.assertEqual(len(prep.read(self.root / "run/source-manifest.json")["selectedMeetIds"]), 940)

    def test_date_crosswalk_rehashes_evidence_receipt_and_rejects_changed_resume_inputs(self):
        crosswalk = self.date_crosswalk()
        self.run_prep()
        source = self.manifest["sources"][0]
        binding = source["dateEvidenceFiles"][1]
        path = self.root / binding["file"]
        original = path.read_bytes()
        path.write_bytes(original + b"changed")
        with self.assertRaisesRegex(ValueError, "Resumed source integrity failed"):
            self.run_prep(resume=True)
        path.write_bytes(original)
        receipt_path = self.root / binding["receiptFile"]
        original_receipt = receipt_path.read_bytes()
        receipt_path.write_bytes(original_receipt + b"\n")
        with self.assertRaisesRegex(ValueError, "Resumed source integrity failed"):
            self.run_prep(resume=True)
        receipt_path.write_bytes(original_receipt)
        crosswalk["basis"] += "; new reviewed evidence"
        with self.assertRaisesRegex(ValueError, "Resume inputs/code changed"):
            self.run_prep(resume=True)

    def test_date_crosswalk_rejects_malformed_or_duplicate_evidence_and_bindings(self):
        crosswalk = self.date_crosswalk()
        source = self.manifest["sources"][0]
        original = copy.deepcopy(source)
        variants = []
        for field, value in (("version", "1"), ("basis", " "), ("preserveCatalogObservation", 1),
                ("reschedulingCauseOrSequenceEstablished", True), ("sourceArchiveSha256", "a" * 64), ("evidence", [])):
            variants.append(lambda s, field=field, value=value: s["meetIdentity"]["dateCrosswalk"].update({field: value}))
        variants.extend((lambda s: s["meetIdentity"]["dateCrosswalk"].update(unrecognized=True),
            lambda s: s["meetIdentity"]["dateCrosswalk"]["catalogObservation"].update(meetId="other"),
            lambda s: s["meetIdentity"]["dateCrosswalk"]["catalogObservation"].update(canonicalRevisionReviewed="01"),
            lambda s: s["meetIdentity"]["dateCrosswalk"]["evidence"].append(copy.deepcopy(s["meetIdentity"]["dateCrosswalk"]["evidence"][0])),
            lambda s: s["dateEvidenceFiles"].pop(),
            lambda s: s["dateEvidenceFiles"].__setitem__(1, copy.deepcopy(s["dateEvidenceFiles"][0])),
            lambda s: s["meetIdentity"]["dateCrosswalk"]["evidence"][1].update(numericDate="2025-10-24"),
            lambda s: s["meetIdentity"]["dateCrosswalk"]["evidence"][1].update(page=True),
            lambda s: s["meetIdentity"]["dateCrosswalk"]["evidence"][1].update(sourceUrl=s["url"])))
        for index, change in enumerate(variants):
            self.manifest["sources"][0] = copy.deepcopy(original)
            change(self.manifest["sources"][0])
            with self.subTest(case=index), self.assertRaises(ValueError):
                self.run_prep("malformed-crosswalk-" + str(index))

    def test_date_crosswalk_rejects_receipt_semantic_mismatches_even_with_rebound_hash(self):
        self.date_crosswalk()
        original = copy.deepcopy(self.manifest["sources"][0])
        for index, change in enumerate((lambda r: r.update(httpStatus=True), lambda r: r.update(httpStatus=403),
                lambda r: r.update(sha256="a" * 64), lambda r: r.update(sourceUrl="https://example.test/different"),
                lambda r: r.pop("capturedAt"), lambda r: r.update(capturedAt="2026-10-01T00:00:00"))):
            source = self.manifest["sources"][0] = copy.deepcopy(original)
            binding = source["dateEvidenceFiles"][1]
            receipt_path = self.root / binding["receiptFile"]
            receipt = {"sourceUrl": source["meetIdentity"]["dateCrosswalk"]["evidence"][1]["sourceUrl"], "sha256": binding["sha256"],
                "httpStatus": 200, "capturedAt": "2026-10-01T00:00:00Z"}
            change(receipt)
            prep.save(receipt_path, receipt)
            digest = prep.sha(receipt_path.read_bytes())
            binding["receiptSha256"] = source["meetIdentity"]["dateCrosswalk"]["evidence"][1]["receiptSha256"] = digest
            self.assert_date_source_held("bad-receipt-" + str(index))

    def test_date_crosswalk_rejects_wrong_member_hash_counts_raw_catalog_values_or_authority_removal(self):
        self.date_crosswalk()
        original = copy.deepcopy(self.manifest["sources"][0])
        for index, change in enumerate((lambda c: c["evidence"][2].update(hy3Sha256="a" * 64),
                lambda c: c["evidence"][2].update(cl2Sha256="b" * 64),
                lambda c: c["evidence"][2].update(individualRaceDates={"2025-10-25": 2}),
                lambda c: c["catalogObservation"].update(rawStartValue="2025-10-24T22:00:00-07:00"))):
            source = self.manifest["sources"][0] = copy.deepcopy(original)
            change(source["meetIdentity"]["dateCrosswalk"])
            self.assert_date_source_held("bad-date-binding-" + str(index))
        source = self.manifest["sources"][0] = copy.deepcopy(original)
        source["meetIdentity"]["dateCrosswalk"]["evidence"].pop(1)
        source["dateEvidenceFiles"].pop(1)
        with self.assertRaisesRegex(ValueError, "separate official numeric-date authority"):
            self.run_prep("no-independent-authority")

    def test_date_crosswalk_rejects_rebound_raw_listing_with_wrong_duplicate_or_changed_event(self):
        self.date_crosswalk()
        original = copy.deepcopy(self.manifest["sources"][0])
        initial = json.loads((self.root / original["dateEvidenceFiles"][0]["file"]).read_bytes())
        for index, listing in enumerate(([{**initial[0], "id": {"value": 2}}], [initial[0], copy.deepcopy(initial[0])],
                [{**initial[0], "startDate": {"displayValueISO": "2025-10-23", "value": "2025-10-24T23:00:00-07:00"}}])):
            source = self.manifest["sources"][0] = copy.deepcopy(original)
            reference = source["meetIdentity"]["dateCrosswalk"]["evidence"][0]
            binding = source["dateEvidenceFiles"][0]
            path, receipt_path = (self.root / binding[key] for key in ("file", "receiptFile"))
            path.write_bytes(prep.encode(listing))
            digest = prep.sha(path.read_bytes())
            reference["sha256"] = binding["sha256"] = source["meetIdentity"]["dateCrosswalk"]["catalogObservation"]["rawListingSha256"] = digest
            prep.save(receipt_path, {"sourceUrl": reference["sourceUrl"], "sha256": digest, "httpStatus": 200, "capturedAt": "2026-10-01T00:00:00Z"})
            reference["receiptSha256"] = binding["receiptSha256"] = prep.sha(receipt_path.read_bytes())
            self.assert_date_source_held("bad-raw-event-" + str(index))

    def test_date_crosswalk_preserves_relay_provenance_and_checks_raw_relay_dates(self):
        raw, cl, _ = fixtures.paired_fixture(gender="F", stroke="A")
        header = fixtures.hy3("B1", {2: "Synthetic Meet", 92: "10252025", 100: "10252025"})
        self.source(raw=(raw[:132] + header + b"\r\n" + raw[132:], cl.encode("cp1252")))
        self.mappings["teams"][0]["sourceNames"] = ["Velocity Swimming"]
        crosswalk = self.date_crosswalk(individual_rows=0, relay_rows=1)
        result = self.run_prep("relay-date-crosswalk")
        self.assertEqual(result["summary"]["relaysPrepared"], 1)
        relay = next(w["after"] for w in self.writes("relay-date-crosswalk") if w["path"].startswith("relay_results/"))
        self.assertEqual(relay["sourceObservation"]["dateCrosswalk"], crosswalk)
        self.assertFalse(relay["sourceObservation"]["catalogDateMatch"])
        lines = (raw[:132] + header + b"\r\n" + raw[132:]).splitlines()
        changed = []
        for line in lines:
            if line[:2] == b"F2":
                text = line[:128].decode("cp1252")
                line = fixtures.hy3("F2", {2: text[2:102], 102: "10242025", 110: text[110:128]})
            changed.append(line)
        self.source(raw=(b"\r\n".join(changed) + b"\r\n", cl.encode("cp1252")))
        self.date_crosswalk(individual_rows=0, relay_rows=1)
        self.assert_date_source_held("raw-relay-date-conflict", "Original HY3/CL2 race dates")

    def test_date_crosswalk_successful_resume_is_byte_identical_and_new_code_changes_run_hash(self):
        self.date_crosswalk()
        first = self.run_prep()
        before = {str(p.relative_to(self.root / "run")): p.read_bytes() for p in (self.root / "run").rglob("*.json")}
        self.assertEqual(first, self.run_prep(resume=True))
        self.assertEqual(before, {str(p.relative_to(self.root / "run")): p.read_bytes() for p in (self.root / "run").rglob("*.json")})
        manifest = prep.read(self.root / "run/manifest.json")
        self.assertEqual(manifest["inputs"]["code"], prep.sha(Path(prep.__file__).read_bytes()))

    def test_date_crosswalk_retains_exact_catalog_navigation_fragment_without_relaxing_download_urls(self):
        crosswalk = self.date_crosswalk()
        catalog = self.baseline["catalog"][0]["data"]
        catalog["sourceUrl"] = "https://example.test/team/events#/team-events/past/1"
        observation = crosswalk["catalogObservation"]
        observation["sourceUrl"] = catalog["sourceUrl"]
        observation["dataSha256"] = prep.sha(prep.encode(catalog))
        result = self.run_prep("catalog-deep-link")
        self.assertEqual(result["summary"]["individualsPrepared"], 1)
        self.assertEqual(result["dateCrosswalks"][0]["dateCrosswalk"]["catalogObservation"]["sourceUrl"], catalog["sourceUrl"])
        observation["sourceUrl"] += " raw whitespace"
        with self.assertRaisesRegex(ValueError, "raw whitespace"):
            self.run_prep("bad-catalog-deep-link")
        observation["sourceUrl"] = catalog["sourceUrl"]
        crosswalk["evidence"][1]["sourceUrl"] += "#fragment"
        with self.assertRaisesRegex(ValueError, "HTTPS source URL"):
            self.run_prep("fragment-download-url")

    def test_date_crosswalk_entry_authority_rejects_oversized_metadata_before_member_read(self):
        crosswalk = self.date_crosswalk()
        source = self.manifest["sources"][0]
        path = self.root / "tiny-entry.zip"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("entry.ev3", "Synthetic entry date 10/25/2025")
        receipt_path = self.root / "tiny-entry.receipt.json"
        entry_hash = prep.sha(path.read_bytes())
        entry_url = "https://example.test/entry.zip"
        prep.save(receipt_path, {"sourceUrl": entry_url, "sha256": entry_hash, "httpStatus": 200, "capturedAt": "2026-10-01T00:00:00Z"})
        receipt_hash = prep.sha(receipt_path.read_bytes())
        crosswalk["evidence"].append({"kind": "official_entry_event_headers", "sha256": entry_hash, "receiptSha256": receipt_hash,
            "sourceUrl": entry_url, "numericDate": "2025-10-25", "memberSha256": [prep.sha(b"Synthetic entry date 10/25/2025")]})
        source["dateEvidenceFiles"].append({"sha256": entry_hash, "file": path.name, "receiptSha256": receipt_hash, "receiptFile": receipt_path.name})
        parsed = prep.read_source(source, self.root)
        oversized = zipfile.ZipInfo("metadata-only.ev3")
        oversized.file_size = 100_000_001
        with patch.object(prep.zipfile, "ZipFile") as factory:
            archive = factory.return_value.__enter__.return_value
            archive.infolist.return_value = [oversized]
            archive.read.side_effect = AssertionError("Oversized member must never be read")
            with self.assertRaisesRegex(ValueError, "oversized archive members"):
                prep.validate_source_dates(source, parsed, self.baseline, self.root)
            archive.read.assert_not_called()

    def identity_hold(self, source=None, member="MEMBER000001"):
        source = source or self.manifest["sources"][0]
        return {"sourceMemberIdHash": prep.digest(member), "state": "unresolved",
            "basis": "Synthetic unresolved identity evidence from an earlier official archive",
            "evidence": [{"sourceId": source["id"], "meetId": source["meetId"], "archiveSha256": source["sha256"],
                "file": source["hy3"], "line": 6, "sourceUrl": source["url"]}]}

    def relay_hold_case(self, variant=None):
        raw, cl, members = fixtures.paired_fixture(gender="F", stroke="A")
        lines = raw.splitlines()
        lines.insert(1, fixtures.hy3("B1", {2: "Synthetic Meet", 92: "10252025", 100: "10252025"}))
        if variant == "missing-f3":
            lines = [line for line in lines if line[:2] != b"F3"]
        elif variant == "missing-d1":
            lines = [line for line in lines if not (line[:2] == b"D1" and line[3:8].strip() == b"2")]
        elif variant in ("duplicate-key", "shared-prefix"):
            replacement = members[1] + "XX" if variant == "shared-prefix" else "OTHER0000002"
            duplicate = fixtures.hy3("D1", {2: "M", 3: "    2", 8: "ChangedLast", 28: "ChangedFirst", 69: replacement, 88: "01012010"})
            lines.insert(next(index for index, line in enumerate(lines) if line[:2] == b"F1"), duplicate)
        self.source(raw=(b"\r\n".join(lines) + b"\r\n", cl.encode("cp1252")))
        self.mappings["teams"][0]["sourceNames"] = ["Velocity Swimming"]
        self.baseline["athletes"] = [{"id": "person-" + str(i), "data": {"name": {"first": "Canonical", "last": str(i)}}}
            for i in range(1, 5)]
        claims = [{"data": {"namespace": "hytek-member", "sourceId": prep.digest(member), "athleteId": "person-" + str(i)}}
            for i, member in enumerate(members, 1)]
        if variant == "shared-prefix":
            claims.append({"data": {"namespace": "hytek-member", "sourceId": prep.digest(members[1] + "XX"), "athleteId": "person-2"}})
        self.baseline["identityClaims"] = {"athletes": claims}
        self.mappings["identityHolds"] = [self.identity_hold(member=members[1])]
        return members

    def assert_relay_identity_held(self, output):
        result = self.run_prep(output)
        self.assertEqual((result["summary"]["relaysPrepared"], result["summary"]["prerequisites"], result["summary"]["batches"]), (0, 0, 0))
        self.assertEqual(self.writes(output), [])
        counts = result["summary"]["reconciliation"]["source"]
        self.assertEqual((counts["relaySourceRows"], counts["heldRelays"], counts["relayRowsAccountedFor"]), (1, 1, 1))
        review = prep.read(self.root / output / "manual-review.json")
        self.assertEqual(len(review), 1)
        self.assertEqual(review[0]["kind"], "relay")
        self.assertEqual(review[0]["unresolvedIdentityHoldCount"], 1)
        return review[0]

    def test_persistent_identity_hold_blocks_later_archive_name_variant_without_orphan_prerequisites(self):
        old = copy.deepcopy(self.manifest["sources"][0])
        self.baseline["athletes"] = [{"id": "existing", "data": {"name": {"first": "First", "last": "Last"}}}]
        prior = self.run_prep("earlier-name-overlap")
        self.assertEqual(prior["summary"]["individualsPrepared"], 0)
        self.source(sid="later", first="Changed", last="Variant")
        self.manifest["sources"] = [source for source in self.manifest["sources"] if source["id"] == "later"]
        # Without a persistent decision, the later variant has no name overlap.
        self.assertEqual(self.run_prep("unguarded-control")["summary"]["individualsPrepared"], 1)
        self.mappings["identityHolds"] = [self.identity_hold(old)]
        held = self.run_prep("guarded-later-name")
        self.assertEqual((held["summary"]["individualsPrepared"], held["summary"]["prerequisites"], held["summary"]["batches"]), (0, 0, 0))
        self.assertEqual(self.writes("guarded-later-name"), [])
        review = prep.read(self.root / "guarded-later-name/manual-review.json")
        self.assertEqual(len(review), 1)
        self.assertEqual(review[0]["sourceId"], "later")
        self.assertEqual(review[0]["sourceMemberIdHash"], prep.digest("MEMBER000001"))
        self.assertEqual(review[0]["identityHold"], self.mappings["identityHolds"][0])
        self.assertEqual(held["summary"]["reconciliation"]["later"]["individualRowsAccountedFor"], 1)

    def test_persistent_identity_hold_overrides_existing_canonical_claim_or_profile_provenance(self):
        for index, use_claim in enumerate((False, True)):
            with self.subTest(private_claim=use_claim):
                body = {"name": {"first": "Canonical", "last": "Profile"}}
                if not use_claim:
                    body["sourceObservation"] = {"memberIdHash": prep.digest("MEMBER000001")}
                self.baseline["athletes"] = [{"id": "existing", "data": body}]
                self.baseline["identityClaims"] = {"athletes": ([{"data": {"namespace": "hytek-member",
                    "sourceId": prep.digest("MEMBER000001"), "athleteId": "existing"}}] if use_claim else [])}
                self.mappings["identityHolds"] = [self.identity_hold()]
                result = self.run_prep("canonical-held-" + str(index))
                self.assertEqual((result["summary"]["individualsPrepared"], result["summary"]["prerequisites"]), (0, 0))
                self.assertEqual(self.writes("canonical-held-" + str(index)), [])

    def test_persistent_identity_hold_reconciles_all_affected_rows_and_preserves_other_digest(self):
        self.source(raw=fixture(rows=[("P", "Y", " ", "  61.00", " 1", "10252025"),
            ("F", "Y", "Q", "   0.00", " 1", "10252025"), ("F", "L", "R", "       ", " 2", "10252025")]))
        self.source(sid="clean", member="MEMBER000002", first="Other", last="Competitor")
        self.mappings["identityHolds"] = [self.identity_hold()]
        result = self.run_prep()
        rows = result["summary"]["reconciliation"]
        self.assertEqual((rows["source"]["individualSourceRows"], rows["source"]["heldIndividuals"], rows["source"]["individualRowsAccountedFor"]), (3, 3, 3))
        self.assertEqual((rows["clean"]["preparedIndividuals"], rows["clean"]["individualRowsAccountedFor"]), (1, 1))
        writes = self.writes()
        self.assertEqual(sum(w["path"].startswith("athletes/") for w in writes), 1)
        self.assertEqual(sum(w["path"].startswith("swims/") for w in writes), 1)
        self.assertTrue(all(prep.digest("MEMBER000001") not in json.dumps(w) for w in writes))
        self.assertEqual(len([r for r in prep.read(self.root / "run/manual-review.json") if "identityHold" in r]), 3)

    def test_absent_and_empty_identity_holds_preserve_clean_proposals_and_repeat_behavior(self):
        absent = self.run_prep("absent-holds")
        absent_writes = self.writes("absent-holds")
        self.mappings["identityHolds"] = []
        empty = self.run_prep("empty-holds")
        self.assertEqual(absent["summary"], empty["summary"])
        self.assertEqual(absent_writes, self.writes("empty-holds"))
        for write in absent_writes:
            root, rid = write["path"].split("/")
            self.baseline[root].append({"id": rid, "data": write["after"]})
        self.mappings.pop("identityHolds")
        repeat = self.run_prep("unchanged-repeat")
        self.assertEqual((repeat["summary"]["batches"], repeat["summary"]["duplicateRows"]), (0, 1))

    def test_malformed_identity_holds_fail_closed_before_any_output(self):
        valid = self.identity_hold()
        variants = [None, {}, "unresolved", [None], [{}], [{**valid, "unexpected": True}]]
        for bad_hash in (None, 7, "a" * 23, "A" * 24, "g" * 24, "a" * 25):
            variants.append([{**valid, "sourceMemberIdHash": bad_hash}])
        for bad_state in (None, False, "resolved", "pending", "UNRESOLVED"):
            variants.append([{**valid, "state": bad_state}])
        for bad_basis in (None, 7, "", "   "):
            variants.append([{**valid, "basis": bad_basis}])
        for bad_evidence in (None, {}, [], [None], [{}]):
            variants.append([{**valid, "evidence": bad_evidence}])
        for index, value in enumerate(variants):
            with self.subTest(case=index):
                self.mappings["identityHolds"] = copy.deepcopy(value)
                output = "malformed-hold-" + str(index)
                with self.assertRaises(ValueError):
                    self.run_prep(output)
                self.assertFalse((self.root / output).exists())

    def test_malformed_identity_hold_evidence_and_duplicate_references_are_rejected(self):
        valid = self.identity_hold()
        reference = valid["evidence"][0]
        variants = [{**reference, "unexpected": True}]
        for key, values in {"sourceId": [None, "", "bad/id"], "meetId": [False, "bad/id"],
                "archiveSha256": [None, "a" * 63, "A" * 64], "file": [None, "", "   ", "bad\nfile"],
                "line": [None, True, 0, -1, "6"], "sourceUrl": [None, "http://example.test/source", "https://example.test/raw space"]}.items():
            variants.extend({**reference, key: value} for value in values)
        for index, reference in enumerate(variants):
            with self.subTest(case=index):
                self.mappings["identityHolds"] = [{**valid, "evidence": [reference]}]
                with self.assertRaises(ValueError):
                    self.run_prep("bad-evidence-" + str(index))
        self.mappings["identityHolds"] = [{**valid, "evidence": [valid["evidence"][0], copy.deepcopy(valid["evidence"][0])]}]
        with self.assertRaisesRegex(ValueError, "Duplicate identity hold evidence"):
            self.run_prep("duplicate-evidence")

    def test_duplicate_hold_digest_and_conflicting_approved_alias_are_rejected(self):
        valid = self.identity_hold()
        self.mappings["identityHolds"] = [valid, copy.deepcopy(valid)]
        with self.assertRaisesRegex(ValueError, "Duplicate unresolved identity hold"):
            self.run_prep("duplicate-hold")
        self.mappings["identityHolds"] = [valid]
        self.baseline["athletes"] = [{"id": "existing", "data": {"name": {"first": "First", "last": "Last"}}}]
        self.mappings["identities"] = [{"sourceMemberIdHash": valid["sourceMemberIdHash"], "athleteId": "existing",
            "reviewed": True, "basis": "Synthetic proposed approved alias", "sourceUrl": "https://example.test/identity"}]
        with self.assertRaisesRegex(ValueError, "Approved identity alias conflicts with unresolved identity hold"):
            self.run_prep("conflicting-alias")

    def test_duplicate_conflicting_or_malformed_approved_aliases_are_rejected(self):
        alias = {"sourceMemberIdHash": prep.digest("MEMBER000001"), "athleteId": "existing", "reviewed": True,
            "basis": "Synthetic reviewed stable identity", "sourceUrl": "https://example.test/identity"}
        self.baseline["athletes"] = [{"id": rid, "data": {"name": {"first": "Canonical", "last": rid}}} for rid in ("existing", "other")]
        for target in ("existing", "other"):
            self.mappings["identities"] = [alias, {**alias, "athleteId": target}]
            with self.assertRaisesRegex(ValueError, "Duplicate or conflicting approved identity alias"):
                self.run_prep("duplicate-alias-" + target)
        for index, item in enumerate((None, {}, {**alias, "sourceMemberIdHash": None}, {**alias, "sourceMemberIdHash": "A" * 24},
                {**alias, "basis": "   "}, {**alias, "athleteId": None}, {**alias, "sourceUrl": None})):
            self.mappings["identities"] = [item]
            with self.assertRaises(ValueError):
                self.run_prep("malformed-alias-" + str(index))

    def test_persistent_identity_hold_changes_require_new_resume_directory(self):
        self.run_prep()
        self.mappings["identityHolds"] = [self.identity_hold()]
        with self.assertRaisesRegex(ValueError, "Resume inputs/code changed"):
            self.run_prep(resume=True)
        self.assertEqual(self.run_prep("held-new-run")["summary"]["batches"], 0)

    def test_relay_with_persistently_held_member_is_held_without_dropping_lineup_or_prerequisites(self):
        raw, cl, members = fixtures.paired_fixture(gender="F", stroke="A")
        header = fixtures.hy3("B1", {2: "Synthetic Meet", 92: "10252025", 100: "10252025"})
        self.source(raw=(raw[:132] + header + b"\r\n" + raw[132:], cl.encode("cp1252")))
        self.mappings["teams"][0]["sourceNames"] = ["Velocity Swimming"]
        self.baseline["athletes"] = [{"id": "person-" + str(i), "data": {"name": {"first": "Canonical", "last": str(i)}}}
            for i in range(1, 5)]
        self.baseline["identityClaims"] = {"athletes": [{"data": {"namespace": "hytek-member", "sourceId": prep.digest(member),
            "athleteId": "person-" + str(i)}} for i, member in enumerate(members, 1)]}
        self.assertEqual(self.run_prep("relay-no-hold")["summary"]["relaysPrepared"], 1)
        relay = next(w["after"] for w in self.writes("relay-no-hold") if w["path"].startswith("relay_results/"))
        self.assertEqual(relay["lineupCoverage"], "complete")
        self.assertEqual(len([m for m in relay["members"] if m.get("athleteId")]), 4)
        self.mappings["identityHolds"] = [self.identity_hold(member=members[1])]
        result = self.run_prep("relay-held")
        self.assertEqual((result["summary"]["relaysPrepared"], result["summary"]["prerequisites"], result["summary"]["batches"]), (0, 0, 0))
        self.assertEqual(self.writes("relay-held"), [])
        counts = result["summary"]["reconciliation"]["source"]
        self.assertEqual((counts["relaySourceRows"], counts["heldRelays"], counts["relayRowsAccountedFor"]), (1, 1, 1))
        review = prep.read(self.root / "relay-held/manual-review.json")
        self.assertEqual(len(review), 1)
        self.assertEqual(review[0]["kind"], "relay")
        self.assertEqual(review[0]["sourceMemberIdHashes"], [prep.digest(members[1])])
        self.assertEqual(review[0]["identityHolds"], self.mappings["identityHolds"])
        # The conservative hold also applies if no current profile binding exists.
        self.baseline["athletes"] = []
        self.baseline["identityClaims"] = {"athletes": []}
        self.assertEqual(self.run_prep("relay-unbound-held")["summary"]["batches"], 0)

    def test_relay_missing_f3_cannot_hide_a_persistent_identity_hold(self):
        members = self.relay_hold_case("missing-f3")
        review = self.assert_relay_identity_held("missing-f3")
        self.assertEqual(review["sourceMemberIdHashes"], [prep.digest(members[1])])
        self.assertTrue(review["relayIdentityProblems"])
        # Even without a direct digest match, an incomplete paired lineup is
        # uncertain while unresolved source identities remain in the ledger.
        self.mappings["identityHolds"] = [self.identity_hold(member="UNRELATED001")]
        uncertain = self.assert_relay_identity_held("missing-f3-unrelated-ledger")
        self.assertEqual(uncertain["sourceMemberIdHashes"], [])
        self.assertIn("incomplete or ambiguous", uncertain["reason"])

    def test_relay_missing_d1_cannot_hide_a_persistent_identity_hold(self):
        members = self.relay_hold_case("missing-d1")
        review = self.assert_relay_identity_held("missing-d1")
        self.assertEqual(review["sourceMemberIdHashes"], [prep.digest(members[1])])
        self.assertTrue(any("missing or duplicate original D1" in reason for reason in review["relayIdentityProblems"]))
        # A longer held ID cannot be reconstructed from the truncated CL2 ID;
        # the missing original D1 must therefore hold the uncertain total.
        self.baseline["athletes"] = []
        self.baseline["identityClaims"] = {"athletes": []}
        self.mappings["identityHolds"] = [self.identity_hold(member=members[1] + "XX")]
        uncertain = self.assert_relay_identity_held("missing-d1-longer-held-id")
        self.assertEqual(uncertain["sourceMemberIdHashes"], [])
        self.assertIn("incomplete or ambiguous", uncertain["reason"])

    def test_relay_duplicate_d1_key_retains_earlier_held_identity_and_blocks_overwrite(self):
        members = self.relay_hold_case("duplicate-key")
        parsed = prep.read_source(self.manifest["sources"][0], self.root)
        originals = [a for a in parsed["relayAthleteObservations"] if a["number"] == "2" and a["gender"] == "M"]
        self.assertEqual(len(originals), 2)
        self.assertEqual({a["member"] for a in originals}, {members[1], "OTHER0000002"})
        self.assertEqual(len(parsed["athletes"]), 4)
        review = self.assert_relay_identity_held("duplicate-key")
        self.assertEqual(review["sourceMemberIdHashes"], [prep.digest(members[1])])
        self.assertTrue(any("missing or duplicate original D1" in reason for reason in review["relayIdentityProblems"]))

    def test_relay_shared_prefix_alias_cannot_rebuild_complete_lineup_around_held_digest(self):
        members = self.relay_hold_case("shared-prefix")
        # The old adapter used the last D1 and its longer-ID canonical alias,
        # turning this ambiguity into an apparently complete four-link lineup.
        review = self.assert_relay_identity_held("shared-prefix")
        self.assertEqual(review["sourceMemberIdHashes"], [prep.digest(members[1])])
        self.assertTrue(any("missing or duplicate original D1" in reason for reason in review["relayIdentityProblems"]))

    def test_complete_unique_unrelated_relay_keeps_existing_behavior_with_active_identity_holds(self):
        self.relay_hold_case()
        self.mappings["identityHolds"] = [self.identity_hold(member="UNRELATED001")]
        result = self.run_prep("unrelated-held-digest")
        self.assertEqual(result["summary"]["relaysPrepared"], 1)
        relay = next(w["after"] for w in self.writes("unrelated-held-digest") if w["path"].startswith("relay_results/"))
        self.assertEqual(relay["lineupCoverage"], "complete")
        self.assertEqual(len([member for member in relay["members"] if member.get("athleteId")]), 4)
        self.assertTrue(all("identityHolds" not in row for row in prep.read(self.root / "unrelated-held-digest/manual-review.json")))

    def test_relay_alias_binding_to_protected_canonical_person_remains_held(self):
        members = self.relay_hold_case()
        protected_id = members[1] + "XX"
        self.mappings["identityHolds"] = [self.identity_hold(member=protected_id)]
        self.baseline["identityClaims"]["athletes"].append({"data": {"namespace": "hytek-member",
            "sourceId": prep.digest(protected_id), "athleteId": "person-2"}})
        review = self.assert_relay_identity_held("protected-canonical-binding")
        self.assertEqual(review["sourceMemberIdHashes"], [prep.digest(protected_id)])
        self.assertEqual(review["relayIdentityProblems"], [])

    def test_relay_distinct_local_keys_sharing_cl2_prefix_are_uncertain_with_active_holds(self):
        members = self.relay_hold_case()
        source = self.manifest["sources"][0]
        with zipfile.ZipFile(self.root / source["file"]) as archive:
            lines = archive.read(source["hy3"]).splitlines()
            companion = archive.read(source["cl2"])
        extra = fixtures.hy3("D1", {2: "M", 3: "   22", 8: "Different", 28: "Competitor", 69: members[1] + "XX", 88: "01012010"})
        lines.insert(next(index for index, line in enumerate(lines) if line[:2] == b"F1"), extra)
        self.source(raw=(b"\r\n".join(lines) + b"\r\n", companion))
        self.mappings["identityHolds"] = [self.identity_hold(member="UNRELATED001")]
        review = self.assert_relay_identity_held("competing-prefix")
        self.assertEqual(review["sourceMemberIdHashes"], [])
        self.assertTrue(any("CL2 member prefix is ambiguous" in reason for reason in review["relayIdentityProblems"]))

    def test_private_additive_bounded_dependency_order_and_byte_identical_resume(self):
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 1)
        self.assertEqual([b["phase"] for b in result["batches"]], ["prerequisites", "athletes", "races"])
        self.assertEqual(result["batches"][-1]["requiresBatches"], ["batches/0001.json", "batches/0002.json"])
        for batch in result["batches"]:
            path = self.root / "run" / batch["file"]
            payload = prep.read(path)
            self.assertLess(len(path.read_bytes()), 2_000_000)
            self.assertLessEqual(len(payload["writes"]), 100)
            self.assertTrue(all(r["before"] is None for r in payload["reads"] if r["path"] in {w["path"] for w in payload["writes"]}))
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        before = {str(p.relative_to(self.root / "run")): p.read_bytes() for p in (self.root / "run").rglob("*.json")}
        self.assertEqual(self.run_prep(resume=True), result)
        self.assertEqual(before, {str(p.relative_to(self.root / "run")): p.read_bytes() for p in (self.root / "run").rglob("*.json")})
        proposed = json.dumps(self.writes())
        self.assertNotIn("MEMBER000001", proposed)
        self.assertNotIn("01012010", proposed)
        self.assertEqual(next(w["after"] for w in self.writes() if w["path"].startswith("swims/"))["ageAtSwim"], 15)

    def test_chunked_baseline_preparation_matches_complete_inline_baseline_and_rejects_corruption(self):
        inline = self.run_prep()
        self.baseline.update(catalog=[{"id": "meet", "data": {"kind": "meet"}}], catalogCount=1,
            catalogComplete=True, identityClaims={name: [] for name in bundle.CLAIMS})
        path = self.root / "baseline-bundle.json"
        bundle.write(self.baseline, path)
        chunked = prep.prepare(self.root / "sources.json", path, self.root / "mappings.json", self.root / "chunked")
        self.assertEqual(inline["summary"], chunked["summary"])
        self.assertEqual(inline["baselineRecordsSha256"], chunked["baselineRecordsSha256"])
        self.assertEqual(self.writes(), self.writes("chunked"))
        self.assertEqual(chunked["inputs"]["baseline"], prep.sha(path.read_bytes()))
        manifest = json.loads(path.read_bytes())
        target = self.root / manifest["chunks"]["catalog"][0]["file"]
        target.write_bytes(target.read_bytes()[:-1])
        with self.assertRaises(ValueError):
            prep.prepare(self.root / "sources.json", path, self.root / "mappings.json", self.root / "corrupt")

    def test_explicit_canonical_meet_crosswalk_preserves_catalog_scope_and_repeat_deduplication(self):
        self.baseline["meets"] = [{"id": "swimcloud-existing", "data": {"id": "swimcloud-existing",
            "name": "Prior official name", "startDate": "2025-10-25", "endDate": "2025-10-25"}}]
        binding = {"id": "swimcloud-existing", "reviewed": True, "basis": "Reviewed official meet identity",
                   "sourceUrl": "https://example.test/canonical-meet"}
        self.manifest["sources"][0]["meetIdentity"]["canonicalMeet"] = binding
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 1)
        writes = self.writes()
        self.assertFalse(any(w["path"].startswith("meets/") for w in writes))
        swim = next(w["after"] for w in writes if w["path"].startswith("swims/"))
        self.assertEqual(swim["meet"]["id"], "swimcloud-existing")
        self.assertEqual(swim["sourceObservation"]["knowledgeMeetId"], "meet")
        self.assertEqual(swim["sourceObservation"]["canonicalMeetCrosswalk"], binding)
        self.assertEqual(result["summary"]["meetCoverage"][0]["meetId"], "meet")
        for write in writes:
            root, rid = write["path"].split("/")
            self.baseline[root].append({"id": rid, "data": write["after"]})
        # A second catalog/source alias must resolve to the same canonical
        # occurrence even though archive URL and catalog provenance differ.
        self.manifest["selectedMeetIds"] = ["other-catalog-id"]
        self.manifest["sources"][0].update(meetId="other-catalog-id", url="https://example.test/alternate.zip")
        repeat = self.run_prep("repeat-crosswalk")
        self.assertEqual((repeat["summary"]["batches"], repeat["summary"]["duplicateRows"]), (0, 1))

    def test_canonical_meet_crosswalk_requires_review_existing_target_and_exact_dates(self):
        source = self.manifest["sources"][0]
        source["meetIdentity"]["canonicalMeet"] = None
        with self.assertRaisesRegex(ValueError, "explicit reviewed"):
            self.run_prep()
        binding = {"id": "existing", "reviewed": False, "basis": "Proposed identity",
                   "sourceUrl": "https://example.test/canonical"}
        source["meetIdentity"]["canonicalMeet"] = binding
        with self.assertRaisesRegex(ValueError, "explicit reviewed"):
            self.run_prep()
        binding["reviewed"] = True
        result = self.run_prep("absent-target")
        self.assertEqual(result["summary"]["individualsPrepared"], 0)
        self.assertIn("target is absent", prep.read(self.root / "absent-target/manual-review.json")[0]["reason"])
        self.baseline["meets"] = [{"id": "existing", "data": {"id": "existing"}}]
        self.assertEqual(self.run_prep("unknown-dates")["summary"]["individualsPrepared"], 0)
        self.baseline["meets"][0]["data"].update(startDate="2025-10-24", endDate="2025-10-25")
        self.assertEqual(self.run_prep("wrong-dates")["summary"]["individualsPrepared"], 0)
        self.baseline["meets"][0]["data"].update(startDate="2025-10-25", startsOn="2025-10-24")
        self.assertEqual(self.run_prep("conflicting-dates")["summary"]["individualsPrepared"], 0)

    def test_legacy_flat_or_date_only_meets_are_checked_without_fuzzy_matching(self):
        for index, dates in enumerate(({"startDate": "2025-10-24", "endDate": "2025-10-24"},
                                       {"date": "2025-10-24"})):
            self.baseline["meets"] = [{"id": "meet", "data": {"id": "meet", **dates}}]
            self.assertEqual(self.run_prep("wrong-legacy-" + str(index))["summary"]["individualsPrepared"], 0)
        # Similar names/dates alone do not authorize binding to a different ID.
        self.baseline["meets"] = [{"id": "similar", "data": {"id": "similar", "name": "Synthetic Meet",
            "startDate": "2025-10-25", "endDate": "2025-10-25"}}]
        self.run_prep("no-inference")
        self.assertIn("meets/meet", {w["path"] for w in self.writes("no-inference")})

    def test_source_urls_require_encoded_spaces_and_preserve_original_attachment_evidence(self):
        source = self.manifest["sources"][0]
        for spacing in (" ", "\t", "\n"):
            source["url"] = "https://example.test/Official" + spacing + "Results.zip"
            with self.assertRaisesRegex(ValueError, "HTTPS source URL"):
                self.run_prep()
        source["url"] = "https://example.test/Official Results.zip"
        source["originalUrl"] = source["url"]
        source["url"] = "https://example.test/Official%20Results.zip"
        self.run_prep("encoded-source")
        swim = next(w["after"] for w in self.writes("encoded-source") if w["path"].startswith("swims/"))
        self.assertEqual(swim["raceIdentity"]["sourceUrl"], source["url"])
        self.assertEqual(swim["sourceObservation"]["url"], source["url"])
        self.assertEqual(swim["sourceObservation"]["originalUrl"], source["originalUrl"])

    def test_round_course_status_and_dfs_are_separate_and_dnf_is_held(self):
        rows = [("P", "Y", " ", "  60.00", " 1", "10252025"), ("F", "Y", "Q", "   0.00", " 1", "10252025"),
                ("F", "S", "F", "   0.00", " 2", "10252025"), ("F", "L", "D", "   0.00", " 3", "10252025")]
        self.source(raw=fixture(rows=rows))
        result = self.run_prep()
        swims = [w["after"] for w in self.writes() if w["path"].startswith("swims/")]
        self.assertEqual({(s["round"], s["course"], s["status"]) for s in swims}, {("P", "SCY", "OK"), ("F", "SCY", "DQ"), ("F", "SCM", "DFS")})
        self.assertEqual(result["summary"]["reconciliation"]["source"]["heldIndividuals"], 1)

    def test_post_apply_repeat_has_no_writes_and_conflicting_existing_time_is_held(self):
        self.run_prep()
        for write in self.writes():
            root, rid = write["path"].split("/")
            self.baseline[root].append({"id": rid, "data": write["after"]})
        repeat = self.run_prep("repeat")
        self.assertEqual(repeat["summary"]["batches"], 0)
        self.assertEqual(repeat["summary"]["duplicateRows"], 1)
        self.baseline["swims"][0]["data"]["timeMs"] += 10
        changed = self.run_prep("changed")
        self.assertEqual(changed["summary"]["individualsPrepared"], 0)
        self.assertIn("Previously imported exact source row differs", prep.read(self.root / "changed/manual-review.json")[0]["reason"])

    def test_name_only_overlap_and_ambiguous_member_identity_do_not_merge(self):
        self.baseline["athletes"] = [{"id": "existing", "data": {"id": "existing", "name": {"first": "First", "last": "Last"}}}]
        self.assertEqual(self.run_prep()["summary"]["individualsPrepared"], 0)
        self.mappings["identities"] = [{"sourceMemberIdHash": prep.digest("MEMBER000001"), "athleteId": "existing", "reviewed": True,
                                        "basis": "Reviewed independent identity evidence", "sourceUrl": "https://example.test/identity"}]
        self.assertEqual(self.run_prep("reviewed")["summary"]["individualsPrepared"], 1)
        self.baseline["athletes"].append({"id": "other", "data": {"id": "other", "sourceObservation": {"memberIdHash": prep.digest("MEMBER000001")}}})
        self.assertEqual(self.run_prep("ambiguous")["summary"]["individualsPrepared"], 0)

    def test_historical_affiliation_preserves_visitors_and_does_not_use_current_team(self):
        self.source(club="VIS", lsc="PN")
        self.mappings["teams"][0].update({"teamId": "visiting", "clubCode": "VIS", "lscCode": "PN"})
        self.baseline["teams"] = [{"id": "ies-now", "data": {"id": "ies-now", "name": "Current Team", "lscCode": "IE"}}]
        self.run_prep()
        swim = next(w["after"] for w in self.writes() if w["path"].startswith("swims/"))
        self.assertEqual(swim["teamId"], "visiting")
        self.assertEqual(swim["sourceObservation"]["affiliation"]["lscCode"], "PN")
        audit = prep.read(self.root / "run/record-audit.json")
        self.assertEqual([t["teamId"] for t in audit["teams"]], ["ies-now"])
        self.assertEqual(audit["teams"][0]["eligibleRows"], 0)
        self.mappings["teams"][0]["validThrough"] = "2025-10-24"
        with self.assertRaises(ValueError):
            self.run_prep("invalid-interval")

    def test_repeated_same_round_is_held_instead_of_collapsed(self):
        row = ("F", "Y", " ", "  60.00", " 1", "10252025")
        self.source(raw=fixture(rows=[row, row]))
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 0)
        self.assertEqual(result["summary"]["reconciliation"]["source"]["heldIndividuals"], 2)

    def test_reviewed_repeated_starts_have_distinct_stable_ids_and_safe_reimports(self):
        self.run_prep("ordinary")
        ordinary = next(w["after"] for w in self.writes("ordinary") if w["path"].startswith("swims/"))
        rows = [("F", "Y", " ", "  60.00", " 1", "10252025"), ("F", "Y", " ", "  61.00", " 1", "10252025")]
        source = self.source(raw=fixture(rows=rows))
        mappings = [{"line": line, "sourceRound": "F", "occurrence": occurrence, "reviewed": True,
                     "basis": "Reviewed official start sheet distinguishes these two starts", "sourceUrl": "https://example.test/starts"}
                    for line, occurrence in ((6, "first-start"), (8, "second-start"))]
        source["occurrenceMappings"] = mappings
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 2)
        races = {w["after"]["raceIdentity"]["occurrence"]: w["after"] for w in self.writes() if w["path"].startswith("swims/")}
        self.assertEqual(len({r["id"] for r in races.values()}), 2)
        self.assertEqual(len({r["externalResult"]["id"] for r in races.values()}), 2)
        self.assertNotIn(ordinary["id"], {r["id"] for r in races.values()})
        empty_baseline = copy.deepcopy(self.baseline)
        for write in self.writes():
            root, rid = write["path"].split("/")
            self.baseline[root].append({"id": rid, "data": write["after"]})
        repeat = self.run_prep("repeat")
        self.assertEqual((repeat["summary"]["batches"], repeat["summary"]["duplicateRows"]), (0, 2))

        # Export order is evidence, not start identity: move each reviewed token
        # with its start and retain both canonical/external identifiers.
        source = self.source(raw=fixture(rows=list(reversed(rows))))
        source["occurrenceMappings"] = [{**m, "line": 14 - m["line"]} for m in mappings]
        reordered = self.run_prep("reordered")
        self.assertEqual((reordered["summary"]["batches"], reordered["summary"]["duplicateRows"]), (0, 2))

        # A correction keeps the same IDs; additive preparation holds the changed
        # existing fact instead of making a second race or replacing the original.
        corrected_rows = [rows[0], ("F", "Y", " ", "  62.00", " 1", "10252025")]
        source = self.source(raw=fixture(rows=corrected_rows))
        source["occurrenceMappings"] = mappings
        applied_baseline = self.baseline
        self.baseline = empty_baseline
        self.run_prep("corrected-proposals")
        corrected = {w["after"]["raceIdentity"]["occurrence"]: w["after"] for w in self.writes("corrected-proposals") if w["path"].startswith("swims/")}
        self.assertEqual({k: (r["id"], r["externalResult"]) for k, r in corrected.items()},
                         {k: (r["id"], r["externalResult"]) for k, r in races.items()})
        self.baseline = applied_baseline
        before = copy.deepcopy(self.baseline["swims"])
        corrected_repeat = self.run_prep("corrected-repeat")
        self.assertEqual((corrected_repeat["summary"]["individualsPrepared"], corrected_repeat["summary"]["duplicateRows"]), (0, 1))
        self.assertEqual(corrected_repeat["summary"]["reconciliation"]["source"]["heldIndividuals"], 1)
        self.assertEqual(self.baseline["swims"], before)

    def test_repeated_start_mapping_still_requires_review_and_a_unique_line_binding(self):
        self.source(raw=fixture(rows=[("F", "Y", " ", "  60.00", " 1", "10252025"), ("F", "Y", " ", "  61.00", " 1", "10252025")]))
        mapping = {"line": 6, "sourceRound": "F", "occurrence": "first-start", "reviewed": False,
                   "basis": "Unreviewed proposed start mapping", "sourceUrl": "https://example.test/starts"}
        self.manifest["sources"][0]["occurrenceMappings"] = [mapping]
        self.assertEqual(self.run_prep()["summary"]["individualsPrepared"], 0)
        mapping["reviewed"] = True
        self.manifest["sources"][0]["occurrenceMappings"] = [mapping, copy.deepcopy(mapping)]
        self.assertEqual(self.run_prep("duplicate-binding")["summary"]["individualsPrepared"], 0)

    def test_missing_age_bad_checksum_missing_companion_and_wrong_meet_are_review_holds(self):
        self.source(birth="")
        self.assertEqual(self.run_prep()["summary"]["individualsPrepared"], 0)
        raw, cl = fixture()
        broken = bytearray(raw)
        broken[128] = ord("9") if broken[128] != ord("9") else ord("8")
        self.source(raw=(bytes(broken), cl))
        self.assertEqual(self.run_prep("checksum")["summary"]["sourcesBlocked"], 1)
        self.source(raw=(raw, cl.replace(b"1:00.00", b"1:01.00").replace(b"60.00", b"61.00")))
        self.assertEqual(self.run_prep("companion")["summary"]["individualsPrepared"], 0)
        self.source()["meetIdentity"]["fileMeet"]["name"] = "Different Meet"
        self.assertEqual(self.run_prep("meet")["summary"]["sourcesBlocked"], 1)

    def test_malformed_individual_does_not_hide_clean_race(self):
        rows = [("F", "Y", " ", " BAD   ", " 1", "10252025"), ("F", "Y", " ", "  61.00", " 2", "10252025")]
        raw, cl = fixture(rows=rows)
        cl = cl.replace(b"BAD", b" NS")
        self.source(raw=(raw, cl))
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 1)
        self.assertEqual(result["summary"]["reconciliation"]["source"]["invalidIndividualRows"], 1)

    def test_checkpoint_refuses_changed_inputs_source_bytes_and_staged_runs(self):
        self.run_prep()
        self.baseline["project"] = "different"
        with self.assertRaises(ValueError):
            self.run_prep(resume=True)
        self.baseline["project"] = "synthetic-test"
        (self.root / "source.zip").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "Resumed source integrity"):
            self.run_prep(resume=True)
        self.source()
        prep.save(self.root / "run/staging-receipts.json", [])
        with self.assertRaisesRegex(ValueError, "staged run"):
            self.run_prep(resume=True)

    def test_preflight_detects_pending_dependencies_stale_facts_and_tampering(self):
        result = self.run_prep()
        report = prep.preflight(self.root / "run/manifest.json", self.root / "baseline.json")
        self.assertFalse(report["ready"])
        self.assertTrue(report["mismatches"])
        # A complete existing baseline needs only a new race; its preflight passes.
        for write in self.writes():
            root, rid = write["path"].split("/")
            if root != "swims":
                self.baseline[root].append({"id": rid, "data": write["after"]})
        result = self.run_prep("ready")
        self.assertTrue(prep.preflight(self.root / "ready/manifest.json", self.root / "baseline.json")["ready"])
        self.baseline["teams"][0]["data"]["name"] = "Staff correction"
        prep.save(self.root / "fresh.json", self.baseline)
        self.assertFalse(prep.preflight(self.root / "ready/manifest.json", self.root / "fresh.json")["ready"])
        path = self.root / "ready" / result["batches"][0]["file"]
        path.write_bytes(path.read_bytes() + b" ")
        self.assertTrue(prep.preflight(self.root / "ready/manifest.json", self.root / "baseline.json")["blockers"])

    def test_incomplete_baseline_is_explicitly_offline_and_stale_preflight_fails(self):
        self.baseline.pop("completeCollections")
        result = self.run_prep()
        self.assertTrue(any("completeness" in b for b in result["launchBlockers"]))
        self.baseline["capturedAt"] = "2020-01-01T00:00:00Z"
        prep.save(self.root / "old.json", self.baseline)
        self.assertFalse(prep.preflight(self.root / "run/manifest.json", self.root / "old.json")["ready"])

    def test_round_reinterpretation_requires_review_and_supports_explicit_time_trials(self):
        self.source(raw=fixture(rows=[("S", "Y", " ", "  60.00", " 1", "10252025")]))
        self.assertEqual(self.run_prep()["summary"]["individualsPrepared"], 0)
        source = self.manifest["sources"][0]
        source["roundMappings"] = {"S": {"round": "TT", "reviewed": True, "basis": "Synthetic corrected official event report", "sourceUrl": "https://example.test/report"}}
        source["occurrenceMappings"] = [{"line": 6, "sourceRound": "S", "occurrence": "tt-1", "reviewed": True,
            "basis": "Reviewed distinct synthetic time trial start", "sourceUrl": "https://example.test/report"}]
        self.run_prep("mapped")
        swim = next(w["after"] for w in self.writes("mapped") if w["path"].startswith("swims/"))
        self.assertEqual(swim["round"], "TT")
        self.assertEqual(swim["sourceObservation"]["sourceRound"], "S")

    def test_relay_totals_stay_separate_and_never_generate_individual_leadoffs(self):
        raw, cl, _ = fixtures.paired_fixture(gender="F", stroke="A")
        header = fixtures.hy3("B1", {2: "Synthetic Meet", 92: "10252025", 100: "10252025"})
        raw = raw[:132] + header + b"\r\n" + raw[132:]
        self.source(raw=(raw, cl.encode("cp1252")))
        self.mappings["teams"][0]["sourceNames"] = ["Velocity Swimming"]
        result = self.run_prep()
        self.assertEqual(result["summary"]["relaysPrepared"], 1)
        self.assertEqual(result["summary"]["individualsPrepared"], 0)
        relay = next(w["after"] for w in self.writes() if w["path"].startswith("relay_results/"))
        self.assertEqual(relay["eventCode"], "200_FR-R_SCY")
        self.assertEqual(relay["splitCoverage"], "complete")
        self.assertTrue(all(not m.get("leadOffEligible") for m in relay["members"]))

    def test_more_than_100_results_split_into_bounded_batches_and_repeat_cleanly(self):
        rows = [("F", "Y", " ", "  60.00", str(i).rjust(4), "10252025") for i in range(1, 206)]
        self.source(raw=fixture(rows=rows))
        self.manifest["sources"][0]["occurrenceMappings"] = [{"line": 6 + 2 * i, "sourceRound": "F", "occurrence": "start-" + str(i),
            "reviewed": True, "basis": "Synthetic distinct start listed in a reviewed event sheet", "sourceUrl": "https://example.test/starts"} for i in range(205)]
        result = self.run_prep()
        self.assertEqual([b["writes"] for b in result["batches"] if b["phase"] == "races"], [100, 100, 5])
        self.assertEqual(result["summary"]["reconciliation"]["source"]["individualRowsAccountedFor"], 205)
        for write in self.writes():
            root, rid = write["path"].split("/")
            self.baseline[root].append({"id": rid, "data": write["after"]})
        repeat = self.run_prep("repeat")
        self.assertEqual(repeat["summary"]["batches"], 0)
        self.assertEqual(repeat["summary"]["duplicateRows"], 205)

    def test_conflicting_source_revisions_hold_both_and_missing_sources_stay_visible(self):
        self.source(sid="revision", raw=fixture(rows=[("F", "Y", " ", "  61.00", " 1", "10252025")]))
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 0)
        self.assertEqual(sum(r["heldIndividuals"] for r in result["summary"]["reconciliation"].values()), 2)
        self.manifest["sources"] = [{"id": "missing", "meetId": "meet", "available": False, "reason": "Official archive unavailable"}]
        missing = self.run_prep("missing")
        self.assertEqual(missing["summary"]["sourcesBlocked"], 1)
        self.assertEqual(prep.read(self.root / "missing/source-manifest.json")["sources"][0]["validation"], "blocked")

    def test_reviewed_member_aliases_share_one_person_and_one_race(self):
        self.baseline["athletes"] = [{"id": "person", "data": {"id": "person", "name": {"first": "First", "last": "Last"}}}]
        for member in ("MEMBER000001", "MEMBER000002"):
            self.mappings["identities"].append({"sourceMemberIdHash": prep.digest(member), "athleteId": "person", "reviewed": True,
                "basis": "Reviewed independent stable ID alias evidence", "sourceUrl": "https://example.test/identity"})
        self.source(sid="alternate", raw=fixture(member="MEMBER000002"))
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 1)
        self.assertEqual(result["summary"]["duplicateRows"], 1)
        self.assertEqual([w["after"]["athleteId"] for w in self.writes() if w["path"].startswith("swims/")], ["person"])

    def test_one_person_keeps_historical_affiliations_without_promoting_current_lsc(self):
        source = self.source(sid="transfer", raw=fixture(rows=[("F", "L", " ", "  61.00", " 2", "10252025")], club="VIS", lsc="PN"))
        self.mappings["teams"].append({**self.mappings["teams"][0], "clubCode": "VIS", "lscCode": "PN"})
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 2)
        races = [w["after"] for w in self.writes() if w["path"].startswith("swims/")]
        self.assertEqual(len({r["athleteId"] for r in races}), 1)
        self.assertEqual({r["sourceObservation"]["affiliation"]["lscCode"] for r in races}, {"IE", "PN"})
        team = next(w["after"] for w in self.writes() if w["path"] == "teams/source-club")
        self.assertNotIn("lscCode", team)
        self.assertNotIn("clubCode", team)
        athlete = next(w["after"] for w in self.writes() if w["path"].startswith("athletes/"))
        self.assertNotIn("teamId", athlete)

    def test_source_provenance_separates_raw_rounds_and_archive_members(self):
        self.source(raw=fixture(rows=[("P", "Y", " ", "  60.00", " 1", "10252025"), ("F", "Y", " ", "  59.00", " 1", "10252025")]))
        self.run_prep()
        writes = self.writes()
        first_line = next(w["after"]["sourceObservation"]["line"] for w in writes if w["path"].startswith("swims/"))
        for write in writes:
            root, rid = write["path"].split("/")
            body = copy.deepcopy(write["after"])
            if root == "swims":
                body["sourceObservation"]["line"] = first_line  # a shared companion row may describe multiple rounds
            self.baseline[root].append({"id": rid, "data": body})
        repeat = self.run_prep("round-repeat")
        self.assertEqual(repeat["summary"]["batches"], 0)
        self.assertEqual(repeat["summary"]["duplicateRows"], 2)
        self.baseline["swims"] = self.baseline["swims"][:1]
        body = self.baseline["swims"][0]["data"]
        body["id"] = self.baseline["swims"][0]["id"] = "other-member-race"
        body["athleteId"] = "another-person"
        body["sourceObservation"]["file"] = "another-export.hy3"
        fresh = self.run_prep("member-isolation")
        self.assertEqual(fresh["summary"]["individualsPrepared"], 2)

    def test_missing_ns_time_is_not_a_zero_time_performance_and_no_ns_splits_are_imported(self):
        raw, cl = fixture(rows=[("F", "Y", "R", "       ", " 1", "10252025")])
        h = raw.splitlines()
        h.append(fixtures.hy3("G1", {2: "F 1   30.00"}))
        self.source(raw=(b"\r\n".join(h)+b"\r\n", cl))
        self.run_prep()
        body = next(w["after"] for w in self.writes() if w["path"].startswith("swims/"))
        self.assertEqual((body["status"], body["timeMs"], body["splits"], body["splitCoverage"]), ("NS", 0, [], "unavailable"))
        self.assertFalse(body["sourceObservation"]["sourceTimePresent"])
        audit = prep.read(self.root / "run/record-audit.json")
        self.assertEqual(audit["teams"][0]["eligibleRows"], 0)

    def test_invalid_individual_row_does_not_discard_valid_relay(self):
        relay_raw, relay_cl, _ = fixtures.paired_fixture(gender="F", stroke="A")
        individual_raw, individual_cl = fixture(rows=[("F", "Y", " ", " BAD   ", " 1", "10252025")])
        # Separate source contexts in the same official archive; keep all original line positions.
        combined = individual_raw + b"\r\n".join(relay_raw.splitlines()[1:]) + b"\r\n"
        self.source(raw=(combined, individual_cl.replace(b"BAD", b" NS") + b"\r\n" + relay_cl.encode()))
        self.mappings["teams"][0]["sourceNames"] = ["Source Club", "Velocity Swimming"]
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 0)
        self.assertEqual(result["summary"]["relaysPrepared"], 1)

    def test_fresh_partial_counts_and_new_alias_races_force_repreparation(self):
        self.baseline.pop("collectionCounts")
        self.run_prep()
        self.baseline["collectionCounts"] = {k: len(self.baseline[k]) for k in prep.COLLECTIONS}
        prep.save(self.root / "fresh-complete.json", self.baseline)
        report = prep.preflight(self.root / "run/manifest.json", self.root / "fresh-complete.json")
        self.assertTrue(any("Preparation used" in b for b in report["blockers"]))
        self.run_prep("complete")
        parents = [w for w in self.writes("complete") if not w["path"].startswith("swims/")]
        for write in parents:
            root, rid = write["path"].split("/")
            self.baseline[root].append({"id": rid, "data": write["after"]})
        self.baseline["collectionCounts"] = {k: len(self.baseline[k]) for k in prep.COLLECTIONS}
        prep.save(self.root / "parents-approved.json", self.baseline)
        self.assertTrue(prep.preflight(self.root / "complete/manifest.json", self.root / "parents-approved.json", phase="races")["ready"])
        race = copy.deepcopy(next(w["after"] for w in self.writes("complete") if w["path"].startswith("swims/")))
        race["id"] = "new-alias-id"
        self.baseline["swims"].append({"id": race["id"], "data": race})
        self.baseline["collectionCounts"]["swims"] = 1
        prep.save(self.root / "race-added.json", self.baseline)
        report = prep.preflight(self.root / "complete/manifest.json", self.root / "race-added.json", phase="races")
        self.assertTrue(any("inventory changed" in b for b in report["blockers"]))
        self.baseline["collectionCounts"]["swims"] = 999
        self.assertFalse(prep.complete(self.baseline))

    def test_record_output_is_computed_local_inventory_with_no_official_site_comparison(self):
        self.run_prep()
        report = prep.read(self.root / "run/record-audit.json")
        self.assertEqual(report["kind"], "local_candidate_inventory")
        self.assertFalse(report["officialWebsiteComparison"]["performed"])
        self.assertFalse(report["historicalIesInventoryComplete"])
        self.assertTrue(report["teams"][0]["candidateRecords"])

    def test_mismatched_baseline_row_identity_is_rejected(self):
        self.baseline["athletes"] = [{"id": "one", "data": {"id": "two"}}]
        with self.assertRaisesRegex(ValueError, "identity disagree"):
            self.run_prep()

    def test_held_rows_cannot_poison_clean_prerequisite_proposals(self):
        self.source(sid="a-held", raw=fixture(member="", club="BAD", lsc="PN"))
        self.mappings["teams"].append({**self.mappings["teams"][0], "clubCode": "BAD", "lscCode": "PN", "name": "Held-only draft name"})
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 1)
        self.assertEqual(next(w["after"]["name"] for w in self.writes() if w["path"] == "teams/source-club"), "Source Club")

    def test_conflicting_clean_prerequisites_hold_all_affected_results(self):
        self.source(sid="conflict", raw=fixture(club="OTHER", lsc="PN", rows=[("F", "L", " ", "  61.00", " 2", "10252025")]))
        self.mappings["teams"].append({**self.mappings["teams"][0], "clubCode": "OTHER", "lscCode": "PN", "name": "Different canonical draft name"})
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 0)
        self.assertEqual(result["summary"]["prerequisites"], 0)

    def test_truncated_companion_id_cannot_validate_two_distinct_source_people(self):
        raw, cl = fixture(member="MEMBER000001AA", last="One")
        other, _ = fixture(member="MEMBER000001BB", last="Two")
        combined = raw + b"\r\n".join(other.splitlines()[3:]) + b"\r\n"
        self.source(raw=(combined, cl))
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 0)
        self.assertEqual(result["summary"]["reconciliation"]["source"]["heldIndividuals"], 2)

    def test_companion_category_disagreement_is_held(self):
        raw, cl = fixture()
        lines = cl.decode().splitlines()
        row = list(lines[-1]); row[65] = "M"; lines[-1] = "".join(row)
        self.source(raw=(raw, "\r\n".join(lines).encode()))
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 0)
        self.assertTrue(any("category disagrees" in h["reason"] for h in prep.read(self.root / "run/manual-review.json")))


    def test_whole_catalog_scope_keeps_all_940_meets_as_pending_receipts(self):
        self.baseline.update({"catalogComplete": True, "catalogCount": 940,
            "catalog": [{"id": "meet-" + str(i), "data": {"kind": "meet"}} for i in range(940)]})
        prep.save(self.root / "full.json", self.baseline)
        result = prep.catalog_scope(self.root / "full.json", self.root / "scope.json")
        self.assertEqual(result["meetCount"], 940)
        manifest = prep.read(self.root / "scope.json")
        self.assertEqual(len(manifest["selectedMeetIds"]), 940)
        self.assertTrue(all(s["receiptStatus"] == "pending" and s["available"] is False for s in manifest["sources"]))
        manifest["selectedMeetIds"].pop()
        self.manifest = manifest
        with self.assertRaises(ValueError): self.run_prep()

    def test_revision_change_blocks_even_when_exact_prerequisite_additions_match(self):
        self.run_prep()
        self.baseline["canonicalRevision"] = "2"
        self.baseline["consistency"]["revision"] = "2"
        prep.save(self.root / "new.json", self.baseline)
        result = prep.preflight(self.root / "run/manifest.json", self.root / "new.json")
        self.assertFalse(result["ready"])
        self.assertTrue(any("revision changed" in b for b in result["blockers"]))

    def test_exported_private_aliases_reuse_canonical_person_without_name_matching(self):
        self.baseline["athletes"] = [{"id": "canonical-person", "data": {"name": {"first": "First", "last": "Last"}}}]
        self.baseline["identityClaims"] = {"athletes": [{"data": {"namespace": "hytek-member", "sourceId": prep.digest("MEMBER000001"), "athleteId": "canonical-person"}}]}
        self.run_prep()
        races = [w["after"] for w in self.writes() if w["path"].startswith("swims/")]
        self.assertEqual(races[0]["athleteId"], "canonical-person")

    def test_non_object_legacy_provenance_is_reported_unknown_without_losing_clean_paired_sources(self):
        raw, cl, _ = fixtures.paired_fixture(gender="F", stroke="A")
        header = fixtures.hy3("B1", {2: "Synthetic Meet", 92: "10252025", 100: "10252025"})
        self.source(sid="relay", raw=(raw[:132] + header + b"\r\n" + raw[132:], cl.encode("cp1252")))
        self.mappings["teams"][0]["sourceNames"].append("Velocity Swimming")
        first = self.run_prep()
        self.assertEqual((first["summary"]["individualsPrepared"], first["summary"]["relaysPrepared"]), (1, 1))
        for write in self.writes():
            root, rid = write["path"].split("/")
            self.baseline[root].append({"id": rid, "data": copy.deepcopy(write["after"])})
        athlete = self.baseline["athletes"][0]
        self.mappings["identities"].append({"sourceMemberIdHash": prep.digest("MEMBER000001"), "athleteId": athlete["id"],
            "reviewed": True, "basis": "Reviewed stable member mapping independent of legacy provenance", "sourceUrl": "https://example.test/identity"})
        original_baseline = copy.deepcopy(self.baseline)
        for index, legacy_value in enumerate((None, [], [{"memberIdHash": prep.digest("MEMBER000001")}], "legacy", 12, True,
                {"url": ["legacy"], "line": 6}, {"url": "https://example.test/legacy", "line": 6, "archiveSha256": ["legacy"]})):
            with self.subTest(legacy_type=type(legacy_value).__name__, case=index):
                self.baseline = copy.deepcopy(original_baseline)
                unknown_paths = set()
                for root in prep.COLLECTIONS:
                    for row in self.baseline[root]:
                        if "sourceObservation" in row["data"]:
                            row["data"]["sourceObservation"] = copy.deepcopy(legacy_value)
                            unknown_paths.add(root + "/" + row["id"])
                result = self.run_prep("legacy-" + str(index))
                self.assertEqual((result["summary"]["batches"], result["summary"]["duplicateRows"]), (0, 2))
                report = prep.read(self.root / ("legacy-" + str(index)) / "baseline-identity-audit.json")
                self.assertFalse(report["mutationsPerformed"])
                self.assertEqual({row["path"] for row in report["unknownLegacyProvenance"]}, unknown_paths)
                self.assertEqual(report["stableMemberConflicts"], [])
                for root in prep.COLLECTIONS:
                    for row in self.baseline[root]:
                        if root + "/" + row["id"] in unknown_paths:
                            self.assertEqual(row["data"]["sourceObservation"], legacy_value)

    def test_paired_individual_import_keeps_legacy_verified_relay_leadoff_separate(self):
        # Generate the existing lead-off through the supported archive producer,
        # including its exact parent/member/timing review, before the new importer.
        archives = self.root / "relay-archives"
        archives.mkdir()
        raw, cl, members = fixtures.paired_fixture(gender="F", stroke="A")
        archive_path = archives / "relay.zip"
        with zipfile.ZipFile(archive_path, "w") as archive:
            archive.writestr("relay.hy3", raw)
            archive.writestr("relay.cl2", cl)
        prep.save(archives / "captures.json", [{"id": "meet", "available": True, "file": "relay.zip", "hy3": "relay.hy3",
            "sha256": prep.sha(archive_path.read_bytes()), "url": "https://example.test/relay.zip", "title": "Synthetic Meet"}])
        prep.save(archives / "baseline.json", {"meets": [{"id": "meet", "data": {"title": "Synthetic Meet", "startsOn": "2025-10-25", "endsOn": "2025-10-25", "sourceUrl": "https://example.test/meet"}}]})
        self.baseline["athletes"] = [{"id": "ath_" + str(leg), "data": {"id": "ath_" + str(leg),
            "name": {"first": "First" + str(leg), "last": "Last" + str(leg)},
            "sourceObservation": {"memberIdHash": prep.digest(member)}}} for leg, member in enumerate(members, 1)]
        self.baseline["teams"] = [{"id": "velocity-swimming", "data": {"id": "velocity-swimming", "lscCode": "IE", "clubCode": "VS"}}]
        self.mappings["teams"][0]["teamId"] = "velocity-swimming"
        prep.save(self.root / "relay-baseline.json", self.baseline)
        prep.save(self.root / "relay-identities.json", {"identityMappings": []})
        prep._relay_helper.prepare(archives, self.root / "relay-baseline.json", self.root / "relay-identities.json", self.root / "relay-draft")
        parent = prep.read(self.root / "relay-draft/relay-results.json")[0]
        prep.save(self.root / "lead-off-review.json", [{**fixtures.LeadOffTests().verification(),
            "relayResultId": parent["id"], "athleteId": "ath_1", "timeMs": 30000}])
        generated = prep._relay_helper.prepare(archives, self.root / "relay-baseline.json", self.root / "relay-identities.json",
            self.root / "relay-verified", self.root / "lead-off-review.json")
        self.assertEqual(generated["leadOffsPrepared"], 1)
        for batch_path in (self.root / "relay-verified/batches").glob("*.json"):
            for write in prep.read(batch_path)["writes"]:
                collection, rid = write["path"].split("/")
                body = copy.deepcopy(write["after"])
                if body.get("resultOrigin") == "relay_leadoff":
                    body.pop("raceIdentity")  # supported legacy, unclaimed lead-off
                self.baseline[collection].append({"id": rid, "data": body})
        original_lead_off = copy.deepcopy(self.baseline["swims"])
        self.source(raw=fixture(rows=[("F", "Y", " ", "  30.00", " 1", "10252025")], distance=50, first="First1", last="Last1"))
        result = self.run_prep()
        self.assertEqual((result["summary"]["individualsPrepared"], result["summary"]["duplicateRows"]), (1, 0))
        individual = next(w for w in self.writes() if w["path"].startswith("swims/"))
        self.assertNotIn("resultOrigin", individual["after"])
        self.assertEqual(self.baseline["swims"], original_lead_off)
        self.baseline["swims"].append({"id": individual["after"]["id"], "data": individual["after"]})
        repeat = self.run_prep("individual-repeat")
        self.assertEqual((repeat["summary"]["batches"], repeat["summary"]["duplicateRows"]), (0, 1))
        audit = prep.read(self.root / "individual-repeat/baseline-identity-audit.json")
        self.assertEqual(audit["unresolvedOccurrences"], [])

    def test_identical_cross_source_occurrences_prepare_once(self):
        self.source(sid="second")
        result = self.run_prep()
        self.assertEqual(result["summary"]["individualsPrepared"], 1)
        self.assertEqual(result["summary"]["duplicateRows"], 1)


if __name__ == "__main__":
    unittest.main()
