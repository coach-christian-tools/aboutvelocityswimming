"""Meaningful parser and review-boundary tests for historical meet collection."""
import importlib.util
import pathlib
import sys
import argparse
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/collection"))
import meet_catalog as catalog


def line(code, **fields):
    value = list(" " * 128)
    value[:len(code)] = code
    for offset, text in fields.items():
        start = int(offset)
        value[start:start + len(text)] = text
    return "".join(value)


def team(code="VS", name="Velocity Swimming", lsc="IE"):
    return line("C1", **{"2": code, "7": name, "53": lsc})


def result(kind="E2", flag=" ", time="  12.34"):
    return line(kind, **{"4": time, "11": "Y", "12": flag})


def checked(raw):
    checksum = (2 * sum(raw[1:128:2]) + sum(raw[:128:2])) // 21 + 205
    return raw + f"{checksum % 10}{checksum // 10 % 10}".encode()


class ParticipationTests(unittest.TestCase):
    def parse(self, rows, **kwargs):
        return catalog.extract_participation(rows, {"sourceUrl": "https://example.com/results.zip", "sha256": "abc", "member": "results.hy3"}, **kwargs)

    def test_team_context_and_entry_only_never_establish_attendance(self):
        self.assertEqual(self.parse([team()])["participants"], [])
        parsed = self.parse([team(), line("E1")])
        self.assertEqual(parsed["participants"][0]["basis"], "entered")
        self.assertEqual(parsed["participants"][0]["evidence"][0]["kind"], "individual_entry")

    def test_no_show_and_declared_false_start_are_entered(self):
        for flag in ("R", "F"):
            parsed = self.parse([team(), line("E1"), result(flag=flag)])
            self.assertEqual(parsed["participants"][0]["basis"], "entered")

    def test_individual_dq_dnf_and_relay_establish_recorded_participation(self):
        for kind, entry in (("E2", "E1"), ("F2", "F1")):
            for flag in (" ", "S", "Q", "D"):
                parsed = self.parse([team(), line(entry), result(kind, flag)])
                self.assertEqual(parsed["participants"][0]["basis"], "recorded")
                self.assertEqual(parsed["references"][-1]["line"], 3)
                self.assertNotIn("athlete", parsed["participants"][0])

    def test_invalid_status_zero_ok_and_orphan_results_do_not_confirm(self):
        for rows in ([team(), line("E1"), result(flag="X")],
                     [team(), line("E1"), result(time="   0.00")],
                     [team(), result()]):
            parsed = self.parse(rows)
            self.assertTrue(parsed["exceptions"])
            self.assertFalse(any(p["basis"] == "recorded" for p in parsed["participants"]))

    def test_school_and_unattached_representation_remain_distinct(self):
        for code, name, expected in (("UN", "Unattached", "unattached"), ("WHS", "Wenatchee High School", "school")):
            parsed = self.parse([team(code, name), line("E1"), result()])
            self.assertEqual(parsed["participants"][0]["representation"], expected)

    def test_source_supported_unattached_aliases_and_real_un_prefix_club(self):
        cases = (("UNSC", "Unattached-SC", "unattached"), ("UNTC", "Unattached-TC", "unattached"),
            ("UN-IE", "Spokane Waves Aquatic Team", "unattached"), ("UNIC", "United Swim Club", "club"))
        for code, name, expected in cases:
            with self.subTest(code=code):
                parsed = self.parse([team(code, name), line("E1"), result()])
                self.assertEqual(parsed["participants"][0]["representation"], expected)

    def test_only_reviewed_unique_date_ranged_mappings_are_used(self):
        mapping = {"clubCode": "VS", "lscCode": "IE", "sourceNames": ["Velocity Swimming"],
            "validFrom": "2025-01-01", "validThrough": "2025-12-31", "reviewed": True,
            "operationalTeamId": "velocity-swimming"}
        rows = [team(), line("E1"), result()]
        mapped = self.parse(rows, starts_on="2025-06-01", mappings=[mapping])["participants"][0]
        self.assertEqual(mapped["operationalTeamId"], "velocity-swimming")
        for mappings, date in (([mapping], "2024-06-01"), ([{**mapping, "reviewed": False}], "2025-06-01"), ([mapping, mapping], "2025-06-01")):
            self.assertNotIn("operationalTeamId", self.parse(rows, starts_on=date, mappings=mappings)["participants"][0])

    def test_checksum_verification_rejects_mutated_input(self):
        good = checked(line("A107").encode())
        self.assertEqual(len(catalog.verify_hy3(good)), 1)
        bad = b"A107X" + good[5:]
        with self.assertRaises(ValueError):
            catalog.verify_hy3(bad)

    def test_merging_preserves_approved_fields_and_is_idempotent(self):
        participant = self.parse([team(), line("E1"), result()])["participants"][0]
        before = {"title": "Reviewed title", "startsOn": "2025-06-01", "evidence": {"old": True}, "resultsStatus": "published"}
        proposal = {"title": "Source title", "participants": [participant], "evidence": {"capture": "new"}, "resultAcquisitionState": "downloaded"}
        after, conflicts = catalog.merge_meet(before, proposal)
        self.assertEqual(after["title"], "Reviewed title")
        self.assertEqual(after["evidence"], {"old": True, "capture": "new"})
        self.assertEqual(conflicts[0]["field"], "title")
        second, _ = catalog.merge_meet(after, proposal)
        self.assertEqual(second, after)


