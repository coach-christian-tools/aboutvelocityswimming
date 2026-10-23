"""Run with: python3 tests/swim-resources/test_hytek_relays.py"""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/swim-resources/lib"))
import hytek_relays as hytek

spec = importlib.util.spec_from_file_location("prepare_ies_relays", ROOT / "scripts/swim-resources/prepare-ies-relays.py")
prepare_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare_module)


def fixed(length, code, fields):
    chars = list(code + " " * (length - len(code)))
    for start, value in fields.items():
        chars[start:start + len(value)] = list(value)
    return "".join(chars)


def hy3(code, fields):
    content = fixed(128, code, fields).encode("cp1252")
    checksum = (2 * sum(content[1::2]) + sum(content[::2])) // 21 + 205
    return content + f"{checksum % 10}{checksum // 10 % 10}".encode()


def paired_fixture(gender="X", stroke="E", round_name="F", missing=(), markers=(1, 2, 3, 4)):
    members = [f"MEMBER00000{leg}" for leg in range(1, 5)]
    h = [hy3("A107", {}), hy3("C1", {2: "VS", 7: "Velocity Swimming", 53: "IE"})]
    for leg, member in enumerate(members, 1):
        h.append(hy3("D1", {2: "F" if leg % 2 else "M", 3: str(leg).rjust(5), 8: f"Last{leg}", 28: f"First{leg}", 69: member, 88: "01012010"}))
    h += [hy3("F1", {2: "VS", 7: "A", 12: gender, 15: "   200", 21: stroke, 22: "  0", 25: " 12", 38: "  8B"}),
          hy3("F2", {2: round_name, 4: " 120.00", 11: "Y", 102: "10252025"})]
    groups = {2 + i * 11: f"{round_name}{markers[i]:2d}{'0.00' if i in missing else str((i + 1) * 30) + '.00':>8}" for i in range(4)}
    h.append(hy3("G1", groups))
    h.append(hy3("F3", {2 + i * 13: f"{'F' if (i + 1) % 2 else 'M'}{i + 1:5d}{'Last' + str(i + 1):5}{round_name}{i + 1}" for i in range(4)}))
    result_offset = {"P": 54, "S": 63, "F": 72}[round_name]
    cl = [fixed(160, "A0", {}), fixed(160, "C1", {11: "IEVS", 17: "Velocity Swimming"}),
          fixed(160, "E0", {11: "A", 12: "IEVS", 20: gender, 21: " 200", 25: "7" if stroke == "E" else "6", 26: "  8B", 30: "UN12", 37: "10252025", result_offset: " 2:00.00Y", 85: " 1 2"})]
    for i, member in enumerate(members):
        sex = "F" if (i + 1) % 2 else "M"
        cl.append(fixed(160, "F0", {15: "IEVS", 21: "A", 22: f"Last{i + 1}, First{i + 1}", 50: member, 75: sex, {"P": 76, "S": 77, "F": 78}[round_name]: str(i + 1)}))
        cl.append(fixed(160, "G0", {43: member, 55: "1", 56: " 4", 58: "  50", 62: "C", 63: "" if i in missing else hytek.display((i + 1) * 30000).rjust(8), 143: round_name}))
    return b"\r\n".join(h) + b"\r\n", "\r\n".join(cl), members


