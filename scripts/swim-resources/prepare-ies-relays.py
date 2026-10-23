#!/usr/bin/env python3
"""Prepare reviewed relay/split additions from saved official paired archives.

This command only writes local review artifacts. It never connects to a database,
stages batches, approves records, or modifies the original individual import.
See ``--help`` for input contracts; output belongs in the gitignored backups tree.
"""
from __future__ import annotations

import argparse
import collections
import copy
import datetime
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent / "lib"))
from hytek_relays import cl2_index, digest, display, match_companion, read_archive, verified_splits


def records(items: list[dict]) -> dict:
    return {row.get("id", row.get("path", "").split("/")[-1]): row.get("data", row) for row in items}


def age_label(minimum: int, maximum: int) -> str:
    if maximum >= 99:
        return f"{minimum} & Over" if minimum else "Open"
    return f"{maximum} & Under" if minimum == 0 else f"{minimum}-{maximum}"


def source_name(athlete: dict) -> str:
    return f"{athlete['preferred'] or athlete['first']} {athlete['last']}".strip()


def member_lineup(result: dict, companion: dict, local_athletes: dict, identity: dict, current_athletes: dict) -> tuple[list[dict], list[str]]:
    members, problems = [], []
    by_leg = collections.defaultdict(list)
    for member in result["hy3Members"]:
        by_leg[member["leg"]].append(member)
    cl_members = collections.defaultdict(list)
    for member in companion["members"]:
        order = member["orders"].get(result["round"])
        if order in ("1", "2", "3", "4"):
            cl_members[int(order)].append(member)
    team = result["team"]
    for leg in range(1, 5):
        if len(by_leg[leg]) != 1 or len(cl_members[leg]) != 1:
            problems.append(f"Leg {leg} has missing or ambiguous paired lineup")
            continue
        local, other = by_leg[leg][0], cl_members[leg][0]
        athlete = local_athletes.get((team["lscCode"], team["clubCode"], local["number"], local["gender"]))
        if not athlete or not athlete["member"] or athlete["member"][:12] != other["member"] or athlete["gender"] != other["gender"]:
            problems.append(f"Leg {leg} local D1 identity disagrees with companion F0")
            continue
        stroke = "FR" if result["stroke"] == "FR" else ("BK", "BR", "FL", "FR")[leg - 1]
        member = {"leg": leg, "name": source_name(athlete), "gender": athlete["gender"], "stroke": stroke,
                  "leadOffEligible": False}
        athlete_id = identity.get(digest(athlete["member"]))
        if athlete_id in current_athletes:
            member["athleteId"] = athlete_id
        else:
            problems.append(f"Leg {leg} stable source identity lacks a current profile link")
        members.append(member)
    return members, problems


def fingerprint(swim: dict) -> tuple:
    # A relay lead-off is a separately verified start. Equal individual-final
    # times do not identify it, and different parent relays cannot share it.
    lead_off = swim.get("resultOrigin") == "relay_leadoff"
    return (swim.get("athleteId"), swim.get("meet", {}).get("id"), swim.get("meet", {}).get("date"),
            swim.get("eventCode"), swim.get("round"), swim.get("status"), swim.get("timeMs", 0),
            "relay_leadoff" if lead_off else "individual", swim.get("parentRelayResultId") if lead_off else None)


def same_source_performance(swim: dict, result: dict, meet_id: str) -> bool:
    return (swim.get("meet", {}).get("id") == meet_id
            and swim.get("meet", {}).get("date") == result["date"]
            and swim.get("eventCode") == f"{result['distance']}_{result['stroke']}_{result['course']}"
            and swim.get("round") == result["round"] and swim.get("status") == result["status"]
            and swim.get("timeMs", 0) == result["timeMs"])


