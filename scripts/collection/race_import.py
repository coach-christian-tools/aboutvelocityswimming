"""Repeatable official HY3/CL2 proposals using the existing collection contract.

Source archives and all generated artifacts are private local files. This module
deliberately has no network/database/subprocess dependency or apply operation.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import io
from importlib.util import spec_from_file_location, module_from_spec
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import unicodedata
from urllib.parse import urlsplit
import zipfile
from race_baseline import load as load_baseline

ROOT = Path(__file__).resolve().parents[2]
PRIVATE_ROOT = ROOT / "backups"
sys.path.insert(0, str(ROOT / "scripts/swim-resources/lib"))
from hytek_relays import (COURSES, STROKES, STATUS, cl2_index, digest, display,
                          iso_date, match_companion, parse_cl2, parse_hy3,
                          time_ms, verified_splits, verify_hy3)

COLLECTIONS = ("teams", "meets", "athletes", "swims", "relay_results")
ID = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")
VERSION = 1
_relay_spec = spec_from_file_location("race_prep_relays", ROOT / "scripts/swim-resources/prepare-ies-relays.py")
_relay_helper = module_from_spec(_relay_spec)
_relay_spec.loader.exec_module(_relay_helper)


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


def read(path):
    return load_baseline(path)[0]


def save(path, value):
    """Atomic private writes; identical resumptions do not rewrite artifacts."""
    path = Path(path)
    data = encode(value) + b"\n"
    if path.exists() and path.read_bytes() == data:
        return
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        stream.write(data)
        temporary = stream.name
    os.replace(temporary, path)


def date(value):
    if not isinstance(value, str) or dt.date.fromisoformat(value).isoformat() != value:
        raise ValueError("Expected an exact ISO calendar date")
    return value


def timestamp(value):
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Capture times require a timezone")
    return parsed


def url(value):
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment
            or re.search(r"\s", value)):
        raise ValueError("Expected an HTTPS source URL without credentials or fragment")
    return value


def identifier(value):
    if not isinstance(value, str) or not ID.fullmatch(value):
        raise ValueError("Invalid stable record identifier")
    return value


def records(baseline):
    result = {}
    for collection in COLLECTIONS:
        rows = baseline.get(collection)
        if not isinstance(rows, list):
            raise ValueError(f"Baseline requires full raw {collection} array")
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError("Baseline rows require objects")
            body = row.get("data", row)
            if not isinstance(body, dict):
                raise ValueError("Baseline rows require full object before-images")
            rid = identifier(row.get("id") or row.get("path", "").split("/")[-1] or body.get("id"))
            path = collection + "/" + rid
            if row.get("path", path) != path or (body.get("id") is not None and body["id"] != rid):
                raise ValueError("Baseline record path and body identity disagree")
            if path in result:
                raise ValueError("Duplicate or invalid baseline record")
            result[path] = body
    timestamp(baseline["capturedAt"])
    if not isinstance(baseline.get("project"), str) or not baseline["project"]:
        raise ValueError("Baseline requires explicit project")
    return result


def complete(baseline):
    collections_present = baseline.get("completeCollections")
    counts = baseline.get("collectionCounts")
    return (isinstance(collections_present, list) and all(isinstance(c, str) for c in collections_present)
            and len(collections_present) == len(COLLECTIONS)
            and set(collections_present) == set(COLLECTIONS) and isinstance(counts, dict)
            and all(type(counts.get(c)) is int and counts[c] == len(baseline[c]) for c in COLLECTIONS))


def revision_verified(baseline):
    revision = baseline.get("canonicalRevision")
    proof = baseline.get("consistency", {})
    return (isinstance(revision, str) and re.fullmatch(r"[0-9]+", revision) is not None
            and proof.get("verified") is True and proof.get("revision") == revision and proof.get("exportVersion") == 1)


def catalog_scope(baseline_path, output):
    baseline = read(baseline_path)
    rows = baseline.get("catalog")
    if not revision_verified(baseline) or baseline.get("catalogComplete") is not True or not isinstance(rows, list) or baseline.get("catalogCount") != len(rows):
        raise ValueError("Whole-catalog scope requires the consistent complete private export")
    ids = sorted(identifier(row["id"]) for row in rows)
    if not ids or len(ids) != len(set(ids)):
        raise ValueError("Catalog meet IDs must be nonempty and unique")
    manifest = {"version": VERSION, "project": baseline["project"], "scope": "whole-catalog",
                "catalogRevision": baseline["canonicalRevision"], "selectedMeetIds": ids,
                "sources": [{"id": "pending-" + mid, "meetId": mid, "available": False,
                    "receiptStatus": "pending", "reason": "Source acquisition and all-swimmer coverage review have not been performed"} for mid in ids]}
    output = Path(output).resolve()
    if not output.is_relative_to(PRIVATE_ROOT.resolve()) or output == PRIVATE_ROOT.resolve():
        raise ValueError("Catalog scope must stay below the private backups directory")
    save(output, manifest)
    return {"scope": "whole-catalog", "meetCount": len(ids), "pendingSourceReceipts": len(ids), "dryRun": True}


def normalize(value):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", value).lower())


def held(kind, reason, source=None, line=None, **extra):
    return {"kind": kind, "reason": reason, **({"sourceId": source["id"], "meetId": source["meetId"]} if source else {}),
            **({"line": line} if line else {}), **extra}


def parse_individuals(lines):
    """Isolate malformed individual rows while retaining exact source positions."""
    rows, holds = [], []
    team = athlete = entry = current = None
    for number, line in enumerate(lines, 1):
        kind = line[:2]
        try:
            if kind == "C1":
                team = {"clubCode": line[2:7].strip(), "lscCode": line[53:55].strip(), "name": line[7:37].strip()}
                athlete = entry = current = None
            elif kind == "D1":
                athlete = {"number": line[3:8].strip(), "member": line[69:83].strip(), "first": line[28:48].strip(),
                           "preferred": line[48:68].strip(), "last": line[8:28].strip(), "gender": line[2],
                           "birthDate": line[88:96].strip(), "competitionAge": line[97:99].strip(), "team": team}
                entry = current = None
            elif kind == "E1":
                entry = None
                current = None
                if not athlete or not team or line[3:8].strip() != athlete["number"]:
                    raise ValueError("Individual entry lacks matching athlete/team context")
                entry = {"athlete": athlete, "team": team, "distance": int(line[15:21]),
                         "stroke": STROKES.get(line[21]), "eventNumber": line[38:42].strip()}
            elif kind in ("F1", "F2"):
                entry = current = None
            elif kind == "E2":
                current = None
                if entry is None:
                    raise ValueError("Individual result lacks a valid entry")
                status = STATUS.get(line[12])
                present = bool(line[4:11].strip())
                raw_time = 0 if not present and status in ("DQ", "NS", "DNF", "DFS") else time_ms(line[4:11])
                current = {**entry, "line": number, "round": line[2], "course": COURSES.get(line[11]),
                           "sourceFlag": line[12], "status": status, "sourceTimeMs": raw_time, "sourceTimePresent": present,
                           "rawDate": line[87:95], "date": iso_date(line[87:95]), "hy3Splits": []}
                current["timeMs"] = raw_time if current["status"] == "OK" else 0
                rows.append(current)
            elif kind == "G1" and current is not None:
                for start in range(2, 123, 11):
                    part = line[start:start + 11]
                    if part.strip() and part[0] == current["round"]:
                        current["hy3Splits"].append({"marker": int(part[1:3]), "timeMs": time_ms(part[3:11]), "line": number})
        except (ValueError, TypeError) as error:
            if kind == "G1" and current is not None:
                current.setdefault("splitParseErrors", []).append("Malformed individual split record")
            else:
                holds.append({"kind": "source_row", "line": number, "code": kind, "reason": str(error)})
    return rows, holds


def read_source(source, directory):
    path = Path(source["file"])
    path = path if path.is_absolute() else directory / path
    if path.stat().st_size > 200_000_000:
        raise ValueError("Archive exceeds private preparation size budget")
    archive_bytes = path.read_bytes()
    if sha(archive_bytes) != source["sha256"]:
        raise ValueError("Archive SHA-256 differs from explicit source manifest")
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        for name in (source["hy3"], source["cl2"]):
            if archive.namelist().count(name) != 1 or archive.getinfo(name).file_size > 100_000_000:
                raise ValueError("Missing, duplicate, or oversized archive member")
        raw = archive.read(source["hy3"])
        cl = archive.read(source["cl2"])
    lines = verify_hy3(raw)
    headers = [line for line in lines if line[:2] == "B1"]
    if len(headers) != 1:
        raise ValueError("Archive requires one unambiguous meet header")
    actual_meet = {"name": headers[0][2:47].strip(), "startsOn": iso_date(headers[0][92:100]), "endsOn": iso_date(headers[0][100:108])}
    identity = source["meetIdentity"]
    if identity.get("reviewed") is not True or not identity.get("basis") or identity.get("fileMeet") != actual_meet:
        raise ValueError("Meet identity requires a reviewed exact HY3 name/date binding")
    if not (source["meet"]["startsOn"] <= actual_meet["startsOn"] <= actual_meet["endsOn"] <= source["meet"]["endsOn"]):
        raise ValueError("Source meet dates conflict with selected meet")
    individuals, problems = parse_individuals(lines)
    # Keep every original D1, including duplicate local keys, before the shared
    # relay parser's dictionary can overwrite an earlier member observation.
    relay_athlete_observations, source_team = [], None
    for number, line in enumerate(lines, 1):
        if line[:2] == "C1":
            source_team = {"clubCode": line[2:7].strip(), "lscCode": line[53:55].strip()}
        elif line[:2] == "D1":
            relay_athlete_observations.append({"number": line[3:8].strip(), "member": line[69:83].strip(),
                "gender": line[2], "team": source_team, "line": number})
    # Shared relay parser sees the same checksummed bytes. A malformed relay
    # blocks that relay source, never the independently parsed individual rows.
    try:
        # Independent individual failures must not discard valid relay totals.
        # Blank only individual event/detail records for this relay-only pass;
        # original source bytes/hashes/line numbers and D1 lineup contexts remain.
        relay_lines, context = [], None
        for line in lines:
            kind = line[:2]
            if kind in ("C1", "D1"):
                context = None
            elif kind in ("E1", "E2"):
                context = "individual"
            elif kind in ("F1", "F2"):
                context = "relay"
            relay_lines.append(" " * len(line) if kind in ("E1", "E2") or (context == "individual" and kind in ("G1", "H1", "H2")) else line)
        parsed = parse_hy3(relay_lines)
        relays = parsed["relays"]
        athletes = list(parsed["athletes"].values())
    except (ValueError, TypeError, KeyError) as error:
        relays, athletes = [], []
        problems.append({"kind": "relay_source", "reason": "Shared relay parsing failed: " + str(error)})
    companion = parse_cl2(cl.decode("cp1252").splitlines())
    date_observations = {}
    if "dateCrosswalk" in identity:
        # Count original rows, including rows later held for identity, status or
        # relay detail. A date exception cannot hide conflicting raw dates.
        date_observations = {
            "hy3Individuals": dict(collections.Counter(iso_date(line[87:95]) for line in lines if line[:2] == "E2")),
            "hy3Relays": dict(collections.Counter(iso_date(line[102:110]) for line in lines if line[:2] == "F2")),
            "cl2Individuals": dict(collections.Counter(iso_date(row["rawDate"]) for row in companion["individuals"] for _ in row["results"])),
            "cl2Relays": dict(collections.Counter(iso_date(row["rawDate"]) for row in companion["relays"] for _ in row["results"]))}
    return {"individuals": individuals, "relays": relays, "athletes": athletes, "cl2": companion, "holds": problems,
            "relayAthleteObservations": relay_athlete_observations,
            **({"dateObservations": date_observations} if date_observations else {}),
            "hy3Sha256": sha(raw), "cl2Sha256": sha(cl), "hy3ResultRows": sum(line[:2] == "E2" for line in lines),
            "hy3RelayRows": sum(line[:2] == "F2" for line in lines), "fileMeet": actual_meet}


def validate_sources(manifest):
    if manifest.get("version") != VERSION or not manifest.get("project"):
        raise ValueError("Source manifest requires version 1 and explicit project")
    selected = manifest.get("selectedMeetIds")
    if not isinstance(selected, list) or not selected or len(selected) != len(set(selected)):
        raise ValueError("Explicit unique selectedMeetIds required")
    for mid in selected:
        identifier(mid)
    sources = manifest.get("sources", [])
    if not sources or {s["meetId"] for s in sources} != set(selected):
        raise ValueError("Every selected meet requires a source or explicit unavailable receipt")
    ids = set()
    meet_metadata = {}
    for source in sources:
        identifier(source["id"])
        if source["id"] in ids:
            raise ValueError("Duplicate source ID")
        ids.add(source["id"])
        if source.get("available") is False:
            if not source.get("reason"):
                raise ValueError("Unavailable sources require a reason")
            continue
        url(source["url"])
        timestamp(source["capturedAt"])
        if source.get("official") is not True or not source.get("officialBasis") or not re.fullmatch(r"[a-f0-9]{64}", source["sha256"]):
            raise ValueError("Official source assertion and SHA-256 required")
        scope = source.get("sourceScope", {})
        if scope.get("kind") not in ("meet-wide", "club-filtered", "unknown") or not scope.get("basis"):
            raise ValueError("Explicit archive scope and limitations required")
        for key in ("hy3", "cl2", "file"):
            if not isinstance(source.get(key), str) or not source[key]:
                raise ValueError("Explicit archive and both member names required")
        meet = source["meet"]
        if not meet.get("name") or date(meet["startsOn"]) > date(meet["endsOn"]):
            raise ValueError("Selected meet name and date interval required")
        canonical = source.get("meetIdentity", {}).get("canonicalMeet")
        if "canonicalMeet" in source.get("meetIdentity", {}):
            if (not isinstance(canonical, dict) or canonical.get("reviewed") is not True
                    or not canonical.get("basis")):
                raise ValueError("Canonical meet crosswalk requires explicit reviewed evidence")
            identifier(canonical["id"])
            url(canonical["sourceUrl"])
        binding = (meet["name"], meet["startsOn"], meet["endsOn"],
                   canonical["id"] if canonical is not None else source["meetId"])
        if source["meetId"] in meet_metadata and meet_metadata[source["meetId"]] != binding:
            raise ValueError("Selected meet has conflicting source metadata; review its crosswalk")
        meet_metadata[source["meetId"]] = binding
        for raw_round, mapping in source.get("roundMappings", {}).items():
            if raw_round not in ("P", "F", "S") or mapping.get("round") not in ("P", "F", "S", "TT") or mapping.get("reviewed") is not True or not mapping.get("basis"):
                raise ValueError("Round reinterpretation requires explicit reviewed evidence")
            url(mapping["sourceUrl"])
        if source.get("numericSFlagReviewed") is True and not source.get("numericSFlagBasis"):
            raise ValueError("Numeric S flag review requires an explicit evidence basis")
        date_crosswalk_shape(source)


def exact_fields(value, fields, label):
    if not isinstance(value, dict) or set(value) != set(fields):
        raise ValueError(label + " requires exact documented fields")


def hash_value(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{64}", value):
        raise ValueError("Expected a lowercase SHA-256 evidence hash")


def date_crosswalk_shape(source):
    """Strict single-day exception; private paths stay outside public evidence."""
    identity = source.get("meetIdentity", {})
    if "dateCrosswalk" not in identity:
        if "dateEvidenceFiles" in source:
            raise ValueError("Date evidence files require a reviewed date crosswalk")
        return
    crosswalk = identity["dateCrosswalk"]
    exact_fields(crosswalk, ("version", "reviewed", "basis", "sourceArchiveSha256", "catalogObservation", "actualMeet",
                            "evidence", "preserveCatalogObservation", "reschedulingCauseOrSequenceEstablished"), "Date crosswalk")
    if (type(crosswalk["version"]) is not int or crosswalk["version"] != 1 or crosswalk["reviewed"] is not True
            or crosswalk["preserveCatalogObservation"] is not True or crosswalk["reschedulingCauseOrSequenceEstablished"] is not False
            or not isinstance(crosswalk["basis"], str) or not crosswalk["basis"].strip()):
        raise ValueError("Date crosswalk requires version 1, explicit review/basis and preserved conflicting observation without inferred cause")
    hash_value(crosswalk["sourceArchiveSha256"])
    if crosswalk["sourceArchiveSha256"] != source["sha256"]:
        raise ValueError("Date crosswalk belongs to a different source archive")
    actual = crosswalk["actualMeet"]
    exact_fields(actual, ("startsOn", "endsOn"), "Actual meet dates")
    if date(actual["startsOn"]) != date(actual["endsOn"]):
        raise ValueError("Date crosswalk version 1 requires one exact actual meet day; never widen a conflicting span")
    observation = crosswalk["catalogObservation"]
    exact_fields(observation, ("meetId", "canonicalRevisionReviewed", "dataSha256", "startsOn", "endsOn", "rawStartValue", "rawEndValue",
                               "sourceUrl", "hashEncoding", "rawListingSha256"), "Catalog date observation")
    identifier(observation["meetId"])
    if observation["meetId"] != source["meetId"]:
        raise ValueError("Date crosswalk catalog meet ID differs")
    if (not isinstance(observation["canonicalRevisionReviewed"], str) or not re.fullmatch(r"0|[1-9][0-9]*", observation["canonicalRevisionReviewed"])
            or observation["hashEncoding"] != "race_import.encode(catalog data): sorted compact UTF-8 JSON, no trailing newline"):
        raise ValueError("Date crosswalk requires exact reviewed revision and catalog hash encoding")
    for key in ("dataSha256", "rawListingSha256"):
        hash_value(observation[key])
    if date(observation["startsOn"]) > date(observation["endsOn"]):
        raise ValueError("Catalog observation dates are reversed")
    for key in ("rawStartValue", "rawEndValue"):
        if not isinstance(observation[key], str):
            raise ValueError("Catalog raw date observation must be retained exactly")
        timestamp(observation[key])
    if not isinstance(observation["sourceUrl"], str):
        raise ValueError("Catalog observation requires an HTTPS source URL")
    # Catalog navigation uses legitimate event fragments. Retain the complete
    # exact observed URL, while download/evidence URLs keep the stricter rule.
    url(observation["sourceUrl"].split("#", 1)[0])
    if re.search(r"\s", observation["sourceUrl"]):
        raise ValueError("Catalog observation URL cannot contain raw whitespace")
    references = crosswalk["evidence"]
    if not isinstance(references, list) or not references:
        raise ValueError("Date crosswalk requires retained official evidence")
    kinds, hashes = set(), set()
    base = {"kind", "sha256", "receiptSha256", "sourceUrl"}
    extras = {"official_catalog_listing": set(), "official_sanctioned_announcement": {"numericDate", "page", "sanction"},
              "official_entry_event_headers": {"numericDate", "memberSha256"}, "official_result_pdf": {"numericDate", "pages"},
              "official_paired_result_archive": {"hy3Sha256", "cl2Sha256", "individualRaceDates", "relayRaceDates"}}
    for reference in references:
        if not isinstance(reference, dict) or reference.get("kind") not in extras:
            raise ValueError("Unsupported date authority evidence kind")
        kind = reference["kind"]
        exact_fields(reference, base | extras[kind], "Date authority reference")
        for key in ("sha256", "receiptSha256"):
            hash_value(reference[key])
        if kind in kinds or reference["sha256"] in hashes:
            raise ValueError("Duplicate or aliased date evidence reference")
        kinds.add(kind)
        hashes.add(reference["sha256"])
        if not isinstance(reference["sourceUrl"], str):
            raise ValueError("Date evidence requires an HTTPS source URL")
        url(reference["sourceUrl"])
        if "numericDate" in reference and date(reference["numericDate"]) != actual["startsOn"]:
            raise ValueError("Independent authority numeric date differs from exact actual meet day")
        if kind in ("official_sanctioned_announcement", "official_entry_event_headers") and reference["sourceUrl"] == source["url"]:
            raise ValueError("Independent date authority must be separate from the result archive")
        for key in ("page", "pages"):
            if key in reference and (type(reference[key]) is not int or reference[key] < 1):
                raise ValueError("Date evidence requires a positive page number/count")
        if "sanction" in reference and (not isinstance(reference["sanction"], str) or not reference["sanction"].strip()):
            raise ValueError("Announcement date evidence requires a sanction reference")
        if "memberSha256" in reference:
            members = reference["memberSha256"]
            if not isinstance(members, list) or not members:
                raise ValueError("Entry-header date evidence requires unique member hashes")
            for value in members:
                hash_value(value)
            if len(set(members)) != len(members):
                raise ValueError("Entry-header date evidence requires unique member hashes")
        if kind == "official_paired_result_archive":
            for key in ("hy3Sha256", "cl2Sha256"):
                hash_value(reference[key])
            if reference["sha256"] != source["sha256"] or reference["sourceUrl"] != source["url"]:
                raise ValueError("Paired date evidence differs from source archive identity")
            for key in ("individualRaceDates", "relayRaceDates"):
                counts = reference[key]
                if not isinstance(counts, dict) or any(date(day) != actual["startsOn"] or type(n) is not int or n < 1 for day, n in counts.items()):
                    raise ValueError("Paired date evidence requires exact actual-day positive row counts")
        if kind == "official_catalog_listing" and reference["sha256"] != observation["rawListingSha256"]:
            raise ValueError("Catalog raw listing evidence hash differs")
    if not {"official_catalog_listing", "official_paired_result_archive"} <= kinds or not kinds.intersection({"official_sanctioned_announcement", "official_entry_event_headers"}):
        raise ValueError("Date crosswalk needs original listing, paired results and separate official numeric-date authority")
    bindings = source.get("dateEvidenceFiles")
    if not isinstance(bindings, list) or len(bindings) != len(references):
        raise ValueError("Every date reference requires one retained body/receipt binding")
    bound = set()
    for binding in bindings:
        exact_fields(binding, ("sha256", "file", "receiptSha256", "receiptFile"), "Private date evidence binding")
        for key in ("sha256", "receiptSha256"):
            hash_value(binding[key])
        if binding["sha256"] in bound or binding["sha256"] not in hashes:
            raise ValueError("Duplicate or unreferenced date evidence binding")
        bound.add(binding["sha256"])
        reference = next(item for item in references if item["sha256"] == binding["sha256"])
        if binding["receiptSha256"] != reference["receiptSha256"]:
            raise ValueError("Date reference and receipt binding hash differ")
        if any(not isinstance(binding[key], str) or not binding[key] for key in ("file", "receiptFile")):
            raise ValueError("Retained date evidence body and receipt paths required")


def validate_source_dates(source, parsed, baseline, directory):
    rows = [row for row in baseline.get("catalog", []) if row.get("id") == source["meetId"]]
    crosswalk = source.get("meetIdentity", {}).get("dateCrosswalk")
    if not rows and crosswalk is None:
        return
    if len(rows) != 1 or not isinstance(rows[0].get("data"), dict):
        raise ValueError("Date review requires one exact catalog data snapshot")
    catalog = rows[0]["data"]
    actual = {key: source["meet"][key] for key in ("startsOn", "endsOn")}
    if crosswalk is None:
        if any(date(catalog[key]) != actual[key] for key in actual if key in catalog):
            raise ValueError("Catalog and source meet dates differ; reviewed dateCrosswalk required")
        return
    observed = {key: date(catalog.get(key)) for key in actual}
    date_crosswalk_shape(source)
    observation = crosswalk["catalogObservation"]
    if (not revision_verified(baseline) or baseline.get("catalogComplete") is not True
            or type(baseline.get("catalogCount")) is not int or baseline["catalogCount"] != len(baseline.get("catalog", []))
            or int(observation["canonicalRevisionReviewed"]) > int(baseline["canonicalRevision"])):
        raise ValueError("Date crosswalk requires a complete consistent catalog baseline at or after the retained review revision")
    if (sha(encode(catalog)) != observation["dataSha256"] or observed != {key: observation[key] for key in observed}
            or catalog.get("sourceUrl") != observation["sourceUrl"]):
        raise ValueError("Reviewed catalog body/date snapshot changed; independent date review required")
    if (actual != crosswalk["actualMeet"] or actual != {key: parsed["fileMeet"][key] for key in actual} or actual == observed):
        raise ValueError("Date crosswalk must bind a genuine catalog conflict and exact source/B1 actual endpoints")
    references = crosswalk["evidence"]
    bodies = {}
    for binding in source["dateEvidenceFiles"]:
        contents = []
        for field, expected in (("file", binding["sha256"]), ("receiptFile", binding["receiptSha256"])):
            path = Path(binding[field])
            path = path if path.is_absolute() else directory / path
            if path.stat().st_size > 200_000_000:
                raise ValueError("Retained date evidence exceeds private file budget")
            raw = path.read_bytes()
            if sha(raw) != expected:
                raise ValueError("Retained date evidence body/receipt SHA-256 changed")
            contents.append(raw)
        receipt = json.loads(contents[1])
        reference = next(item for item in references if item["sha256"] == binding["sha256"])
        if (not isinstance(receipt, dict) or receipt.get("sha256") != binding["sha256"]
                or receipt.get("sourceUrl") != reference["sourceUrl"] or type(receipt.get("httpStatus")) is not int or receipt["httpStatus"] != 200):
            raise ValueError("Date evidence receipt body hash, source URL or successful status differs")
        if not isinstance(receipt.get("capturedAt"), str):
            raise ValueError("Date evidence receipt requires a capture time")
        timestamp(receipt["capturedAt"])
        bodies[binding["sha256"]] = contents[0]
        if reference["kind"] == "official_entry_event_headers":
            with zipfile.ZipFile(io.BytesIO(contents[0])) as archive:
                members = [item for item in archive.infolist() if not item.is_dir()]
                if (len(members) > 1000 or len({item.filename for item in members}) != len(members)
                        or sum(item.file_size for item in members) > 200_000_000 or any(item.file_size > 100_000_000 for item in members)):
                    raise ValueError("Retained date entry evidence has duplicate or oversized archive members")
                member_hashes = [sha(archive.read(item)) for item in members]
            if sorted(member_hashes) != sorted(reference["memberSha256"]):
                raise ValueError("Retained official entry-header archive member hashes differ")
    listing = json.loads(bodies[observation["rawListingSha256"]])
    if not isinstance(listing, list):
        raise ValueError("Retained raw catalog listing must be an exact official event array")
    events = [event for event in listing if isinstance(event, dict) and isinstance(event.get("id"), dict)
              and str(event["id"].get("value")) == catalog.get("sourceEventId")]
    if len(events) != 1:
        raise ValueError("Retained raw listing has missing or duplicate source event identity")
    for field, endpoint, raw_field in (("startDate", "startsOn", "rawStartValue"), ("endDate", "endsOn", "rawEndValue")):
        value = events[0].get(field)
        if not isinstance(value, dict) or value.get("displayValueISO") != observation[endpoint] or value.get("value") != observation[raw_field]:
            raise ValueError("Original raw catalog date observation differs from reviewed listing")
    paired = next(item for item in references if item["kind"] == "official_paired_result_archive")
    if paired["hy3Sha256"] != parsed["hy3Sha256"] or paired["cl2Sha256"] != parsed["cl2Sha256"]:
        raise ValueError("Date crosswalk paired archive member hashes differ")
    dates = parsed.get("dateObservations", {})
    for kind in ("Individuals", "Relays"):
        expected = paired["individualRaceDates" if kind == "Individuals" else "relayRaceDates"]
        if dates.get("hy3" + kind) != expected or dates.get("cl2" + kind) != expected:
            raise ValueError("Original HY3/CL2 race dates or date evidence counts differ")
    if sum(paired["individualRaceDates"].values()) != parsed["hy3ResultRows"] or sum(paired["relayRaceDates"].values()) != parsed["hy3RelayRows"]:
        raise ValueError("Date crosswalk must account for every original result row")


def identity_hold_table(mappings):
    """Validate private unresolved decisions; source/name changes cannot release them."""
    if not isinstance(mappings, dict):
        raise ValueError("Identity mapping decisions require an object")
    holds = mappings.get("identityHolds", [])
    if not isinstance(holds, list):
        raise ValueError("identityHolds requires an explicit list")
    result = {}
    for item in holds:
        if not isinstance(item, dict) or set(item) != {"sourceMemberIdHash", "state", "basis", "evidence"}:
            raise ValueError("Identity hold requires digest, unresolved state, basis, and evidence")
        member_hash = item["sourceMemberIdHash"]
        if not isinstance(member_hash, str) or not re.fullmatch(r"[a-f0-9]{24}", member_hash):
            raise ValueError("Identity hold requires a 24-character lowercase source member digest")
        if member_hash in result:
            raise ValueError("Duplicate unresolved identity hold digest")
        if item["state"] != "unresolved" or not isinstance(item["basis"], str) or not item["basis"].strip():
            raise ValueError("Identity hold requires explicit unresolved state and nonempty evidence basis")
        if not isinstance(item["evidence"], list) or not item["evidence"]:
            raise ValueError("Identity hold requires stable source evidence references")
        references = set()
        for reference in item["evidence"]:
            if not isinstance(reference, dict) or set(reference) != {"sourceId", "meetId", "archiveSha256", "file", "line", "sourceUrl"}:
                raise ValueError("Identity hold evidence requires exact stable source reference fields")
            identifier(reference["sourceId"])
            identifier(reference["meetId"])
            if not isinstance(reference["archiveSha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", reference["archiveSha256"]):
                raise ValueError("Identity hold evidence requires archive SHA-256")
            if (not isinstance(reference["file"], str) or not reference["file"].strip()
                    or any(ord(char) < 32 for char in reference["file"])
                    or type(reference["line"]) is not int or reference["line"] < 1):
                raise ValueError("Identity hold evidence requires archive member and positive source line")
            if not isinstance(reference["sourceUrl"], str):
                raise ValueError("Identity hold evidence requires an HTTPS source URL")
            url(reference["sourceUrl"])
            key = encode(reference)
            if key in references:
                raise ValueError("Duplicate identity hold evidence reference")
            references.add(key)
        result[member_hash] = item
    aliases = mappings.get("identities", [])
    if not isinstance(aliases, list):
        raise ValueError("Identity mappings require an explicit list")
    seen = set()
    for item in aliases:
        if (not isinstance(item, dict) or item.get("reviewed") is not True
                or not isinstance(item.get("basis"), str) or not item["basis"].strip()):
            raise ValueError("Identity mappings require explicit review and evidence basis")
        member_hash = item.get("sourceMemberIdHash")
        if not isinstance(member_hash, str) or not re.fullmatch(r"[a-f0-9]{24}", member_hash):
            raise ValueError("Identity requires the stable source member digest")
        identifier(item.get("athleteId"))
        if not isinstance(item.get("sourceUrl"), str):
            raise ValueError("Identity mappings require an HTTPS source URL")
        url(item["sourceUrl"])
        if member_hash in seen:
            raise ValueError("Duplicate or conflicting approved identity alias digest")
        if member_hash in result:
            raise ValueError("Approved identity alias conflicts with unresolved identity hold")
        seen.add(member_hash)
    return result


def mapping_tables(mappings, snapshots):
    identity_holds = identity_hold_table(mappings)
    teams = mappings.get("teams", [])
    identities = collections.defaultdict(set)
    for path, body in snapshots.items():
        member_hash = source_evidence(body).get("memberIdHash")
        if path.startswith("athletes/") and isinstance(member_hash, str) and re.fullmatch(r"[a-f0-9]{24}", member_hash):
            identities[member_hash].add(path.split("/")[1])
    for item in mappings.get("identities", []):
        if item.get("reviewed") is not True or not item.get("basis"):
            raise ValueError("Identity mappings require explicit review and evidence basis")
        url(item["sourceUrl"])
        if "athletes/" + identifier(item["athleteId"]) not in snapshots:
            raise ValueError("Reviewed identity target is absent from baseline")
        if not re.fullmatch(r"[a-f0-9]{24}", item["sourceMemberIdHash"]):
            raise ValueError("Identity requires the stable source member digest")
        identities[item["sourceMemberIdHash"]].add(item["athleteId"])
    for item in mappings.get("_canonicalClaims", []):
        if item.get("namespace") == "hytek-member":
            if not re.fullmatch(r"[a-f0-9]{24}", item.get("sourceId", "")) or "athletes/" + identifier(item["athleteId"]) not in snapshots:
                raise ValueError("Invalid exported canonical identity claim")
            identities[item["sourceId"]].add(item["athleteId"])
    for item in teams:
        identifier(item["teamId"])
        if item.get("reviewed") is not True or not item.get("basis") or not item.get("clubCode") or not item.get("lscCode"):
            raise ValueError("Historical team mapping requires codes and explicit evidence review")
        url(item["sourceUrl"])
        if date(item["validFrom"]) > date(item["validThrough"]):
            raise ValueError("Historical team interval is reversed")
        existing = snapshots.get("teams/" + item["teamId"])
        if existing is None and not item.get("name"):
            raise ValueError("New historical teams require a source name")
    return teams, identities, identity_holds


def relay_identity_hold(row, companion, observations, identities, identity_holds):
    """With unresolved decisions, only a complete unique paired lineup is safe."""
    if not identity_holds:
        return None
    team = row["team"]
    local = collections.defaultdict(list)
    prefixes = collections.defaultdict(list)
    for athlete in observations:
        context = athlete.get("team")
        if context == {"lscCode": team["lscCode"], "clubCode": team["clubCode"]}:
            local[(athlete["number"], athlete["gender"])].append(athlete)
            if athlete["member"]:
                prefixes[athlete["member"][:12]].append(athlete)
    hy3_legs, cl2_legs = collections.defaultdict(list), collections.defaultdict(list)
    for member in row["hy3Members"]:
        hy3_legs[member["leg"]].append(member)
    if companion:
        for member in companion["members"]:
            leg = member["orders"].get(row["round"])
            if leg in ("1", "2", "3", "4"):
                cl2_legs[int(leg)].append(member)
    problems, member_hashes, athlete_lines, paired_members = set(), set(), set(), []
    for leg in range(1, 5):
        hy3, cl2 = hy3_legs[leg], cl2_legs[leg]
        if len(hy3) != 1 or len(cl2) != 1:
            problems.add(f"Leg {leg} lacks one complete paired HY3/CL2 identity")
        for other in cl2:
            if other["member"]:
                # A 12-character source ID can itself be protected. A longer
                # protected ID instead requires the original full D1 evidence.
                member_hashes.add(digest(other["member"]))
        alternatives = [athlete for member in hy3 for athlete in local[(member["number"], member["gender"])]]
        for athlete in alternatives:
            athlete_lines.add(athlete["line"])
            if athlete["member"]:
                member_hashes.add(digest(athlete["member"]))
        if len(alternatives) != 1:
            problems.add(f"Leg {leg} has missing or duplicate original D1 identity observations")
            continue
        athlete = alternatives[0]
        if (len(hy3) != 1 or len(cl2) != 1 or not athlete["member"]
                or athlete["gender"] not in ("F", "M", "X") or athlete["gender"] != cl2[0]["gender"]
                or athlete["member"][:12] != cl2[0]["member"]):
            problems.add(f"Leg {leg} original D1 identity disagrees with paired CL2 identity")
            continue
        # CL2 carries only 12 characters. Duplicate full IDs or competing full
        # IDs behind that prefix cannot establish one unique relay participant.
        if len(prefixes[cl2[0]["member"]]) != 1:
            problems.add(f"Leg {leg} CL2 member prefix is ambiguous in original D1 observations")
        paired_members.append(athlete["member"])
    if len(paired_members) != 4 or len(set(paired_members)) != 4:
        problems.add("Relay does not establish four distinct paired source members")
    protected = member_hashes.intersection(identity_holds)
    targets = {target for key in member_hashes for target in identities.get(key, set())}
    protected.update(key for key in identity_holds if targets.intersection(identities.get(key, set())))
    if not protected and not problems:
        return None
    return {"reason": ("Unresolved persistent source member identity hold; reviewed resolution required" if protected
                       else "Relay identity is incomplete or ambiguous while unresolved identity holds exist"),
            "sourceMemberIdHashes": sorted(protected), "identityHolds": [identity_holds[key] for key in sorted(protected)],
            "unresolvedIdentityHoldCount": len(identity_holds), "relayIdentityProblems": sorted(problems),
            "sourceAthleteLines": sorted(athlete_lines),
            **({"companionLine": companion["line"]} if companion else {})}


def historical_team(team, when, mappings):
    matches = [m for m in mappings if m["clubCode"] == team["clubCode"] and m["lscCode"] == team["lscCode"]
               and m["validFrom"] <= when <= m["validThrough"]
               and (not m.get("sourceNames") or team["name"] in m["sourceNames"])]
    if len(matches) != 1:
        raise ValueError("Historical team affiliation missing or ambiguous; review a dated mapping")
    return matches[0]


def canonical_meet(source, snapshots):
    """Resolve only an explicit reviewed crosswalk; never infer from names/dates."""
    binding = source.get("meetIdentity", {}).get("canonicalMeet")
    mid = binding["id"] if binding is not None else source["meetId"]
    current = snapshots.get("meets/" + mid)
    if binding is not None and current is None:
        raise ValueError("Reviewed canonical meet target is absent from baseline")
    if current is not None:
        nested = current.get("dates", {})
        if not isinstance(nested, dict):
            raise ValueError("Canonical meet date metadata is malformed")
        starts = [current.get("startsOn"), current.get("startDate"), nested.get("startDate")]
        ends = [current.get("endsOn"), current.get("endDate"), nested.get("endDate")]
        starts, ends = [date(v) for v in starts if v], [date(v) for v in ends if v]
        # Legacy date-only meets have one known day. For ranged meets `date`
        # is a display/reference day, so only the explicit endpoints bind it.
        if not starts and not ends and current.get("date"):
            starts = ends = [date(current["date"])]
        if (len(set(starts)) > 1 or len(set(ends)) > 1
                or any(v != source["meet"]["startsOn"] for v in starts)
                or any(v != source["meet"]["endsOn"] for v in ends)):
            raise ValueError("Canonical meet dates differ; reconcile before preparing races")
        if (binding is not None or "dateCrosswalk" in source.get("meetIdentity", {})) and (not starts or not ends):
            raise ValueError("Reviewed canonical meet crosswalk requires exact known date endpoints")
    return mid


def source_observation(source, parsed, result, companion):
    return {"url": source["url"], "archiveSha256": source["sha256"], "file": source["hy3"], "line": result["line"],
            **({"originalUrl": source["originalUrl"]} if "originalUrl" in source else {}),
            **({"dateCrosswalk": source["meetIdentity"]["dateCrosswalk"], "catalogDateMatch": False}
               if "dateCrosswalk" in source.get("meetIdentity", {}) else {}),
            "hy3Sha256": parsed["hy3Sha256"], "companionFile": source["cl2"], "companionSha256": parsed["cl2Sha256"],
            "companionLine": companion["line"], "capturedAt": source["capturedAt"], "eventNumber": result["eventNumber"],
            "originalTimeMs": result["sourceTimeMs"], "resultFlag": result["sourceFlag"], "precision": "hundredths",
            "sourceTimePresent": result.get("sourceTimePresent", True),
            "knowledgeMeetId": source["meetId"], "affiliation": {**result["team"], "observedOn": result["date"],
                "basis": "Official result C1 affiliation at this meet; no current-registration inference"}}


def source_evidence(body):
    """Legacy provenance accepts arbitrary JSON; only objects carry fields."""
    value = body.get("sourceObservation")
    return value if isinstance(value, dict) else {}


def race_origin(body, relay=False):
    lead_off = not relay and body.get("resultOrigin") == "relay_leadoff"
    return ("relay_leadoff" if lead_off else "individual", body.get("parentRelayResultId") if lead_off else None)


def race_key(body, relay=False):
    meet = body.get("meet", {})
    return (meet.get("id"), meet.get("date"), body.get("teamId") if relay else body.get("athleteId"),
            body.get("eventCode"), body.get("round"), body.get("relayName") if relay else None,
            body.get("ageGroup") if relay else None, body.get("gender") if relay else None,
            *race_origin(body, relay),
            body.get("raceIdentity", {}).get("occurrence", "single"))


def facts(body, relay=False):
    return (race_key(body, relay), body.get("timeMs"), body.get("status"), body.get("teamId"), body.get("isOfficial", True))


def provenance_key(observation, canonical_round):
    key = (observation.get("url"), observation.get("archiveSha256"), observation.get("file"),
           observation.get("line"), observation.get("sourceRound", canonical_round))
    if (not isinstance(key[0], str) or not key[0] or type(key[3]) is not int or key[3] < 1
            or any(value is not None and not isinstance(value, str) for value in (key[1], key[2], key[4]))):
        return None
    return key


def plan(manifest, baseline, snapshots, mappings, parsed_sources):
    teams, identity, identity_holds = mapping_tables(mappings, snapshots)
    holds, clean, duplicates = [], {}, []
    tally = collections.defaultdict(collections.Counter)
    dependencies = {}
    name_index = collections.defaultdict(set)
    known = {False: collections.defaultdict(list), True: collections.defaultdict(list)}
    source_rows = collections.defaultdict(list)
    current_athletes = {p.split("/")[1]: b for p, b in snapshots.items() if p.startswith("athletes/")}
    for path, body in snapshots.items():
        if path.startswith("athletes/"):
            n = body.get("name", {})
            for name in [n.get("first", "") + " " + n.get("last", "")] + body.get("aliases", []):
                name_index[normalize(name)].add(path.split("/")[1])
        for relay, root in ((False, "swims/"), (True, "relay_results/")):
            if path.startswith(root):
                known[relay][race_key(body, relay)].append(body)
                observation = source_evidence(body)
                provenance = provenance_key(observation, body.get("round"))
                if provenance is not None:
                    source_rows[(relay, race_origin(body, relay), provenance)].append(body)
    observations = collections.defaultdict(list)
    member_sources = collections.defaultdict(list)
    source_name_members = collections.defaultdict(set)
    for source, parsed in parsed_sources:
        for row in parsed["individuals"]:
            if row["athlete"]["member"]:
                observations[digest(row["athlete"]["member"])].append(row["athlete"])
                member_sources[digest(row["athlete"]["member"])].append({"url": source["url"], "archiveSha256": source["sha256"], "file": source["hy3"], "line": row["line"]})
                source_name_members[normalize(row["athlete"]["first"] + " " + row["athlete"]["last"])].add(digest(row["athlete"]["member"]))
    conflicts = {key for key, rows in observations.items() if
                 len({r["birthDate"] for r in rows if r["birthDate"]}) > 1 or
                 len({r["gender"] for r in rows}) > 1 or
                 len({normalize(r["first"] + " " + r["last"]) for r in rows}) > 1}

    def dependency(path, after):
        if path in snapshots:
            return
        if path in pending_dependencies and pending_dependencies[path] != after:
            raise ValueError("Conflicting prerequisite after-images")
        pending_dependencies[path] = after

    def accept(source, body, relay, requirements):
        path = ("relay_results/" if relay else "swims/") + body["id"]
        key = race_key(body, relay)
        if (relay, key) in blocked_occurrences:
            raise ValueError("Conflicting source occurrence remains held")
        existing = known[relay].get(key, []) or known[relay].get((*key[:-1], None), [])
        observation = body["sourceObservation"]
        provenance_rows = source_rows.get((relay, race_origin(body, relay), provenance_key(observation, body.get("round"))), [])
        if any(source_evidence(r).get("archiveSha256") == observation["archiveSha256"] and facts(r, relay) != facts(body, relay) for r in provenance_rows):
            raise ValueError("Previously imported exact source row differs; preserve it for reconciliation")
        same_id = snapshots.get(path)
        prepared_same = [(p, item) for p, item in clean.items() if p != path and race_key(item["after"], relay) == key
                         and p.startswith("relay_results/" if relay else "swims/")]
        if prepared_same:
            if len(prepared_same) == 1 and facts(prepared_same[0][1]["after"], relay) == facts(body, relay):
                duplicates.append({"sourceId": source["id"], "path": path, "existingId": prepared_same[0][0], "basis": "Same canonical occurrence already prepared"})
                tally[source["id"]]["duplicates"] += 1
                tally[source["id"]]["relayDuplicates" if relay else "individualDuplicates"] += 1
                return
            blocked_occurrences.add((relay, key))
            for prior_path, prior in prepared_same:
                clean.pop(prior_path)
                blocked.add(prior_path)
                holds.append(held("race", "Competing source aliases disagree on one occurrence; both held", path=prior_path, sourceId=prior["sourceId"]))
                tally[prior["sourceId"]]["heldRelays" if relay else "heldIndividuals"] += 1
            raise ValueError("Competing source aliases disagree on one occurrence; current row held")
        if same_id is not None and same_id in existing:
            existing = [same_id]
        if same_id is not None and same_id not in existing:
            raise ValueError("Stable result ID collides with a different existing race")
        if existing:
            previous_event = source_evidence(existing[0]).get("eventNumber")
            if len(existing) == 1 and facts(existing[0], relay) == facts(body, relay) and (not previous_event or previous_event == observation["eventNumber"]):
                duplicates.append({"sourceId": source["id"], "path": path, "existingId": existing[0].get("id"), "line": body["sourceObservation"]["line"]})
                tally[source["id"]]["duplicates"] += 1
                tally[source["id"]]["relayDuplicates" if relay else "individualDuplicates"] += 1
            else:
                raise ValueError("Existing canonical race differs or is ambiguous; additive preparation preserves it")
        elif path in clean:
            if facts(clean[path]["after"], relay) != facts(body, relay):
                prior = clean.pop(path)
                holds.append(held("race", "Conflicting repeated source result; both observations held", source,
                                  body["sourceObservation"]["line"], path=path, priorSourceId=prior["sourceId"]))
                blocked.add(path)
                tally[prior["sourceId"]]["heldRelays" if relay else "heldIndividuals"] += 1
                raise ValueError("Conflicting repeated source result; current observation held")
            else:
                duplicates.append({"sourceId": source["id"], "path": path, "line": body["sourceObservation"]["line"], "basis": "Identical stable source performance already prepared"})
                tally[source["id"]]["duplicates"] += 1
                tally[source["id"]]["relayDuplicates" if relay else "individualDuplicates"] += 1
        elif path in blocked:
            raise ValueError("Conflicting repeated source result remains held")
        else:
            clean[path] = {"path": path, "after": body, "sourceId": source["id"], "requires": sorted(set(requirements)),
                           "dependencyWrites": dict(pending_dependencies)}

    blocked = set()
    blocked_occurrences = set()
    for source, parsed in parsed_sources:
        sid = source["id"]
        tally[sid]["individualSourceRows"] = parsed["hy3ResultRows"]
        tally[sid]["relaySourceRows"] = parsed["hy3RelayRows"]
        tally[sid]["invalidIndividualRows"] = sum(p.get("code") == "E2" for p in parsed["holds"])
        tally[sid]["unparsedRelayRows"] = parsed["hy3RelayRows"] - len(parsed["relays"])
        for problem in parsed["holds"]:
            holds.append(held(problem["kind"], problem["reason"], source, problem.get("line")))
        individual_index = cl2_index(parsed["cl2"], False)
        relay_index = cl2_index(parsed["cl2"], True)
        paired = set()
        companion_usage = collections.Counter()
        for is_relay, candidate_rows in ((False, parsed["individuals"]), (True, parsed["relays"])):
            for result in candidate_rows:
                match, _ = match_companion(result, relay_index if is_relay else individual_index, is_relay)
                if match is None and not is_relay and result["sourceFlag"] in ("F", "R"):
                    match, _ = match_companion({**result, "status": "DFS", "timeMs": 0}, individual_index, False)
                if match:
                    companion_usage[(is_relay, match["line"], result["round"])] += 1
        contexts = collections.Counter((r["athlete"]["member"], r["eventNumber"], r["distance"], r["stroke"], r["course"], r["round"], r["date"]) for r in parsed["individuals"])
        for relay, rows in ((False, parsed["individuals"]), (True, parsed["relays"])):
            for row in rows:
                pending_dependencies = {}
                observed_companion, _ = match_companion(row, relay_index if relay else individual_index, relay)
                if observed_companion is None and not relay and row["sourceFlag"] in ("F", "R"):
                    observed_companion, _ = match_companion({**row, "status": "DFS", "timeMs": 0}, individual_index, False)
                if observed_companion and companion_usage[(relay, observed_companion["line"], row["round"])] == 1:
                    paired.add((relay, observed_companion["line"], row["round"]))
                if relay:
                    decision = relay_identity_hold(row, observed_companion, parsed.get("relayAthleteObservations", []), identity, identity_holds)
                    if decision:
                        holds.append(held("relay", decision.pop("reason"), source, row["line"], **decision))
                        tally[sid]["heldRelays"] += 1
                        continue
                    row_hashes = set()
                else:
                    row_hashes = {digest(row["athlete"]["member"])} if row["athlete"]["member"] else set()
                protected = sorted(row_hashes.intersection(identity_holds))
                if protected:
                    evidence = ({"sourceMemberIdHashes": protected, "identityHolds": [identity_holds[key] for key in protected]}
                                if relay else {"sourceMemberIdHash": protected[0], "identityHold": identity_holds[protected[0]]})
                    holds.append(held("relay" if relay else "individual",
                        "Unresolved persistent source member identity hold; reviewed resolution required", source, row["line"], **evidence))
                    tally[sid]["heldRelays" if relay else "heldIndividuals"] += 1
                    continue
                try:
                    if observed_companion and companion_usage[(relay, observed_companion["line"], row["round"])] != 1:
                        raise ValueError("One CL2 result matches multiple HY3 performances; stable source identity is ambiguous")
                    if row["round"] not in ("F", "P", "S") or row["status"] not in ("OK", "DQ", "NS", "DFS"):
                        raise ValueError("Unsupported round/status (including DNF); preserve for manual review")
                    round_mapping = source.get("roundMappings", {}).get(row["round"])
                    canonical_round = round_mapping["round"] if round_mapping else row["round"]
                    if row["round"] == "S" and not round_mapping:
                        raise ValueError("Source S round requires reviewed semifinal/swim-off interpretation")
                    occurrence = [mapping for mapping in source.get("occurrenceMappings", [])
                                  if mapping.get("line") == row["line"] and mapping.get("sourceRound") == row["round"]]
                    if occurrence:
                        if len(occurrence) != 1 or occurrence[0].get("reviewed") is not True or not occurrence[0].get("basis"):
                            raise ValueError("Distinct starts require one reviewed occurrence mapping")
                        chosen = occurrence[0]
                        if not re.fullmatch(r"[a-zA-Z0-9_:-]{1,128}", chosen.get("occurrence", "")):
                            raise ValueError("Invalid occurrence token")
                        url(chosen["sourceUrl"])
                        race_identity = {k: chosen[k] for k in ("occurrence", "reviewed", "basis", "sourceUrl")}
                    elif canonical_round in ("S", "TT"):
                        raise ValueError("Ambiguous/repeated rounds require a reviewed occurrence mapping")
                    else:
                        race_identity = {"occurrence": "single", "reviewed": True,
                            "basis": "Single paired HY3/CL2 occurrence; alternate starts must be separately reviewed", "sourceUrl": source["url"]}
                    if row["sourceFlag"] == "S" and source.get("numericSFlagReviewed") is not True:
                        raise ValueError("Numeric S result flag eligibility requires explicit source review")
                    if row["course"] not in ("SCY", "SCM", "LCM") or row["stroke"] not in (STROKES.values() if not relay else ("FR", "IM")):
                        raise ValueError("Missing authoritative course or stroke")
                    if not row["date"] or not source["meet"]["startsOn"] <= row["date"] <= source["meet"]["endsOn"]:
                        raise ValueError("Race date outside selected meet")
                    if row["status"] == "OK" and row["timeMs"] <= 0:
                        raise ValueError("OK result lacks a positive exact time")
                    if not row["eventNumber"]:
                        raise ValueError("Missing stable source event identity")
                    if relay and (row["distance"] not in (100, 200, 400, 800) or row.get("gender") not in ("F", "M", "X") or not row.get("relayName")):
                        raise ValueError("Unsupported relay distance, category, or squad identity")
                    if not relay and (row["distance"] not in (25, 50, 100, 200, 400, 500, 800, 1000, 1500, 1650) or not row["eventNumber"]):
                        raise ValueError("Missing event identity or unsupported individual distance")
                    # Companion DFS distinguishes declarations from the ambiguous HY3 flag.
                    if not relay and row["sourceFlag"] in ("F", "R"):
                        probe = {**row, "status": "DFS", "timeMs": 0}
                        companion, _ = match_companion(probe, individual_index, False)
                        if companion is not None:
                            row = probe
                    companion, error = match_companion(row, relay_index if relay else individual_index, relay)
                    if error:
                        raise ValueError(error)
                    if not relay and companion.get("gender") != row["athlete"]["gender"]:
                        raise ValueError("Companion athlete category disagrees with the HY3 identity")
                    mapping = historical_team(row["team"], row["date"], teams)
                    tid = mapping["teamId"]
                    team_path = "teams/" + tid
                    dependency(team_path, {"id": tid, "name": mapping.get("name", row["team"]["name"]),
                        "sourceObservation": {"identityBasis": "Reviewed canonical team identity; historical codes and affiliations remain on each result"}})
                    mid = canonical_meet(source, snapshots)
                    meet_path = "meets/" + mid
                    dependency(meet_path, {"id": mid, "name": source["meet"]["name"], "startsOn": source["meet"]["startsOn"],
                        "endsOn": source["meet"]["endsOn"], "sourceUrl": source["meet"].get("sourceUrl") or min(s["url"] for s in manifest["sources"] if s["meetId"] == source["meetId"] and s.get("available") is not False),
                        "knowledgeEntryId": source["meetId"]})
                    evidence = source_observation(source, parsed, row, companion)
                    if source.get("meetIdentity", {}).get("canonicalMeet") is not None:
                        evidence["canonicalMeetCrosswalk"] = source["meetIdentity"]["canonicalMeet"]
                    evidence["affiliation"]["mappingBasis"] = mapping["basis"]
                    evidence["affiliation"]["mappingSourceUrl"] = mapping["sourceUrl"]
                    evidence["officialBasis"] = source["officialBasis"]
                    evidence["sourceRound"] = row["round"]
                    if round_mapping:
                        evidence["roundMapping"] = round_mapping
                    body = {"teamId": tid, "gender": row.get("gender") if relay else row["athlete"]["gender"],
                        "distance": row["distance"], "stroke": row["stroke"], "course": row["course"], "round": canonical_round,
                        "status": row["status"], "timeMs": row["timeMs"], "timeDisplay": display(row["timeMs"]) if row["status"] == "OK" else row["status"],
                        "isOfficial": True, "isRelay": relay, "meet": {"id": mid, "name": source["meet"]["name"], "date": row["date"]},
                        "metadata": {"source": "hytek_hy3", "createdAt": source["capturedAt"]}, "sourceObservation": evidence,
                        "raceIdentity": race_identity}
                    requirements = [team_path, meet_path]
                    if relay:
                        other = companion["results"][row["round"]]
                        body.update({"relayName": row["relayName"], "ageGroup": _relay_helper.age_label(row["ageMinimum"], row["ageMaximum"]), "members": []})
                        evidence["heat"], evidence["lane"] = other["heat"], other["lane"]
                        event = f"{row['distance']}_{'FR' if row['stroke'] == 'FR' else 'MED'}-R_{row['course']}"
                        result_identity = [mid, tid, row["relayName"], row["eventNumber"], row["gender"], row["ageMinimum"], row["ageMaximum"],
                                           row["distance"], row["stroke"], row["course"], row["round"], row["date"], other["heat"], other["lane"]]
                        if race_identity["occurrence"] != "single":
                            result_identity.append("occurrence:" + race_identity["occurrence"])
                        # Match the established relay IDs; lineups are evidence only
                        # until both exports establish stable identities and order.
                        body["id"] = "hytek_relay_" + digest("|".join(map(str, result_identity)))
                        local = {(a["team"]["lscCode"], a["team"]["clubCode"], a["number"], a["gender"]): a for a in parsed["athletes"]}
                        bound = {key: next(iter(ids)) for key, ids in identity.items()
                                 if len(ids) == 1 and key not in conflicts and key not in identity_holds}
                        body["members"], member_errors = _relay_helper.member_lineup(row, companion, local, bound, current_athletes)
                        body["lineupCoverage"] = "complete" if len(body["members"]) == 4 and not member_errors else "partial" if body["members"] else "unavailable"
                        for member in body["members"]:
                            if member.get("athleteId"):
                                requirements.append("athletes/" + member["athleteId"])
                        for problem in member_errors:
                            holds.append(held("relay_lineup", problem, source, row["line"], resultId=body["id"]))
                        holds.append(held("lead_off", "No individual lead-off created without separately reviewed timing/start eligibility", source, row["line"], resultId=body["id"]))
                    else:
                        athlete = row["athlete"]
                        if not athlete["member"]:
                            raise ValueError("Missing stable source member identity")
                        member_hash = digest(athlete["member"])
                        if member_hash in conflicts or athlete["gender"] not in ("F", "M", "X"):
                            raise ValueError("Conflicting stable identity demographics across source archives")
                        context = (athlete["member"], row["eventNumber"], row["distance"], row["stroke"], row["course"], row["round"], row["date"])
                        if contexts[context] != 1 and not occurrence:
                            raise ValueError("Repeated same-event round lacks distinct stable race identity; do not collapse swim-offs")
                        targets = identity.get(member_hash, set())
                        if len(targets) > 1:
                            raise ValueError("Stable member identity maps to multiple canonical athletes")
                        if targets:
                            aid = next(iter(targets))
                        else:
                            candidates = set()
                            for first in (athlete["first"], athlete["preferred"]):
                                if first:
                                    candidates.update(name_index[normalize(first + " " + athlete["last"])])
                            if candidates or len(source_name_members[normalize(athlete["first"] + " " + athlete["last"])]) > 1:
                                raise ValueError("Name overlap without stable identity confirmation; reviewed mapping required")
                            aid = "hytek_ath_" + member_hash
                        if not athlete["first"] or not athlete["last"]:
                            raise ValueError("Missing source athlete name")
                        births = {r["birthDate"] for r in observations[member_hash] if r["birthDate"]}
                        if len(births) != 1:
                            raise ValueError("Exact race-day age lacks consistent source DOB evidence")
                        born = dt.date.fromisoformat(iso_date(next(iter(births))))
                        when = dt.date.fromisoformat(row["date"])
                        age = when.year - born.year - ((when.month, when.day) < (born.month, born.day))
                        if not 0 <= age <= 120:
                            raise ValueError("Invalid exact race-day age")
                        athlete_path = "athletes/" + aid
                        canonical_name = min((r["first"], r["last"]) for r in observations[member_hash])
                        dependency(athlete_path, {"id": aid, "name": {"first": canonical_name[0], "last": canonical_name[1]},
                            "gender": athlete["gender"], "aliases": sorted({r["first"] + " " + r["last"] for r in observations[member_hash]}),
                            "sourceObservation": {"memberIdHash": member_hash, "sources": sorted(member_sources[member_hash], key=lambda r: (r["url"], r["line"]))[:16],
                                "sourceReferenceCount": len(member_sources[member_hash]),
                                "identityBasis": "Stable source member identity; historical competitor, current registration unverified"}})
                        body.update({"athleteId": aid, "athleteName": {"first": athlete["first"], "last": athlete["last"]}, "ageAtSwim": age,
                                     "ageGroup": "8&U" if age <= 8 else "9-10" if age <= 10 else "11-12" if age <= 12 else "13-14" if age <= 14 else "15-16" if age <= 16 else "17-18" if age <= 18 else "Open"})
                        event = f"{row['distance']}_{row['stroke']}_{row['course']}"
                        # Reviewed alternate source member IDs share one canonical
                        # person. Historical team/code changes never create a
                        # second athlete or a second copy of the same race.
                        stable = [mid, aid, row["eventNumber"], event, canonical_round, row["date"]]
                        if race_identity["occurrence"] != "single":
                            stable.append("occurrence:" + race_identity["occurrence"])
                        body["id"] = "hytek_race_" + digest("|".join(stable))
                        body["externalResult"] = {"namespace": "hytek", "id": digest("|".join(stable))}
                        evidence["memberIdHash"] = member_hash
                        evidence["ageBasis"] = "Exact race-day age from consistent private source DOB; no DOB or member identifier in proposal"
                        requirements.append(athlete_path)
                    body["eventCode"] = event
                    splits, coverage, split_errors = verified_splits(row, companion, relay)
                    if row["status"] in ("NS", "DFS"):
                        if splits or any(p.get("timeMs", 0) > 0 for p in row["hy3Splits"]):
                            split_errors.append("NS/DFS source contains timing detail; no race splits or lap eligibility inferred")
                        splits, coverage = [], "unavailable"
                    body["splits"], body["splitCoverage"] = splits, coverage
                    for problem in split_errors:
                        holds.append(held("splits", problem, source, row["line"], resultId=body["id"]))
                    accept(source, body, relay, requirements)
                except (ValueError, KeyError, TypeError) as error:
                    holds.append(held("relay" if relay else "individual", str(error), source, row.get("line")))
                    tally[sid]["heldRelays" if relay else "heldIndividuals"] += 1
        for relay, companion_rows in ((False, parsed["cl2"]["individuals"]), (True, parsed["cl2"]["relays"])):
            for companion in companion_rows:
                for raw_round in companion["results"]:
                    tally[sid]["companionResults"] += 1
                    if (relay, companion["line"], raw_round) in paired:
                        tally[sid]["pairedCompanionResults"] += 1
                    else:
                        tally[sid]["unpairedCompanionResults"] += 1
                        holds.append(held("companion_gap", "CL2 result lacks an unambiguous matching HY3 result; preserve source coverage gap", source,
                            companionFile=source["cl2"], companionLine=companion["line"], sourceRound=raw_round, relay=relay))
    versions = collections.defaultdict(set)
    for item in clean.values():
        for path, body in item["dependencyWrites"].items():
            versions[path].add(encode(body))
    conflicting_dependencies = {p for p, images in versions.items() if len(images) > 1}
    for path, item in list(clean.items()):
        if conflicting_dependencies.intersection(item["requires"]):
            clean.pop(path)
            holds.append(held("prerequisite", "Conflicting clean prerequisite identity proposals; affected results held", path=path, sourceId=item["sourceId"]))
            tally[item["sourceId"]]["heldRelays" if path.startswith("relay_results/") else "heldIndividuals"] += 1
    # Held rows never leave prerequisite drafts behind to poison unrelated work.
    dependencies = {p: body for item in clean.values() for p, body in item["dependencyWrites"].items()}
    for item in clean.values():
        tally[item["sourceId"]]["preparedRelays" if item["path"].startswith("relay_results/") else "preparedIndividuals"] += 1
    for sid, counts in tally.items():
        counts["individualRowsAccountedFor"] = sum(counts[k] for k in ("preparedIndividuals", "heldIndividuals", "invalidIndividualRows", "individualDuplicates"))
        counts["relayRowsAccountedFor"] = sum(counts[k] for k in ("preparedRelays", "heldRelays", "unparsedRelayRows", "relayDuplicates"))
        if counts["individualRowsAccountedFor"] != counts["individualSourceRows"] or counts["relayRowsAccountedFor"] != counts["relaySourceRows"]:
            raise ValueError("Source result row accounting failed for " + sid)
    return clean, dependencies, holds, duplicates, tally


def baseline_identity_audit(snapshots, baseline):
    members = collections.defaultdict(set)
    occurrences = collections.defaultdict(list)
    unknown_provenance = []
    for path, body in snapshots.items():
        member_hash = source_evidence(body).get("memberIdHash")
        if path.startswith("athletes/") and isinstance(member_hash, str) and re.fullmatch(r"[a-f0-9]{24}", member_hash):
            members[member_hash].add(path.split("/")[1])
        observation = source_evidence(body)
        if "sourceObservation" in body and not isinstance(body["sourceObservation"], dict):
            unknown_provenance.append({"path": path, "reason": "Legacy sourceObservation is not an object; no source identity or provenance inferred"})
        elif ("url" in observation or "line" in observation) and provenance_key(observation, body.get("round")) is None:
            unknown_provenance.append({"path": path, "reason": "Legacy source row provenance has unsupported field types or an incomplete location; no exact source-row binding inferred"})
        if path.startswith(("swims/", "relay_results/")):
            relay = path.startswith("relay_results/")
            key = race_key(body, relay)
            occurrences[(relay, *key[:-1])].append((path, key[-1]))
    for row in baseline.get("identityClaims", {}).get("athletes", []):
        claim = row.get("data", row)
        if claim.get("namespace") == "hytek-member":
            members[claim["sourceId"]].add(claim["athleteId"])
    registered = {(row.get("data", row)["kind"], row.get("data", row)["resultId"])
                  for row in baseline.get("identityClaims", {}).get("occurrences", [])}
    conflicts = []
    for (relay, *_), rows in occurrences.items():
        if len(rows) > 1 and (len({token for _, token in rows}) != len(rows)
            or any(("relay" if relay else "swim", path.split("/")[1]) not in registered for path, _ in rows)):
            conflicts.append({"paths": sorted(path for path, _ in rows), "reason": "Overlapping legacy or conflicting occurrence identities; reviewed evidence required"})
    return {"canonicalRevision": baseline.get("canonicalRevision"), "mutationsPerformed": False,
            "unknownLegacyProvenance": sorted(unknown_provenance, key=lambda row: row["path"]),
            "stableMemberConflicts": [{"sourceMemberIdHash": key, "athleteIds": sorted(ids)} for key, ids in sorted(members.items()) if len(ids) > 1],
            "unresolvedOccurrences": sorted(conflicts, key=lambda row: row["paths"]),
            "basis": "Private canonical inventory and exported identity claims. No name/time merge or automatic claim backfill."}


def audit(snapshots, clean, team_mappings):
    """Candidate audit for every IES team; never claims exhaustive record books."""
    ies = {p.split("/")[1] for p, b in snapshots.items() if p.startswith("teams/") and b.get("lscCode") == "IE"}
    ies.update(m["teamId"] for m in team_mappings if m["lscCode"] == "IE")
    output = {tid: {"teamId": tid, "coverage": "partial", "candidateRecords": {}, "relayCandidates": {}, "unverifiedAffiliationRows": 0, "eligibleRows": 0, "eligibleRelays": 0} for tid in sorted(ies)}
    rows = [b for p, b in snapshots.items() if p.startswith(("swims/", "relay_results/"))] + [v["after"] for v in clean.values()]
    for body in rows:
        tid = body.get("teamId")
        if tid not in output:
            continue
        row = output[tid]
        affiliation = source_evidence(body).get("affiliation", {})
        affiliation = affiliation if isinstance(affiliation, dict) else {}
        when = body.get("meet", {}).get("date", "")
        lsc = affiliation.get("lscCode") if affiliation.get("observedOn") == when else None
        if lsc is None:
            matches = [m for m in team_mappings if m["teamId"] == tid and m["validFrom"] <= when <= m["validThrough"]]
            if len(matches) == 1:
                lsc = matches[0]["lscCode"]
        if lsc is None:
            row["unverifiedAffiliationRows"] += 1
            continue
        if lsc != "IE" or body.get("status") != "OK" or body.get("isOfficial") is not True or body.get("timeMs", 0) <= 0 or body.get("resultOrigin"):
            continue
        relay = body.get("isRelay") is True
        row["eligibleRelays" if relay else "eligibleRows"] += 1
        key = "|".join(str(body.get(k, "unknown")) for k in ("eventCode", "gender", "ageGroup" if relay else "ageAtSwim"))
        target = row["relayCandidates" if relay else "candidateRecords"]
        current = target.get(key)
        candidate = {"timeMs": body["timeMs"], "raceIds": [body["id"]]}
        if current is None or candidate["timeMs"] < current["timeMs"]:
            target[key] = candidate
        elif candidate["timeMs"] == current["timeMs"]:
            current["raceIds"].append(body["id"])
    return {"kind": "local_candidate_inventory", "officialWebsiteComparison": {"performed": False, "sources": []},
            "historicalIesInventoryComplete": False,
            "scope": "Computed candidates from supplied baseline/proposals for represented IE teams only. No official record website or record book comparison performed; not a complete historical IES inventory or completed record audit. Individual exact-age and relay candidates are separate; lead-offs need separate eligibility review.",
            "teams": list(output.values())}


def batches(clean, dependencies, snapshots, manifest, baseline, output, inputs):
    listing = []
    source_by_id = {s["id"]: s for s in manifest["sources"]}
    groups = [("prerequisites", None, [{"path": p, "after": b, "requires": []} for p, b in sorted(dependencies.items()) if p.startswith(("teams/", "meets/"))]),
              ("athletes", None, [{"path": p, "after": b, "requires": []} for p, b in sorted(dependencies.items()) if p.startswith("athletes/")])]
    groups.extend(("races", sid, [v for _, v in sorted(clean.items()) if v["sourceId"] == sid]) for sid in sorted(source_by_id))
    planned = {**snapshots, **dependencies}
    producer = {}
    for phase, sid, items in groups:
        while items:
            chunk = []
            while items and len(chunk) < 100:
                trial = chunk + [items[0]]
                payload = make_batch(trial, sid, source_by_id, baseline, snapshots, planned, phase, inputs)
                if len(encode(payload)) >= 1_900_000:
                    if not chunk:
                        raise ValueError("One proposal exceeds bounded batch size")
                    break
                chunk.append(items.pop(0))
            payload = make_batch(chunk, sid, source_by_id, baseline, snapshots, planned, phase, inputs)
            name = f"batches/{len(listing) + 1:04d}.json"
            save(output / name, payload)
            required = sorted({producer[p] for item in chunk for p in item["requires"] if p in producer})
            listing.append({"file": name, "sha256": sha((output / name).read_bytes()), "phase": phase, "writes": len(chunk),
                            "requiresBatches": required, "sourceId": sid})
            for item in chunk:
                producer[item["path"]] = name
    return listing


def make_batch(chunk, sid, sources, baseline, snapshots, planned, phase, inputs):
    own = {item["path"] for item in chunk}
    requirements = {p for item in chunk for p in item["requires"]} - own
    reads = [{"path": p, "before": snapshots.get(p)} for p in sorted(own)]
    reads.extend({"path": p, "before": planned[p]} for p in sorted(requirements))
    source = sources[sid] if sid else next(s for s in sources.values() if s.get("available") is not False)
    campaign = baseline.get("_scope") == "whole-catalog"
    aliases = [item for item in baseline.get("_reviewedAliases", []) if any(
        row["after"].get("athleteId") == item["athleteId"] and source_evidence(row["after"]).get("memberIdHash") == item["sourceId"] for row in chunk)]
    return {"division": "times", "scope": f"{'Whole-catalog' if campaign else 'Pilot'} race preparation: {phase}" + (f" | {source['meet']['name']}" if sid else ""),
            "sourceUrl": source["url"], "capturedAt": source["capturedAt"], "coverage": "partial",
            "evidence": {"method": "Official paired HY3/CL2; additive proposals only; human staff review required",
                "project": baseline["project"], "baselineCapturedAt": baseline["capturedAt"], "baselineComplete": complete(baseline),
                "baselineCounts": baseline.get("collectionCounts"),
                "baselineRecordsSha256": inputs["canonicalInventory"],
                "identityGuard": {"version": 1, "revision": baseline.get("canonicalRevision"), "athleteAliases": aliases},
                "catalogScope": "whole-catalog" if campaign else "pilot",
                "selectedMeetIds": baseline.get("_selectedMeetIds", []),
                "inputHashes": inputs,
                "sourceManifestRequired": True, "phase": phase, "automaticApproval": False},
            "writes": [{"path": item["path"], "after": item["after"]} for item in chunk], "reads": reads}


def prepare(sources_path, baseline_path, mappings_path, output, resume=False):
    output = Path(output).resolve()
    if not output.is_relative_to(PRIVATE_ROOT.resolve()) or output == PRIVATE_ROOT.resolve():
        raise ValueError("Output must be a new private directory below this checkout's ignored backups/")
    if (output / "staging-receipts.json").exists():
        raise ValueError("Never regenerate a staged run; use a fresh baseline and directory")
    source_bytes = Path(sources_path).read_bytes()
    baseline, baseline_bytes = load_baseline(baseline_path)
    mapping_bytes = Path(mappings_path).read_bytes() if mappings_path else encode({"teams": [], "identities": []})
    manifest, mappings = json.loads(source_bytes), json.loads(mapping_bytes)
    identity_hold_table(mappings)
    validate_sources(manifest)
    snapshots = records(baseline)
    if manifest["project"] != baseline["project"]:
        raise ValueError("Source and baseline project targets differ")
    baseline["_scope"] = manifest.get("scope", "pilot")
    baseline["_selectedMeetIds"] = sorted(manifest["selectedMeetIds"])
    if manifest.get("scope") == "whole-catalog":
        if not revision_verified(baseline) or baseline.get("catalogComplete") is not True or baseline.get("catalogCount") != len(baseline.get("catalog", [])):
            raise ValueError("Whole-catalog preparation requires a consistent full catalog")
        if sorted(row["id"] for row in baseline["catalog"]) != baseline["_selectedMeetIds"] or manifest.get("catalogRevision") != baseline.get("canonicalRevision"):
            raise ValueError("Whole-catalog scope omits or changes a listed meet; regenerate scope from the current export")
    baseline["_reviewedAliases"] = [{"namespace": "hytek-member", "sourceId": item["sourceMemberIdHash"],
        "athleteId": item["athleteId"], "reviewed": item.get("reviewed"), "basis": item.get("basis"), "sourceUrl": item.get("sourceUrl")}
        for item in mappings.get("identities", [])]
    mappings = {**mappings, "_canonicalClaims": [row.get("data", row) for row in baseline.get("identityClaims", {}).get("athletes", [])]}
    inputs = {"sources": sha(source_bytes), "baseline": sha(baseline_bytes),
              "mappings": sha(mapping_bytes), "code": sha(Path(__file__).read_bytes()),
              "baselineLoader": sha((Path(__file__).parent / "race_baseline.py").read_bytes()),
              "canonicalInventory": sha(encode(snapshots)),
              "parser": sha((ROOT / "scripts/swim-resources/lib/hytek_relays.py").read_bytes()),
              "relayHelper": sha((ROOT / "scripts/swim-resources/prepare-ies-relays.py").read_bytes())}
    run_id = sha(encode(inputs))
    checkpoint_path = output / "checkpoint.json"
    if output.exists() and any(output.iterdir()):
        if not resume or not checkpoint_path.exists():
            raise ValueError("Output is nonempty; resume the identical run or choose a new directory")
        checkpoint = read(checkpoint_path)
        if checkpoint.get("runId") != run_id:
            raise ValueError("Resume inputs/code changed; use a new run directory")
    else:
        output.mkdir(parents=True, mode=0o700, exist_ok=True)
        checkpoint = {"version": VERSION, "runId": run_id, "completedSources": {}, "status": "preparing"}
        save(checkpoint_path, checkpoint)
    parsed_sources, holds, receipts = [], [], []
    for source in sorted(manifest["sources"], key=lambda s: s["id"]):
        if source.get("available") is False:
            holds.append(held("pending_source" if source.get("receiptStatus") == "pending" else "unavailable_source", source["reason"], source))
            continue
        cache_path = output / "source-cache" / (source["id"] + ".json")
        # Re-hash original bytes even when resuming a completed source.
        archive = Path(source["file"])
        archive = archive if archive.is_absolute() else Path(sources_path).parent / archive
        try:
            if sha(archive.read_bytes()) != source["sha256"]:
                raise ValueError("Archive SHA-256 differs from explicit source manifest")
            saved = checkpoint["completedSources"].get(source["id"])
            if saved:
                if not cache_path.exists() or sha(cache_path.read_bytes()) != saved["sha256"]:
                    raise ValueError("Completed checkpoint cache was changed or lost")
                parsed = read(cache_path)
            else:
                parsed = read_source(source, Path(sources_path).parent)
            validate_source_dates(source, parsed, baseline, Path(sources_path).parent)
            if not saved:
                save(cache_path, parsed)
                checkpoint["completedSources"][source["id"]] = {"file": str(cache_path.relative_to(output)), "sha256": sha(cache_path.read_bytes())}
                save(checkpoint_path, checkpoint)
            parsed_sources.append((source, parsed))
            receipts.append({**source, "hy3Sha256": parsed["hy3Sha256"], "cl2Sha256": parsed["cl2Sha256"]})
        except (ValueError, KeyError, OSError, zipfile.BadZipFile) as error:
            if source["id"] in checkpoint["completedSources"]:
                raise ValueError("Resumed source integrity failed: " + str(error)) from error
            holds.append(held("source", str(error), source))
    clean, dependencies, row_holds, duplicates, tally = plan(manifest, baseline, snapshots, mappings, parsed_sources)
    holds.extend(row_holds)
    listing = batches(clean, dependencies, snapshots, manifest, baseline, output, inputs)
    save(output / "manual-review.json", holds)
    save(output / "duplicates.json", duplicates)
    verified = {s["id"]: s for s in receipts}
    save(output / "source-manifest.json", {"version": VERSION, "project": manifest["project"], "selectedMeetIds": manifest["selectedMeetIds"],
        "sources": [{**verified.get(s["id"], s), "validation": "verified" if s["id"] in verified else "blocked"} for s in manifest["sources"]]})
    save(output / "record-audit.json", audit(snapshots, clean, mappings.get("teams", [])))
    save(output / "baseline-identity-audit.json", baseline_identity_audit(snapshots, baseline))
    summary = {"selectedMeets": len(manifest["selectedMeetIds"]), "sourcesValidated": len(receipts), "sourcesBlocked": len(manifest["sources"]) - len(receipts),
               "individualsPrepared": sum(p.startswith("swims/") for p in clean), "relaysPrepared": sum(p.startswith("relay_results/") for p in clean),
               "prerequisites": len(dependencies), "duplicateRows": sum(v["duplicates"] for v in tally.values()), "reviewItems": len(holds), "batches": len(listing),
               "reconciliation": {sid: dict(counts) for sid, counts in sorted(tally.items())}}
    summary["meetCoverage"] = [{"meetId": mid, "requestedScope": "Every swimmer at the listed meet, including visiting teams",
        "suppliedSourceScopes": [s.get("sourceScope", {"kind": "unavailable", "basis": s.get("reason")}) for s in manifest["sources"] if s["meetId"] == mid],
        "observedIndividualRows": sum(tally[s["id"]]["individualSourceRows"] for s in manifest["sources"] if s["meetId"] == mid),
        "observedRelayRows": sum(tally[s["id"]]["relaySourceRows"] for s in manifest["sources"] if s["meetId"] == mid),
        "meetWideCompletenessVerified": False, "status": "partial",
        "remaining": "Compare all supplied archives and held rows with the official full meet result listing, including PDF-only swimmers/relays. No full-meet completion asserted."}
        for mid in manifest["selectedMeetIds"]]
    launch_blockers = ["Fresh complete baseline preflight and staff pilot review required; no staging or approval performed"]
    if not complete(baseline):
        launch_blockers.append("Baseline collection completeness is unverified; artifacts are offline proposals only")
    if not revision_verified(baseline):
        launch_blockers.append("Consistent private baseline export and canonical revision are required before staging")
    artifacts = {name: sha((output / name).read_bytes()) for name in ("manual-review.json", "duplicates.json", "source-manifest.json", "record-audit.json", "baseline-identity-audit.json")}
    result = {"version": VERSION, "runId": run_id, "project": baseline["project"], "baselineCapturedAt": baseline["capturedAt"],
              "canonicalRevision": baseline.get("canonicalRevision"), "catalogScope": manifest.get("scope", "pilot"),
              "baselineComplete": complete(baseline), "baselineRecordsSha256": inputs["canonicalInventory"], "inputs": inputs,
              "summary": summary, "batches": listing, "artifacts": artifacts, "launchBlockers": launch_blockers, "dryRun": True, "staged": False, "approved": False}
    crosswalks = [{"sourceId": source["id"], "meetId": source["meetId"], "dateCrosswalk": source["meetIdentity"]["dateCrosswalk"]}
                 for source in manifest["sources"] if "dateCrosswalk" in source.get("meetIdentity", {})]
    if crosswalks:
        result["dateCrosswalks"] = crosswalks
    save(output / "manifest.json", result)
    checkpoint["status"] = "prepared"
    save(checkpoint_path, checkpoint)
    return result


def preflight(prepared, baseline_path, max_hours=24, phase=None):
    prepared = Path(prepared)
    manifest, baseline = read(prepared), read(baseline_path)
    snapshots = records(baseline)
    if not revision_verified(baseline):
        return {"ready": False, "blockers": ["Use the consistent private baseline export with a canonical revision"], "mismatches": []}
    if baseline["canonicalRevision"] != manifest.get("canonicalRevision"):
        return {"ready": False, "blockers": ["Canonical revision changed; reprepare before the next approval"], "mismatches": []}
    blockers, mismatches = [], []
    if baseline["project"] != manifest["project"]:
        blockers.append("Project target differs")
    if not complete(baseline):
        blockers.append("Fresh baseline must attest completeCollections for all five collections")
    if manifest.get("baselineComplete") is not True:
        blockers.append("Preparation used a partial/unattested baseline; reprepare with a complete baseline")
    preparation_age = dt.datetime.now(dt.timezone.utc) - timestamp(manifest["baselineCapturedAt"])
    if preparation_age.total_seconds() < -300 or preparation_age.total_seconds() > max_hours * 3600:
        blockers.append("Prepared baseline is stale; refresh and reprepare")
    age = dt.datetime.now(dt.timezone.utc) - timestamp(baseline["capturedAt"])
    if age.total_seconds() < -300 or age.total_seconds() > max_hours * 3600:
        blockers.append("Baseline timestamp is future-dated or exceeds freshness budget")
    for name, expected in manifest["artifacts"].items():
        if sha((prepared.parent / name).read_bytes()) != expected:
            blockers.append("Prepared artifact changed: " + name)
    # Compare the full canonical inventory, not only listed read paths. A newly
    # added race under another ID or a new identity alias also requires re-prep.
    # Exact prepared parent additions are the sole allowed inventory delta.
    normalized = dict(snapshots)
    for batch in manifest["batches"]:
        path = prepared.parent / batch["file"]
        if sha(path.read_bytes()) != batch["sha256"]:
            continue
        payload = read(path)
        new_paths = {r["path"] for r in payload["reads"] if r["before"] is None}
        for write in payload["writes"]:
            if write["path"].split("/")[0] in ("teams", "meets", "athletes") and write["path"] in new_paths and normalized.get(write["path"]) == write["after"]:
                normalized.pop(write["path"])
    if sha(encode(normalized)) != manifest.get("baselineRecordsSha256"):
        blockers.append("Canonical inventory changed beyond exact prepared prerequisites; reprepare to recheck identities and duplicates")
    selected = [b for b in manifest["batches"] if phase is None or b["phase"] == phase]
    for batch in selected:
        path = prepared.parent / batch["file"]
        if sha(path.read_bytes()) != batch["sha256"]:
            blockers.append("Prepared batch changed: " + batch["file"])
            continue
        payload = read(path)
        for row in payload["reads"]:
            if snapshots.get(row["path"]) != row["before"]:
                mismatches.append({"batch": batch["file"], "path": row["path"], "reason": "Stale baseline or prerequisite not yet approved"})
    return {"ready": not blockers and not mismatches, "blockers": blockers, "mismatches": mismatches,
            "batchesChecked": len(selected), "phase": phase, "dataWritten": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prep = commands.add_parser("prepare", help="Write only private local proposals; never stage")
    prep.add_argument("--sources", type=Path, required=True)
    prep.add_argument("--baseline", type=Path, required=True)
    prep.add_argument("--mappings", type=Path)
    prep.add_argument("--output", type=Path, required=True)
    prep.add_argument("--dry-run", action="store_true", required=True)
    prep.add_argument("--resume", action="store_true")
    scope = commands.add_parser("catalog-scope", help="List every exported catalog meet with pending source receipts; no acquisition")
    scope.add_argument("--baseline", type=Path, required=True)
    scope.add_argument("--output", type=Path, required=True)
    check = commands.add_parser("check-baseline", help="Read-only freshness, integrity, and prerequisite checks")
    check.add_argument("--prepared", type=Path, required=True)
    check.add_argument("--baseline", type=Path, required=True)
    check.add_argument("--max-baseline-hours", type=int, default=24, choices=range(1, 25))
    check.add_argument("--phase", choices=("prerequisites", "athletes", "races"), required=True)
    args = parser.parse_args()
    if args.command == "catalog-scope":
        print(json.dumps(catalog_scope(args.baseline, args.output), indent=2))
    elif args.command == "prepare":
        result = prepare(args.sources, args.baseline, args.mappings, args.output, args.resume)
        print(json.dumps({"summary": result["summary"], "launchBlockers": result["launchBlockers"], "dryRun": True}, indent=2))
    else:
        result = preflight(args.prepared, args.baseline, args.max_baseline_hours, args.phase)
        print(json.dumps(result, indent=2))
        if not result["ready"]:
            raise SystemExit(2)