class SplitValidationTests(unittest.TestCase):
    def read(self, **kwargs):
        raw, cl, _ = paired_fixture(**kwargs)
        h = hytek.parse_hy3(hytek.verify_hy3(raw))
        companion = hytek.parse_cl2(cl.splitlines())
        relay = h["relays"][0]
        match, error = hytek.match_companion(relay, hytek.cl2_index(companion, True), True)
        self.assertIsNone(error)
        return h, relay, match

    def test_integer_hundredths(self):
        self.assertEqual(hytek.time_ms("1:02.37"), 62370)
        self.assertEqual(hytek.time_ms("167.29"), 167290)
        for value in ("8.329998", "12.3", "1:60.00", "-1.00", "DQ"):
            with self.assertRaises(ValueError):
                hytek.time_ms(value)

    def test_corrupt_archive_checksum_rejected(self):
        raw, _, _ = paired_fixture()
        broken = bytearray(raw)
        broken[11] = ord("Z")
        with self.assertRaisesRegex(ValueError, "checksum"):
            hytek.verify_hy3(bytes(broken))

    def test_marker_units_are_never_guessed(self):
        for markers in ((1, 2, 3, 4), (2, 4, 6, 8), (3, 5, 7, 9)):
            _, relay, companion = self.read(markers=markers)
            splits, coverage, errors = hytek.verified_splits(relay, companion, True)
            self.assertFalse(errors)
            self.assertEqual(coverage, "complete")
            self.assertEqual([s["distance"] for s in splits], [50, 100, 150, 200])
            self.assertEqual([s["lapMs"] for s in splits], [30000] * 4)

    def test_missing_interior_split_does_not_shift_later_distance(self):
        _, relay, companion = self.read(missing=(1,))
        splits, coverage, errors = hytek.verified_splits(relay, companion, True)
        self.assertFalse(errors)
        self.assertEqual(coverage, "partial")
        self.assertEqual([s["distance"] for s in splits], [50, 150, 200])
        self.assertNotIn("lapMs", splits[1])
        self.assertEqual(splits[2]["lapMs"], 30000)

    def test_agreeing_values_at_wrong_distance_are_held(self):
        _, relay, companion = self.read()
        companion["splitRecords"][-1]["member"]["orders"]["F"] = "3"
        splits, coverage, errors = hytek.verified_splits(relay, companion, True)
        self.assertEqual((splits, coverage), ([], "unavailable"))
        self.assertTrue(errors)

    def test_unordered_or_conflicting_cumulative_times_are_held(self):
        _, relay, companion = self.read()
        companion["splitRecords"][1]["values"][0] = 20000
        relay["hy3Splits"][1]["timeMs"] = 20000
        splits, coverage, errors = hytek.verified_splits(relay, companion, True)
        self.assertEqual((splits, coverage), ([], "unavailable"))
        self.assertIn("Non-increasing cumulative split times", errors)

    def test_missing_f0_boundary_never_derives_leg(self):
        _, relay, companion = self.read()
        companion["splitRecords"][1]["member"] = None
        self.assertEqual(hytek.verified_splits(relay, companion, True)[1], "unavailable")

    def test_dq_split_evidence_cannot_claim_complete_official_time(self):
        _, relay, companion = self.read()
        relay.update({"status": "DQ", "timeMs": 0})
        splits, coverage, errors = hytek.verified_splits(relay, companion, True)
        self.assertFalse(errors)
        self.assertEqual(len(splits), 4)
        self.assertEqual(coverage, "partial")

    def test_total_disagreement_and_ambiguous_matches_are_held(self):
        _, relay, companion = self.read()
        index = hytek.cl2_index({"relays": [companion]}, True)
        relay["timeMs"] += 10
        self.assertIsNone(hytek.match_companion(relay, index, True)[0])
        relay["timeMs"] -= 10
        index[hytek.result_key(relay, True)] *= 2
        self.assertIsNone(hytek.match_companion(relay, index, True)[0])

    def test_individual_long_race_sequences_and_zero_slots(self):
        result = {"distance": 1500, "round": "F", "sourceTimeMs": 1500000,
                  "hy3Splits": [{"timeMs": index * 100000} for index in range(1, 16) if index != 12]}
        companion = {"splitRecords": [{"sequence": 1, "count": 15, "increment": 100, "type": "C", "round": "F", "values": [index * 100000 for index in range(1, 11)]},
                                       {"sequence": 2, "count": 15, "increment": 100, "type": "C", "round": "F", "values": [1100000, 0, 1300000, 1400000, 1500000, 0, 0, 0, 0, 0]}]}
        splits, coverage, errors = hytek.verified_splits(result, companion, False)
        self.assertFalse(errors)
        self.assertEqual(coverage, "partial")
        self.assertEqual(splits[-1]["distance"], 1500)
        self.assertNotIn("lapMs", next(s for s in splits if s["distance"] == 1300))

    def test_freestyle_medley_mixed_and_rounds(self):
        for gender, stroke, round_name in (("F", "A", "F"), ("M", "E", "P"), ("X", "E", "F")):
            h, relay, companion = self.read(gender=gender, stroke=stroke, round_name=round_name)
            identity = {hytek.digest(a["member"]): f"ath_{a['number']}" for a in h["athletes"].values()}
            members, errors = prepare_module.member_lineup(relay, companion, h["athletes"], identity, {value: {} for value in identity.values()})
            self.assertFalse(errors)
            self.assertEqual([member["leg"] for member in members], [1, 2, 3, 4])
            self.assertEqual([member["stroke"] for member in members], ["FR"] * 4 if stroke == "A" else ["BK", "BR", "FL", "FR"])
            self.assertTrue(all(not member["leadOffEligible"] for member in members))

    def test_missing_or_disagreeing_members_do_not_own_team_total(self):
        h, relay, companion = self.read()
        companion["members"][1]["member"] = "SOMEONEELSE"
        members, errors = prepare_module.member_lineup(relay, companion, h["athletes"], {}, {})
        self.assertEqual([member["leg"] for member in members], [1, 3, 4])
        self.assertTrue(errors)
        self.assertTrue(all("athleteId" not in member for member in members))