class DiscoveryTests(unittest.TestCase):
    def test_observed_dates_links_and_subset_coverage(self):
        text = "| 2/6/-2/7 2026 | School District Champs | Pool | 2/15/2026 | [Results](https://example.com/a.pdf) | [Hytek](https://example.com/a.zip)<br>VS \\| MRA |"
        proposals, exceptions = catalog.observed_proposals(text, "2026-10-12")
        self.assertFalse(exceptions)
        meet = proposals[0]["data"]
        self.assertEqual(meet["startsOn"], "2026-02-06")
        self.assertEqual(meet["endsOn"], "2026-02-07")
        self.assertEqual(meet["participationCoverage"], "unknown")
        self.assertEqual(meet["meetCategory"], "observed")

    def test_national_listing_does_not_imply_ies_ownership_or_attendance(self):
        event = {"id": {"value": 42}, "title": {"value": "**US OPEN"}, "startDate": {"displayValueISO": "2005-12-01"}, "endDate": {"displayValueISO": "2005-12-03"}}
        data = catalog.event_proposal(event, "2026-10-12")["data"]
        self.assertEqual(data["catalogScope"], "national_lead")
        self.assertNotIn("lscId", data)
        self.assertEqual(data["participants"], [])

    def test_cutoff_requires_completed_meet_and_cancellations_retained(self):
        event = {"id": {"value": 42}, "title": {"value": "2026 IE Canceled Meet"}, "startDate": {"displayValueISO": "2026-10-10"}, "endDate": {"displayValueISO": "2026-10-11"}}
        self.assertEqual(catalog.event_proposal(event, "2026-10-12")["data"]["status"], "canceled")
        event["endDate"]["displayValueISO"] = "2026-10-13"
        self.assertIsNone(catalog.event_proposal(event, "2026-10-12"))

    def test_other_meet_and_hotel_cancellations_do_not_cancel_this_meet(self):
        event = {"id": {"value": 42}, "title": {"value": "2019 IE Very Scary Invitational"}, "startDate": {"displayValueISO": "2019-10-25"}, "endDate": {"displayValueISO": "2019-10-26"}}
        for description in ("Due to the cancellation of the Harvest Open, this meet is open to IES teams.", "Hotel rooms may be cancelled at no charge."):
            event["meetDescription"] = {"value": description}
            self.assertEqual(catalog.event_proposal(event, "2026-10-12")["data"]["status"], "past")
        event["meetDescription"] = {"value": "This meet has been CANCELLED by the host."}
        self.assertEqual(catalog.event_proposal(event, "2026-10-12")["data"]["status"], "canceled")

    def test_eligibility_and_announcement_approval_are_not_meet_categories(self):
        event = {"id": {"value": 42}, "title": {"value": "2022 IE SC Junior Olympics"}, "startDate": {"displayValueISO": "2022-02-01"}, "endDate": {"displayValueISO": "2022-02-03"}}
        for description in ("Qualifying entry times achieved at USA Swimming sanctioned, approved, or observed competitions.", "Approved Meet Announcement and entry files have been posted below."):
            event["meetDescription"] = {"value": description}
            self.assertEqual(catalog.event_proposal(event, "2026-10-12")["data"]["meetCategory"], "unknown")
        for description in ("Sanction: NCAA observed", "Forms: observed", "This meet will be observed."):
            event["meetDescription"] = {"value": description}
            self.assertEqual(catalog.event_proposal(event, "2026-10-12")["data"]["meetCategory"], "observed")

    def test_national_title_takes_precedence_over_ies_travel_and_host_mentions(self):
        event = {"id": {"value": 42}, "title": {"value": "2022 WZ Senior Championships"}, "startDate": {"displayValueISO": "2022-07-01"}, "endDate": {"displayValueISO": "2022-07-03"}, "meetDescription": {"value": "The IES travel team will attend. Inland Empire Swimming is helping the host."}}
        data = catalog.event_proposal(event, "2026-10-12")["data"]
        self.assertEqual(data["catalogScope"], "national_lead")
        self.assertNotIn("lscId", data)
        event["title"]["value"] = "2022 IES SC Junior Olympics"
        self.assertEqual(catalog.event_proposal(event, "2026-10-12")["data"]["catalogScope"], "ies")

    def test_observed_external_lsc_and_cutoff_are_preserved(self):
        text = "| 1/10/2026 | 2026 Kentridge Invitational (PN Observed) | Federal Way | NA | | |"
        proposal = catalog.observed_proposals(text, "2026-10-12")[0][0]["data"]
        self.assertEqual(proposal["lscId"], "usa-lsc-pn")
        self.assertEqual(proposal["catalogScope"], "national_lead")
        ongoing = "| 10/11-10/13 2026 | School Championships | Pool | | | |"
        self.assertEqual(catalog.observed_proposals(ongoing, "2026-10-12")[0], [])

    def test_identity_aliases_require_corroboration_and_preserve_stable_ids(self):
        first = {"id": "stable", "data": {"title": "2025 IE Winter Open", "startsOn": "2025-01-01", "endsOn": "2025-01-02", "location": "Central Pool", "sourceUrl": "https://example.com/calendar"}}
        second = {"id": "new", "data": {**first["data"], "title": "2025 Winter Open", "sourceUrl": "https://example.com/results"}}
        resolved, _ = catalog.resolve_meet_aliases([first, second], {"stable": first["data"]})
        self.assertEqual(len(resolved), 1)
        self.assertEqual(resolved[0]["id"], "stable")
        self.assertEqual(resolved[0]["data"]["sourceAliases"][0]["sourceId"], "new")
        second["data"]["location"] = "Other Pool"
        self.assertEqual(len(catalog.resolve_meet_aliases([first, second])[0]), 2)
        second["data"]["location"] = "Central Pool"
        second["data"]["documents"] = [{"url": "https://example.com/result.zip"}]
        first["data"]["documents"] = [{"url": "https://example.com/result.zip"}]
        baseline_match = catalog.resolve_meet_aliases([second], {"stable": first["data"]})[0]
        self.assertEqual([p["id"] for p in baseline_match], ["stable"])

    def test_calendar_crosswalk_preserves_dates_and_never_adds_shared_documents(self):
        data = {"title": "Winter Invite", "startsOn": "2026-01-31", "endsOn": "2026-02-01", "sourceUrl": "https://example.com/archive", "documents": []}
        crosswalk = {"year": 2026, "sourceUrl": "https://example.com/calendar.pdf", "sha256": "abc", "rows": [{"meetId": "stable", "sourceId": "calendar-2026-row1", "label": "Winter Invite", "line": 1, "sourceRow": "24-25 Winter Invite", "calendarDates": {"startsOn": "2026-01-24", "endsOn": "2026-01-25"}}]}
        check = catalog.reconcile_calendar([{"id": "stable", "data": data}], crosswalk)
        self.assertEqual(check["matchedArchivedMeets"], 1)
        self.assertEqual(check["status"], "partial")
        self.assertEqual(data["startsOn"], "2026-01-31")
        self.assertEqual(data["documents"], [])
        self.assertEqual(data["catalogConflicts"][0]["field"], "calendarDates")


class AssistedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("collect_meets", ROOT / "scripts/collection/collect-meets.py")
        cls.cli = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.cli)

    def test_selected_export_orders_priorities_and_never_prepares_unselected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            baseline = root / "baseline.json"
            selected = root / "selected.json"
            data = {"kind": "meet", "title": "Meet", "startsOn": "2025-01-01", "endsOn": "2025-01-01", "sourceUrl": "https://example.com/meet", "documents": []}
            catalog.write_json(baseline, {"meets": [{"id": "unselected", "data": data}], "timesMeets": []})
            catalog.write_json(selected, {"rows": [{"id": "lower", "data": data, "selected": True, "priority": 1}, {"id": "higher", "data": data, "selected": True, "priority": 99}]})
            args = argparse.Namespace(output=root / "out", baseline=baseline, selected=selected, captures=None, mappings=None, scopes=None, cutoff="2026-10-12", refresh=False)
            self.cli.assisted(args)
            request = catalog.read_json(args.output / "assisted-run.json")
            self.assertEqual(request["selectedMeetIds"], ["lower", "higher"])
            summary = catalog.read_json(args.output / "summary.json")
            batches = [catalog.read_json(pathlib.Path(p)) for p in summary["batches"]]
            self.assertEqual({write["path"] for batch in batches for write in batch["writes"]}, {"knowledge_entries/lower", "knowledge_entries/higher"})
            self.assertTrue(all(read["before"] is None for batch in batches for read in batch["reads"]))

    def test_unselected_input_is_rejected_before_collection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            catalog.write_json(root / "selected.json", {"rows": [{"id": "unselected", "selected": False}]})
            with self.assertRaises(ValueError):
                self.cli.assisted(argparse.Namespace(selected=root / "selected.json", output=root / "out"))


if __name__ == "__main__":
    unittest.main()