def verified_leadoff(relay: dict, verification: dict, existing: set[tuple]) -> tuple[dict | None, str | None]:
    """Only a separately reviewed exact relay/member/boundary verification qualifies."""
    checks = ("verified", "flatStart", "timingVerified")
    if not all(verification.get(key) is True for key in checks) or verification.get("leadOffStatus") != "OK" or not verification.get("sourceUrl"):
        return None, "Lead-off lacks separately verified flat start, timing or OK status"
    first = next((member for member in relay["members"] if member["leg"] == 1), None)
    if not first or not first.get("athleteId") or relay["distance"] % 4:
        return None, "Lead-off lacks a linked first member or verified equal leg distance"
    boundary = next((split for split in relay["splits"] if split["distance"] == relay["distance"] // 4), None)
    if not boundary or not first.get("timeMs") or boundary["cumulativeMs"] != first["timeMs"]:
        return None, "Lead-off first-leg cumulative boundary unavailable"
    if (verification.get("athleteId") != first["athleteId"] or verification.get("timeMs") != first["timeMs"]
            or verification.get("relayResultId") != relay["id"]):
        return None, "Lead-off verification does not match exact relay member and time"
    # An overall DQ neither proves nor disproves first-leg validity. Explicit
    # first-leg OK evidence remains required by the checks above in either case.
    event = f"{relay['distance'] // 4}_{first['stroke']}_{relay['course']}"
    athlete_name = relay.get("sourceObservation", {}).get("memberNames", {}).get("1")
    if not athlete_name:
        return None, "Lead-off exact source first and last names unavailable"
    individual = {"id": "relay_leadoff_" + digest(relay["id"] + "|" + first["athleteId"]),
        "athleteId": first["athleteId"], "athleteName": copy.deepcopy(athlete_name),
        "teamId": relay["teamId"], "gender": first["gender"], "distance": relay["distance"] // 4,
        "stroke": first["stroke"], "course": relay["course"], "eventCode": event, "round": relay["round"],
        "status": "OK", "timeMs": first["timeMs"], "timeDisplay": display(first["timeMs"]),
        "isRelay": False, "isOfficial": True, "meet": copy.deepcopy(relay["meet"]),
        "resultOrigin": "relay_leadoff", "parentRelayResultId": relay["id"],
        "raceIdentity": {"occurrence": "relay_leadoff:" + digest(relay["id"] + "|" + first["athleteId"]),
            "reviewed": True,
            "basis": "Separately reviewed exact parent relay, linked first member, flat start, official timing and OK lead-off status; paired first-leg cumulative boundary",
            "sourceUrl": verification["sourceUrl"]},
        "leadOffVerification": {key: verification[key] for key in ("verified", "flatStart", "timingVerified", "leadOffStatus", "sourceUrl")},
        "sourceObservation": {**copy.deepcopy(relay["sourceObservation"]), "leadOffVerificationEvidence": copy.deepcopy(verification)}}
    exact_age = relay.get("sourceObservation", {}).get("memberAges", {}).get("1")
    if exact_age is not None:
        individual["ageAtSwim"] = exact_age
        individual["ageGroup"] = ("8&U" if exact_age <= 8 else "9-10" if exact_age <= 10 else "11-12" if exact_age <= 12
                                   else "13-14" if exact_age <= 14 else "15-16" if exact_age <= 16 else "17-18" if exact_age <= 18 else "Open")
    else:
        return None, "Lead-off exact race-day age unavailable"
    individual["metadata"] = {"source": "official_relay_leadoff", "createdAt": relay.get("metadata", {}).get("createdAt")}
    key = fingerprint(individual)
    if key in existing:
        return None, "Exact eligible individual performance already exists"
    existing.add(key)
    return individual, None


def prepare(archive_dir: Path, baseline_path: Path, identity_manifest: Path, output: Path, verification_path: Path | None = None) -> dict:
    baseline = json.loads(baseline_path.read_text())
    if not baseline.get("capturedAt"):
        raise ValueError("A freshly captured current baseline with capturedAt is required")
    athletes, swims, meets, teams, relays = (records(baseline.get(key, [])) for key in ("athletes", "swims", "meets", "teams", "relay_results"))
    knowledge = records(json.loads((archive_dir / "baseline.json").read_text())["meets"])
    captures = json.loads((archive_dir / "captures.json").read_text())
    identity = {row["sourceMemberIdHash"]: row["athleteId"] for row in json.loads(identity_manifest.read_text())["identityMappings"] if row["athleteId"] in athletes}
    for athlete_id, athlete in athletes.items():
        member_hash = athlete.get("sourceObservation", {}).get("memberIdHash")
        if member_hash:
            if member_hash in identity and identity[member_hash] != athlete_id:
                raise ValueError("Current and prior stable member identity disagree")
            identity[member_hash] = athlete_id
    team_ids = {(team.get("lscCode"), team.get("clubCode")): team_id for team_id, team in teams.items()}
    team_ids[("IE", "VS")] = "velocity-swimming"
    now = baseline["capturedAt"]  # Deterministic repeated preparation against the same snapshot.
    verifications = {}
    if verification_path:
        for verification in json.loads(verification_path.read_text()):
            if verification["relayResultId"] in verifications:
                raise ValueError("Duplicate exact lead-off verification")
            verifications[verification["relayResultId"]] = verification
    source_rows = {(swim.get("sourceObservation", {}).get("url"), swim.get("sourceObservation", {}).get("line")): swim for swim in swims.values()}
    known_fingerprints = {fingerprint(swim) for swim in swims.values()}
    prepared_fingerprints = set(known_fingerprints)
    result_writes, split_writes, lead_writes, dependencies = [], [], [], {}
    holds, per_meet, seen = [], [], {}
    counts = collections.Counter()
    all_snapshots = {f"{root}/{record_id}": data for root, data_map in (("athletes", athletes), ("swims", swims), ("meets", meets), ("teams", teams), ("relay_results", relays)) for record_id, data in data_map.items()}

    # Many official exports intentionally omit DOB. A previously observed DOB
    # can establish race-day age only through the same stable source identity,
    # and only if all retained observations agree. It never enters output.
    archive_cache, birth_dates, birth_evidence = {}, collections.defaultdict(set), {}
    for capture in captures:
        if not capture.get("available"):
            continue
        path = archive_dir / capture["file"]
        import hashlib
        if hashlib.sha256(path.read_bytes()).hexdigest() != capture["sha256"]:
            raise ValueError(f"Saved archive hash changed: {capture['id']}")
        archive_cache[capture["id"]] = read_archive(path, capture.get("hy3"))
        for source_athlete in archive_cache[capture["id"]][0]["athletes"].values():
            if source_athlete["member"] and source_athlete["birthDate"]:
                member_hash = digest(source_athlete["member"])
                birth_dates[member_hash].add(source_athlete["birthDate"])
                birth_evidence[member_hash] = {"sourceUrl": capture["url"], "archiveSha256": capture["sha256"]}

    for capture in captures:
        if not capture.get("available"):
            continue
        hy3, cl2, cl2_name = archive_cache[capture["id"]]
        relay_index, individual_index = cl2_index(cl2, True), cl2_index(cl2, False)
        metadata = knowledge[capture["id"]]
        tally = collections.Counter()

        # Bind alternate source identities only from an already published exact
        # source result row, never a name-only match.
        for source_result in hy3["individuals"]:
            existing_swim = source_rows.get((capture["url"], source_result["line"]))
            if existing_swim and source_result["athlete"]["member"] and same_source_performance(existing_swim, source_result, capture["id"]):
                member_hash = digest(source_result["athlete"]["member"])
                athlete_id = existing_swim["athleteId"]
                if member_hash in identity and identity[member_hash] != athlete_id:
                    raise ValueError("Published exact source row conflicts with stable identity")
                identity[member_hash] = athlete_id

        for result in hy3["relays"]:
            tally["candidateTotals"] += 1
            reason = None
            if result["course"] is None or result["stroke"] not in ("FR", "IM") or result["gender"] not in ("F", "M", "X") or result["round"] not in ("P", "S", "F"):
                reason = "Missing or unsupported relay event course, stroke, gender or round"
            elif result["status"] not in ("OK", "DQ", "NS", "DFS") or (result["status"] == "OK" and result["timeMs"] <= 0):
                reason = "Missing relay total or unsupported status"
            elif not result["date"] or not metadata["startsOn"] <= result["date"] <= metadata["endsOn"]:
                reason = "Relay date outside approved meet dates"
            companion, match_error = match_companion(result, relay_index, True)
            reason = reason or match_error
            if reason:
                holds.append({"kind": "relay_total", "meetId": capture["id"], "line": result["line"], "reason": reason})
                tally["totalsHeld"] += 1
                continue
            team = result["team"]
            team_id = team_ids.get((team["lscCode"], team["clubCode"]))
            if not team_id:
                team_id = f"hytek-team-{team['lscCode'].lower() or 'unknown'}-{team['clubCode'].lower()}"
                dependencies["teams/" + team_id] = {"id": team_id, **team}
            if capture["id"] not in meets:
                dependencies["meets/" + capture["id"]] = {"id": capture["id"], "name": metadata["title"], "startsOn": metadata["startsOn"], "endsOn": metadata["endsOn"], "sourceUrl": metadata["sourceUrl"], "lscCode": "IE", "knowledgeEntryId": capture["id"]}
            heat_lane = companion["results"][result["round"]]
            relay_id = "hytek_relay_" + digest("|".join((capture["id"], team_id, result["relayName"], result["eventNumber"],
                result["gender"], str(result["ageMinimum"]), str(result["ageMaximum"]), str(result["distance"]), result["stroke"],
                result["course"], result["round"], result["date"], heat_lane["heat"], heat_lane["lane"])))
            splits, split_coverage, split_errors = verified_splits(result, companion, True)
            members, member_errors = member_lineup(result, companion, hy3["athletes"], identity, athletes)
            boundaries = {point["distance"]: point["cumulativeMs"] for point in splits}
            if result["distance"] % 4 == 0:
                leg_distance = result["distance"] // 4
                for member in members:
                    start = boundaries.get((member["leg"] - 1) * leg_distance, 0 if member["leg"] == 1 else None)
                    end = boundaries.get(member["leg"] * leg_distance)
                    if start is not None and end is not None:
                        member["timeMs"] = end - start
            for kind, errors in (("relay_splits", split_errors), ("relay_lineup", member_errors)):
                for error in errors:
                    holds.append({"kind": kind, "meetId": capture["id"], "line": result["line"], "relayResultId": relay_id, "reason": error})
            body = {"id": relay_id, "teamId": team_id, "relayName": result["relayName"], "isRelay": True,
                    "eventCode": f"{result['distance']}_{'FR' if result['stroke'] == 'FR' else 'MED'}-R_{result['course']}",
                    "distance": result["distance"], "stroke": result["stroke"], "course": result["course"], "gender": result["gender"],
                    "ageGroup": age_label(result["ageMinimum"], result["ageMaximum"]), "round": result["round"],
                    "status": result["status"], "timeMs": result["timeMs"], "timeDisplay": display(result["timeMs"]) if result["status"] == "OK" else result["status"],
                    "isOfficial": True, "members": members, "splits": splits, "splitCoverage": split_coverage,
                    "lineupCoverage": "complete" if len(members) == 4 and not member_errors else "partial" if members else "unavailable",
                    "meet": {"id": capture["id"], "name": metadata["title"], "date": result["date"]},
                    "metadata": {"source": "hytek_hy3", "createdAt": now},
                    "sourceObservation": {"url": capture["url"], "archiveSha256": capture["sha256"], "file": capture["hy3"],
                         "line": result["line"], "eventNumber": result["eventNumber"], "originalTimeMs": result["sourceTimeMs"],
                         "heat": heat_lane["heat"], "lane": heat_lane["lane"],
                         "resultFlag": result["sourceFlag"], "dqReasons": result["dqReasons"], "precision": "hundredths",
                         "ageCode": companion["ageCode"], "ageMinimum": result["ageMinimum"], "ageMaximum": result["ageMaximum"],
                         "splitMarkers": result["hy3Splits"], "splitValidation": "Companion CL2 G0 explicit distance, sequence, cumulative slot and F0 leg; exact paired values",
                         "companionFile": cl2_name, "companionLine": companion["line"], "knowledgeMeetId": capture["id"]}}
            body["sourceObservation"]["memberNames"] = {}
            body["sourceObservation"]["memberAges"] = {}
            body["sourceObservation"]["memberAgeVerification"] = {}
            for source_member in result["hy3Members"]:
                source_athlete = hy3["athletes"].get((team["lscCode"], team["clubCode"], source_member["number"], source_member["gender"]))
                if source_athlete:
                    body["sourceObservation"]["memberNames"][str(source_member["leg"])] = {"first": source_athlete["preferred"] or source_athlete["first"], "last": source_athlete["last"]}
                    member_hash = digest(source_athlete["member"])
                    observed_dates = birth_dates[member_hash]
                    if len(observed_dates) == 1:
                        try:
                            birth = datetime.datetime.strptime(next(iter(observed_dates)), "%m%d%Y").date()
                            race = datetime.date.fromisoformat(result["date"])
                            age = race.year - birth.year - ((race.month, race.day) < (birth.month, birth.day))
                            if 0 <= age <= 120:
                                body["sourceObservation"]["memberAges"][str(source_member["leg"])] = age
                                body["sourceObservation"]["memberAgeVerification"][str(source_member["leg"])] = {"basis": "Exact race-day age from consistent private DOB across retained official archives, bound by identical stable source member identity", **birth_evidence[member_hash]}
                        except ValueError:
                            pass
            if relay_id in seen:
                if seen[relay_id] != body:
                    raise ValueError("Conflicting duplicate source relay " + relay_id)
                tally["duplicatesSkipped"] += 1
                continue
            seen[relay_id] = body
            tally["validatedTotals"] += 1
            tally["splits_" + split_coverage] += 1
            tally["lineups_" + body["lineupCoverage"]] += 1
            verification = verifications.get(relay_id)
            if verification:
                individual, lead_error = verified_leadoff(body, verification, prepared_fingerprints)
                if individual or lead_error == "Exact eligible individual performance already exists":
                    members[0]["leadOffEligible"] = True
                if individual:
                    lead_writes.append({"path": "swims/" + individual["id"], "after": individual})
                    tally["verifiedLeadOffsPrepared"] += 1
                elif lead_error == "Exact eligible individual performance already exists":
                    tally["verifiedLeadOffsAlreadyPublished"] += 1
                else:
                    holds.append({"kind": "lead_off", "meetId": capture["id"], "relayResultId": relay_id, "reason": lead_error})
            elif any(member["leg"] == 1 and "timeMs" in member for member in members):
                holds.append({"kind": "lead_off", "meetId": capture["id"], "relayResultId": relay_id, "reason": "First-leg boundary available; individual timing/validity eligibility not independently verified"})
                tally["leadOffCandidatesHeld"] += 1
            existing_relay = relays.get(relay_id)
            if existing_relay:
                if {key: value for key, value in body.items() if key != "metadata"} != {key: value for key, value in existing_relay.items() if key != "metadata"}:
                    holds.append({"kind": "relay_total", "meetId": capture["id"], "relayResultId": relay_id, "reason": "Existing relay differs; preserve published data for reconciliation"})
                else:
                    tally["duplicatesSkipped"] += 1
            else:
                result_writes.append({"path": "relay_results/" + relay_id, "after": body})

        for result in hy3["individuals"]:
            if not any(split["timeMs"] > 0 for split in result["hy3Splits"]):
                continue
            existing_swim = source_rows.get((capture["url"], result["line"]))
            if not existing_swim:
                tally["individualSourceRowsNotPublished"] += 1
                continue
            if not same_source_performance(existing_swim, result, capture["id"]):
                tally["individualSplitSetsHeld"] += 1
                holds.append({"kind": "individual_splits", "meetId": capture["id"], "line": result["line"], "reason": "Published source result differs from archive performance; preserve for reconciliation"})
                continue
            companion, error = match_companion(result, individual_index, False)
            if error:
                tally["individualSplitSetsHeld"] += 1
                holds.append({"kind": "individual_splits", "meetId": capture["id"], "line": result["line"], "reason": error})
                continue
            splits, coverage, errors = verified_splits(result, companion, False)
            if errors:
                tally["individualSplitSetsHeld"] += 1
                holds.extend({"kind": "individual_splits", "meetId": capture["id"], "line": result["line"], "reason": error} for error in errors)
                continue
            if not splits:
                continue
            if existing_swim.get("splits"):
                if existing_swim["splits"] == splits:
                    tally["individualSplitsAlreadyPresent"] += 1
                else:
                    holds.append({"kind": "individual_splits", "meetId": capture["id"], "line": result["line"], "reason": "Existing split detail differs; preserve for reconciliation"})
                continue
            updated = copy.deepcopy(existing_swim)
            updated.update({"splits": splits, "splitCoverage": coverage})
            updated.setdefault("sourceObservation", {})["splitValidation"] = {"basis": "Paired HY3 values and CL2 G0 explicit distance, sequence and cumulative slot", "companionFile": cl2_name, "companionLine": companion["line"], "sourceMarkers": result["hy3Splits"]}
            split_writes.append({"path": "swims/" + updated["id"], "after": updated})
            tally["individualSplitUpdates"] += 1
        per_meet.append({"id": capture["id"], "title": metadata["title"], "archiveSha256": capture["sha256"], **tally})
        counts.update(tally)

    output.mkdir(parents=True, exist_ok=True)
    if (output / "staging-receipts.json").exists():
        raise ValueError("Refusing to regenerate staged review artifacts")
    batch_dir = output / "batches"
    batch_dir.mkdir(exist_ok=True)
    for stale in batch_dir.glob("[0-9][0-9][0-9][0-9].json"):
        stale.unlink()
    batches = []
    source = "https://www.gomotionapp.com/team/wzielsc/page/events#/team-events/past"

    def batch(scope: str, writes: list[dict], source_url: str, evidence: dict) -> None:
        for start in range(0, len(writes), 100):
            chunk = writes[start:start + 100]
            snapshots = [{"path": write["path"], "before": all_snapshots.get(write["path"])} for write in chunk]
            payload = {"division": "times", "scope": f"{scope} | part {start // 100 + 1}/{(len(writes) + 99) // 100}",
                       "sourceUrl": source_url, "capturedAt": now, "coverage": "partial", "evidence": evidence,
                       "writes": chunk, "reads": snapshots}
            filename = f"{len(batches) + 1:04d}.json"
            data = json.dumps(payload, ensure_ascii=False)
            if len(data.encode()) > 2_000_000:
                raise ValueError("Prepared batch exceeds collection size limit")
            (batch_dir / filename).write_text(data)
            batches.append({"file": filename, "records": len(chunk), "scope": payload["scope"]})

    dependency_writes = [{"path": path, "after": data} for path, data in sorted(dependencies.items())]
    if dependency_writes:
        batch("IES relay prerequisites", dependency_writes, source, {"order": "Approve prerequisite teams/meets before relay results", "method": "Approved meet identities and official source team codes"})
    for capture in captures:
        for title, writes in (("relay results", result_writes), ("individual split updates", split_writes), ("verified lead-offs", lead_writes)):
            selected = [write for write in writes if write["after"]["meet"]["id"] == capture["id"]]
            if selected:
                batch(f"IES {title} | {capture['title']}", selected, capture["url"], {
                    "method": "Official paired HY3/CL2 archive; total/event/date/round/status and all split values crosschecked",
                    "archiveSha256": capture["sha256"], "knowledgeMeetId": capture["id"],
                    "baselineCapturedAt": now, "order": "Approve team/meet/profile prerequisites, then relays, then verified lead-offs",
                    "limitations": "Explicit missing coverage retained. Ambiguous split distances and unverified lead-off eligibility held. No member registration IDs or birth dates in proposed records.",
                    "reviewReads": "Compare supplied before snapshots before staging; updates preserve the full current individual result"})
    summary = {"capturedAt": now, "candidateRelays": counts["candidateTotals"], "validatedRelays": counts["validatedTotals"],
               "relaysPrepared": len(result_writes), "individualSplitUpdates": len(split_writes), "leadOffsPrepared": len(lead_writes),
               "dependencies": len(dependency_writes), "batches": len(batches), "holds": len(holds),
               "holdReasons": dict(collections.Counter(hold["reason"] for hold in holds)), "coverage": dict(counts),
               "sourceScope": "Every swimmer and club in retained official IES archives; historical participation only"}
    (output / "manifest.json").write_text(json.dumps({"summary": summary, "batches": batches, "meets": per_meet}, indent=2))
    (output / "validation-report.json").write_text(json.dumps({"summary": summary, "meets": per_meet, "holds": holds}, indent=2))
    (output / "relay-results.json").write_text(json.dumps([write["after"] for write in result_writes]))
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive-dir", type=Path, required=True, help="Original retained captures.json, baseline.json and ZIP archives")
    parser.add_argument("--baseline", type=Path, required=True, help="Fresh raw documents {capturedAt,athletes,swims,meets,teams,relay_results}; each array contains {id,data}")
    parser.add_argument("--identity-manifest", type=Path, required=True, help="Prior reviewed import manifest.json with hashed source identityMappings")
    parser.add_argument("--output", type=Path, required=True, help="Private gitignored local artifact directory")
    parser.add_argument("--lead-off-verifications", type=Path, help="Optional separately reviewed exact relay/member/time verification JSON array")
    args = parser.parse_args()
    print(json.dumps(prepare(args.archive_dir, args.baseline, args.identity_manifest, args.output, args.lead_off_verifications)))


if __name__ == "__main__":
    main()