class LeadOffTests(unittest.TestCase):
    def relay(self):
        return {"id": "relay_1", "teamId": "team", "distance": 200, "course": "SCY", "round": "F", "status": "DQ",
                "members": [{"leg": 1, "athleteId": "athlete", "name": "First Last", "gender": "F", "stroke": "BK", "timeMs": 29270}],
                "splits": [{"distance": 50, "cumulativeMs": 29270}], "meet": {"id": "meet", "date": "2026-02-28", "name": "Meet"},
                "sourceObservation": {"memberNames": {"1": {"first": "First", "last": "Last"}}, "memberAges": {"1": 15}}}

    def verification(self):
        return {"verified": True, "flatStart": True, "timingVerified": True, "leadOffStatus": "OK", "sourceUrl": "https://official.example/results.pdf", "relayResultId": "relay_1", "athleteId": "athlete", "timeMs": 29270, "reportPage": 27}

    def test_later_teammate_dq_preserves_explicitly_verified_valid_leadoff(self):
        swim, reason = prepare_module.verified_leadoff(self.relay(), self.verification(), set())
        self.assertIsNone(reason)
        self.assertEqual(swim["status"], "OK")
        self.assertEqual(swim["ageAtSwim"], 15)
        self.assertEqual(swim["ageGroup"], "15-16")
        self.assertEqual(swim["eventCode"], "50_BK_SCY")
        self.assertFalse(swim["isRelay"])
        self.assertEqual(swim["parentRelayResultId"], "relay_1")
        self.assertEqual(len(swim["leadOffVerification"]), 5)
        self.assertEqual(swim["sourceObservation"]["leadOffVerificationEvidence"]["reportPage"], 27)
        self.assertEqual(swim["raceIdentity"], {
            "occurrence": "relay_leadoff:" + hytek.digest("relay_1|athlete"),
            "reviewed": True,
            "basis": "Separately reviewed exact parent relay, linked first member, flat start, official timing and OK lead-off status; paired first-leg cumulative boundary",
            "sourceUrl": self.verification()["sourceUrl"],
        })

    def test_first_leg_alone_does_not_imply_eligibility(self):
        for key, value in (("timingVerified", False), ("flatStart", False), ("leadOffStatus", "DQ")):
            verification = self.verification()
            verification[key] = value
            self.assertIsNone(prepare_module.verified_leadoff(self.relay(), verification, set())[0])

    def test_exact_parent_member_and_time_verification_required(self):
        for key, value in (("relayResultId", "other"), ("athleteId", "other"), ("timeMs", 29280)):
            verification = self.verification()
            verification[key] = value
            self.assertIsNone(prepare_module.verified_leadoff(self.relay(), verification, set())[0])

    def test_repeat_leadoff_does_not_duplicate(self):
        known = set()
        swim, _ = prepare_module.verified_leadoff(self.relay(), self.verification(), known)
        self.assertIn(prepare_module.fingerprint(swim), known)
        repeated, reason = prepare_module.verified_leadoff(self.relay(), self.verification(), known)
        self.assertIsNone(repeated)
        self.assertEqual(reason, "Exact eligible individual performance already exists")

    def test_equal_time_individual_final_and_different_parent_starts_remain_distinct(self):
        individual = {"athleteId": "athlete", "eventCode": "50_BK_SCY", "round": "F", "status": "OK",
                      "timeMs": 29270, "meet": {"id": "meet", "date": "2026-02-28"}}
        original = copy.deepcopy(individual)
        known = {prepare_module.fingerprint(individual)}
        first, reason = prepare_module.verified_leadoff(self.relay(), self.verification(), known)
        self.assertIsNone(reason)
        self.assertIsNotNone(first)
        relay, verification = self.relay(), self.verification()
        relay["id"] = verification["relayResultId"] = "relay_2"
        second, reason = prepare_module.verified_leadoff(relay, verification, known)
        self.assertIsNone(reason)
        self.assertNotEqual(first["id"], second["id"])
        self.assertNotEqual(first["raceIdentity"]["occurrence"], second["raceIdentity"]["occurrence"])
        self.assertEqual(len(known), 3)
        self.assertEqual(individual, original)

    def test_occurrence_identity_uses_parent_start_and_member_not_time(self):
        first, _ = prepare_module.verified_leadoff(self.relay(), self.verification(), set())
        relay, verification = self.relay(), self.verification()
        relay["members"][0]["timeMs"] = relay["splits"][0]["cumulativeMs"] = verification["timeMs"] = 29280
        corrected, reason = prepare_module.verified_leadoff(relay, verification, set())
        self.assertIsNone(reason)
        self.assertEqual(first["id"], corrected["id"])
        self.assertEqual(first["raceIdentity"], corrected["raceIdentity"])

    def test_held_age_validation_does_not_reserve_duplicate_fingerprint(self):
        relay = self.relay()
        del relay["sourceObservation"]["memberAges"]
        known = set()
        swim, reason = prepare_module.verified_leadoff(relay, self.verification(), known)
        self.assertIsNone(swim)
        self.assertEqual(reason, "Lead-off exact race-day age unavailable")
        self.assertFalse(known)


class ReviewArtifactsTests(unittest.TestCase):
    def test_preparation_is_duplicate_safe_private_and_non_mutating(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archives, output = root / "archives", root / "output"
            archives.mkdir()
            raw, cl, members = paired_fixture()
            path = archives / "meet.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("meet.hy3", raw)
                archive.writestr("meet.cl2", cl)
            source_sha = hashlib.sha256(path.read_bytes()).hexdigest()
            (archives / "captures.json").write_text(json.dumps([{"id": "meet", "available": True, "file": "meet.zip", "hy3": "meet.hy3", "sha256": source_sha, "url": "https://official.example/meet.zip", "title": "Meet"}]))
            (archives / "baseline.json").write_text(json.dumps({"meets": [{"id": "meet", "data": {"title": "Meet", "startsOn": "2025-10-25", "endsOn": "2025-10-26", "sourceUrl": "https://official.example/meet"}}]}))
            current = {"capturedAt": "2026-10-13T00:00:00Z", "athletes": [{"id": f"ath_{leg}", "data": {"id": f"ath_{leg}", "sourceObservation": {"memberIdHash": hytek.digest(member)}}} for leg, member in enumerate(members, 1)],
                       "swims": [], "meets": [{"id": "meet", "data": {"id": "meet", "name": "Meet"}}], "teams": [{"id": "velocity-swimming", "data": {"id": "velocity-swimming", "lscCode": "IE", "clubCode": "VS"}}], "relay_results": []}
            baseline = root / "baseline.json"
            baseline.write_text(json.dumps(current))
            manifest = root / "identity.json"
            manifest.write_text(json.dumps({"identityMappings": []}))
            summary = prepare_module.prepare(archives, baseline, manifest, output)
            self.assertEqual(summary["relaysPrepared"], 1)
            proposed = json.loads((output / "relay-results.json").read_text())[0]
            self.assertEqual(proposed["gender"], "X")
            self.assertEqual(proposed["ageGroup"], "12 & Under")
            self.assertNotIn("athleteId", proposed)
            text = (output / "batches/0001.json").read_text()
            self.assertTrue(all(member not in text for member in members))
            self.assertNotIn("01012010", text)
            self.assertEqual(json.loads(text)["reads"], [{"path": "relay_results/" + proposed["id"], "before": None}])
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), source_sha)
            first_id = proposed["id"]
            current["relay_results"] = [{"id": first_id, "data": proposed}]
            baseline.write_text(json.dumps(current))
            second = prepare_module.prepare(archives, baseline, manifest, output)
            self.assertEqual(second["relaysPrepared"], 0)
            self.assertEqual(second["coverage"]["duplicatesSkipped"], 1)

            # Simulate publishing a separately verified lead-off, then repeat
            # against a fresh snapshot. Existing eligibility must remain on the
            # parent instead of producing a spurious changed-relay hold.
            current["relay_results"] = []
            individual_final = {"id": "already-published-individual-final", "athleteId": "ath_1", "teamId": "velocity-swimming",
                                "eventCode": "50_BK_SCY", "round": "F", "status": "OK", "timeMs": 30000,
                                "meet": {"id": "meet", "date": "2025-10-25", "name": "Meet"}}
            current["swims"] = [{"id": individual_final["id"], "data": copy.deepcopy(individual_final)}]
            baseline.write_text(json.dumps(current))
            before_verification = baseline.read_bytes()
            verification = root / "verification.json"
            verification.write_text(json.dumps([{**LeadOffTests().verification(), "relayResultId": first_id, "athleteId": "ath_1", "timeMs": 30000}]))
            verified_output = root / "verified-output"
            verified_summary = prepare_module.prepare(archives, baseline, manifest, verified_output, verification)
            self.assertEqual(verified_summary["leadOffsPrepared"], 1)
            self.assertEqual(baseline.read_bytes(), before_verification)
            self.assertEqual(current["swims"], [{"id": individual_final["id"], "data": individual_final}])
            lead_offs = []
            for batch_path in (verified_output / "batches").glob("*.json"):
                for write in json.loads(batch_path.read_text())["writes"]:
                    self.assertNotEqual(write["path"], "swims/" + individual_final["id"])
                    if write["after"].get("resultOrigin") == "relay_leadoff":
                        lead_offs.append(write["after"])
                    collection, record_id = write["path"].split("/")
                    current[collection].append({"id": record_id, "data": write["after"]})
            self.assertEqual(len(lead_offs), 1)
            self.assertEqual(lead_offs[0]["raceIdentity"]["occurrence"], "relay_leadoff:" + hytek.digest(first_id + "|ath_1"))
            current["capturedAt"] = "2026-10-13T20:00:00Z"
            baseline.write_text(json.dumps(current))
            repeated_output = root / "repeated-output"
            repeated = prepare_module.prepare(archives, baseline, manifest, repeated_output, verification)
            self.assertEqual((repeated["relaysPrepared"], repeated["individualSplitUpdates"], repeated["leadOffsPrepared"], repeated["batches"]), (0, 0, 0, 0))
            self.assertEqual(repeated["coverage"]["verifiedLeadOffsAlreadyPublished"], 1)
            self.assertNotIn("Existing relay differs; preserve published data for reconciliation", repeated["holdReasons"])
            self.assertNotIn("Exact eligible individual performance already exists", repeated["holdReasons"])


if __name__ == "__main__":
    unittest.main()
