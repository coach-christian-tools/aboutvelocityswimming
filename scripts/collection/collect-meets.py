#!/usr/bin/env python3
"""Catalog and index public IES meets, then prepare bounded review proposals.

No command publishes, applies migrations, imports swimmers, or contacts hosts.
Live approved before-snapshots must be supplied to prepare review batches.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import re
import sys
import urllib.parse
import zipfile
from collections import Counter
from pathlib import Path

from meet_catalog import (BASE, EVENT_SOURCE, OBSERVED_SOURCE, document_links,
    event_proposal, fetch, index_archive, merge_meet, normalize,
    observed_proposals, read_json, reconcile_calendar, resolve_meet_aliases, write_json)

EVENT_ENDPOINT = BASE + "/rest/teamevent/rawData?team=wzielsc"


def record_file(path, source_url, request=None):
    receipt = {"sourceUrl": source_url, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "request": request}
    write_json(path.with_suffix(path.suffix + ".receipt.json"), receipt)
    return receipt


def collect(args):
    root = args.output
    sources = root / "sources"
    sources.mkdir(parents=True, exist_ok=True)
    # This is a broad discovery window, not an assertion that history starts in
    # 1900. Its returned oldest date determines the annual backfill windows.
    all_path = sources / "events-all.json"
    payload = {"isPastMeet": True, "isDeletedMeet": False, "timezone": "America/Los_Angeles",
        "startDate": "1900-01-01T08:00:00.000Z", "endDate": args.cutoff + "T23:59:59-07:00"}
    receipt = fetch(EVENT_ENDPOINT, all_path, payload, args.refresh)
    if receipt.get("error"):
        raise RuntimeError(receipt["error"])
    events = read_json(all_path)
    dated = [e for e in events if e.get("startDate", {}).get("displayValueISO")]
    oldest = min(e["startDate"]["displayValueISO"] for e in dated)
    years = list(range(int(args.cutoff[:4]), int(oldest[:4]) - 1, -1))

    def annual(year):
        through = args.cutoff if year == int(args.cutoff[:4]) else f"{year}-12-31"
        path = sources / f"events-{year}.json"
        request = {**payload, "startDate": f"{year}-01-01T08:00:00.000Z", "endDate": through + "T23:59:59-08:00"}
        result = fetch(EVENT_ENDPOINT, path, request, args.refresh)
        rows = [] if result.get("error") else read_json(path)
        valid = [e for e in rows if f"{year}-01-01" <= e.get("startDate", {}).get("displayValueISO", "") <= through]
        return {"year": year, "category": "archived_events", "sourceUrl": EVENT_ENDPOINT,
            "dateWindow": {"from": f"{year}-01-01", "through": through, "timezone": "America/Los_Angeles"},
            "capturedAt": result.get("capturedAt"), "sha256": result.get("sha256"),
            "returnedListings": len(rows), "listingsInDateWindow": len(valid),
            "endDateFilterOverReturned": len(rows) != len(valid), "status": "unavailable" if result.get("error") else "checked",
            "error": result.get("error"), "gaps": ["Historical listing completeness is unverified; attachment and host-club archive checks remain."]}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        ledger = list(pool.map(annual, years))
    proposals = [p for e in dated if (p := event_proposal(e, args.cutoff))]
    excluded = [{"sourceEventId": str(e["id"]["value"]), "title": e["title"]["value"],
        "startsOn": e["startDate"].get("displayValueISO"), "reason": "Not a meet or outside historical cutoff"}
        for e in events if not event_proposal(e, args.cutoff)]

    # Fetch recent-year attachment lists; older archive existence is cataloged
    # immediately while attachment and participant work remains visible.
    recent = [p for p in proposals if p["data"]["startsOn"] >= args.attachments_from]
    def attachments(proposal):
        source_id = proposal["data"]["sourceEventId"]
        endpoint = BASE + f"/rest/ondeck/v2/meetfile/{source_id}/teamEventFile/list?team=wzielsc"
        path = sources / "attachments" / (source_id + ".json")
        result = fetch(endpoint, path, {}, args.refresh)
        proposal["data"]["evidence"]["attachmentList"] = result
        if not result.get("error"):
            proposal["data"]["documents"] = document_links(read_json(path))
            if any(d["type"] == "results" for d in proposal["data"]["documents"]):
                proposal["data"]["resultsStatus"] = "published"
                proposal["data"]["resultAcquisitionState"] = "available"
        return result
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        attachment_receipts = list(pool.map(attachments, recent))

    observed_path = sources / "observed-firecrawl.json"
    if observed_path.exists():
        observation = read_json(observed_path)
        observed, errors = observed_proposals(observation["markdown"], args.cutoff)
        observed_hash = hashlib.sha256(observed_path.read_bytes()).hexdigest()
        for proposal in observed:
            proposal["data"]["evidence"]["captureSha256"] = observed_hash
            proposal["data"]["evidence"]["captureFile"] = str(observed_path)
            proposal["data"]["evidence"]["capturedAt"] = observation.get("capturedAt")
        proposals.extend(observed)
        write_json(root / "observed-date-exceptions.json", errors)
        for year in years:
            found = [p for p in observed if p["data"]["startsOn"].startswith(str(year))]
            ledger.append({"year": year, "category": "observed", "sourceUrl": OBSERVED_SOURCE,
                "dateWindow": {"from": f"{year}-01-01", "through": args.cutoff if year == int(args.cutoff[:4]) else f"{year}-12-31"},
                "status": "checked" if found else "archive_gap", "meetsFound": len(found),
                "gaps": ["Club-filtered results do not establish complete school attendance."] if found else ["No observed-meet listing for this year in the current archive."]})
    crosswalk_path = sources / "calendar-crosswalk.json"
    if crosswalk_path.exists():
        crosswalk = read_json(crosswalk_path)
        calendar_path = sources / f"calendar-{crosswalk['year']}.pdf"
        if not calendar_path.exists() or hashlib.sha256(calendar_path.read_bytes()).hexdigest() != crosswalk["sha256"]:
            raise ValueError("Calendar PDF differs from the inspected row crosswalk; prepare a fresh crosswalk")
        reconciliation = reconcile_calendar(proposals, crosswalk)
        write_json(root / "calendar-reconciliation.json", reconciliation)
        ledger.append({"year": crosswalk["year"], "category": "calendar", "sourceUrl": crosswalk["sourceUrl"],
            "capturedAt": crosswalk.get("capturedAt"), "sha256": crosswalk["sha256"], "status": "checked",
            "dateWindow": {"from": f"{crosswalk['year']}-01-01", "through": args.cutoff},
            "meetsFound": reconciliation["matchedArchivedMeets"], "gaps": reconciliation["gaps"] + ["Calendar and archive checks do not establish complete historical participation coverage."]})
    for proposal in proposals:
        proposal["data"]["evidence"].setdefault("captureSha256", receipt.get("sha256"))
        proposal["data"]["evidence"].setdefault("capturedAt", receipt.get("capturedAt"))
    write_json(root / "discovered-meets.json", proposals)
    write_json(root / "excluded-listings.json", excluded)
    ledger.append({"category": "before_oldest_archive", "through": (dt.date.fromisoformat(oldest) - dt.timedelta(days=1)).isoformat(),
        "sourceUrl": EVENT_ENDPOINT, "status": "archive_gap", "gaps": ["No earlier dated records in the current event archive; historical completeness remains unresolved."]})
    write_json(root / "coverage-ledger.json", {"cutoff": args.cutoff, "oldestListing": oldest,
        "entries": ledger, "attachmentFetchFailures": [r for r in attachment_receipts if r.get("error")]})
    write_json(root / "outreach-list.json", {"status": "not_contacted", "requests": [
        {"recipient": "IES office / Times Officer", "reason": "Obtain historical calendars, observed-meet records before 2023, and records preceding the current 2005 event archive."},
        {"recipient": "Host clubs", "reason": "Recover unavailable result attachments and confirm documented meet-wide export scope."},
        {"recipient": "USA Swimming / IES", "reason": "Clarify authorized historical performance/meet exports, affiliation-at-meet-time fields, and API retrieval scope."}]})
    db_coverage = []
    for entry in ledger:
        year = entry.get("year", int(oldest[:4]) - 1)
        category = "observed" if entry["category"] == "observed" else "unknown"
        db_coverage.append({"id": "ies-history-" + str(year or "before-oldest") + "-" + entry["category"],
            "source_url": entry["sourceUrl"], "year": year, "category": category,
            "scope": ("Historical records through " + entry["through"] + "; current archive has no earlier records") if entry["category"] == "before_oldest_archive" else "Calendar-to-archive competition reconciliation" if entry["category"] == "calendar" else "IES public archived meet listings" if category == "unknown" else "IES observed-school-meet archive",
            "checked_at": entry.get("capturedAt") or receipt.get("capturedAt") or dt.datetime.now(dt.timezone.utc).isoformat(),
            "status": "blocked" if entry["status"] == "unavailable" or entry["category"] == "before_oldest_archive" else "partial",
            "meet_count": entry.get("meetsFound", sum(p["data"]["startsOn"].startswith(str(year)) and (p["data"].get("meetCategory") == "observed") == (category == "observed") for p in proposals)) if year else 0,
            "gaps": entry.get("gaps", [])})
    write_json(root / "database-coverage.json", db_coverage)
    print(json.dumps({"listings": len(events), "meetsDiscovered": len(proposals), "oldestListing": oldest,
        "attachmentListsChecked": len(recent), "coverageLedger": str(root / "coverage-ledger.json")}))


def canonical_mapping(baseline):
    explicit = {}
    for meet in baseline.get("timesMeets", []):
        key = meet["data"].get("knowledgeEntryId") or meet["id"]
        explicit[key] = meet["id"]
    return explicit


def prepare(args):
    root = args.output
    baseline = read_json(args.baseline)
    approved = {m["id"]: m["data"] for m in baseline.get("meets", [])}
    resolved, alias_conflicts = resolve_meet_aliases(read_json(args.discovery), approved) if args.discovery else ([], [])
    proposed = {p["id"]: p["data"] for p in resolved}
    write_json(root / "identity-conflicts.json", alias_conflicts)
    canonical = canonical_mapping(baseline)
    mappings = read_json(args.mappings) if args.mappings else []
    scopes = read_json(args.scopes) if args.scopes else {}
    source_index = {}
    for row in read_json(args.captures) if args.captures else []:
        if row.get("available"):
            source_index[row["id"]] = {"path": args.captures.parent / row["file"], "url": row["url"], "sha256": row["sha256"]}
    # Source aliases may resolve an original capture ID to an approved ID.
    # Reuse the receipt by corroborated document URL rather than redownloading.
    for mid, data in proposed.items():
        if mid not in source_index:
            urls = {d["url"] for d in data.get("documents", [])}
            matches = {(row["url"], row["sha256"]): row for row in source_index.values() if row["url"] in urls}
            if len(matches) == 1:
                source_index[mid] = next(iter(matches.values()))
    if not getattr(args, "only_selected", False):
        for mid, data in approved.items():
            proposed.setdefault(mid, {"kind": "meet", "participants": [], "participationCoverage": "unknown"})
    if args.download:
        candidates = [(mid, data) for mid, data in proposed.items() if mid not in source_index and data.get("status") != "canceled"]
        def archive(item):
            mid, data = item
            links = [d for d in data.get("documents", []) if d.get("type") == "results" and urllib.parse.urlparse(d["url"]).path.lower().endswith(".zip")]
            links = list({d["url"]: d for d in links}.values())
            if len(links) != 1:
                return None
            url = links[0]["url"]
            path = root / "archives" / (mid + ".zip")
            receipt = fetch(url, path, refresh=args.refresh)
            return (mid, {"path": path, "url": url, "sha256": receipt.get("sha256")}) if not receipt.get("error") else None
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            for value in pool.map(archive, candidates):
                if value:
                    source_index[value[0]] = value[1]
    writes, conflicts, indexes, exceptions, catalog_conflict_ids = [], [], [], [], set()
    for mid, proposal in sorted(proposed.items()):
        before = approved.get(mid)
        data = {**(before or {}), **proposal}
        if mid in canonical:
            proposal["canonicalMeetId"] = canonical[mid]
        source = source_index.get(mid)
        if source:
            index = None
            proposal["resultAcquisitionState"] = "downloaded"
            proposal["evidence"] = {**data.get("evidence", {}), "participationCapture": {
                "sourceUrl": source["url"], "sha256": source["sha256"], "archive": str(source["path"])}}
            try:
                if hashlib.sha256(source["path"].read_bytes()).hexdigest() != source["sha256"]:
                    raise ValueError("Retained archive hash differs from capture receipt")
                scope = scopes.get(mid, "partial")
                if data.get("meetCategory") == "observed":
                    scope = "partial"
                index = index_archive(source["path"], source["url"], data.get("startsOn", ""), mappings, scope)
                header = index["fileMeet"]
                try:
                    file_start = dt.datetime.strptime(header["rawStartsOn"], "%m%d%Y").date().isoformat()
                    file_end = dt.datetime.strptime(header["rawEndsOn"], "%m%d%Y").date().isoformat()
                except (KeyError, ValueError):
                    raise ValueError("Archive B1 header has invalid meet dates")
                def name_terms(name):
                    text = name.lower().replace("inland empire", "ie").replace("long course", "lc").replace("short course", "sc")
                    text = re.sub(r"\b(?:districts?|dist|distrct)\b", "district", text)
                    text = re.sub(r"\b(?:womens?|girls)\b", "girls", text)
                    text = re.sub(r"\b(?:mens?|boys)\b", "boys", text)
                    return set(re.findall(r"[a-z0-9]{2,}", text)) - {"the", "meet", "swim", "swimming", "open", "invitational", "championships", "champs", "results", "observed", "2024", "2025", "2026"}
                name_words = name_terms(data.get("title", ""))
                file_words = name_terms(header["name"])
                index["fileIdentityChecks"] = {"fileStartsOn": file_start, "fileEndsOn": file_end,
                    "catalogStartsOn": data.get("startsOn"), "catalogEndsOn": data.get("endsOn"),
                    "fileName": header["name"], "catalogTitle": data.get("title"), "corroboratingNameWords": sorted(name_words & file_words)}
                if not (data.get("startsOn", "9999") <= file_start <= file_end <= data.get("endsOn", "0000")):
                    raise ValueError(f"Archive B1 dates {file_start}–{file_end} disagree with catalog {data.get('startsOn')}–{data.get('endsOn')}")
                if name_words and not name_words & file_words:
                    raise ValueError("Archive B1 name lacks corroborating catalog-title terms")
                if file_start != data.get("startsOn") or file_end != data.get("endsOn"):
                    index["participationCoverage"] = "partial"
                    index["participationScope"] = f"Supplied export covers {file_start}–{file_end}; listed meet runs {data.get('startsOn')}–{data.get('endsOn')}."
                indexes.append({"meetId": mid, "archive": str(source["path"]), **index})
                proposal.update({"participants": index["participants"], "participationCoverage": index["participationCoverage"],
                    "participationScope": "USA Swimming club-affiliated subset of an observed school meet. School representation is not present in this export."
                        if data.get("meetCategory") == "observed" else index["participationScope"],
                    "resultAcquisitionState": "downloaded"})
                if index["fileMeet"].get("sourceCourses"):
                    proposal["sourceCourses"] = index["fileMeet"]["sourceCourses"]
                proposal["evidence"] = {**data.get("evidence", {}), "participationCapture": {
                    "sourceUrl": source["url"], "sha256": index["sha256"], "member": index["member"],
                    "sourceCourses": index["fileMeet"].get("sourceCourses", []),
                    "recordReferencesFile": str(root / "participation-index.json"), "exceptions": len(index["exceptions"])}}
                if index["exceptions"]:
                    exceptions.append({"meetId": mid, "exceptions": index["exceptions"]})
            except (ValueError, zipfile.BadZipFile) as error:
                exceptions.append({"meetId": mid, "error": str(error)})
                capture = proposal["evidence"]["participationCapture"]
                proposal.setdefault("catalogConflicts", []).append({"field": "sourceResultIdentity",
                    "approved": {"startsOn": data.get("startsOn"), "endsOn": data.get("endsOn"), "title": data.get("title")},
                    "proposed": {"error": str(error), **(index.get("fileIdentityChecks", {}) if index else {})},
                    "sourceUrl": source["url"], "sha256": source["sha256"], "member": index.get("member") if index else None})
                proposal["participationScope"] = "Participation indexing held for source identity/date review: " + str(error)
        elif not proposal.get("resultAcquisitionState"):
            proposal["resultAcquisitionState"] = "available" if any(d.get("type") == "results" for d in data.get("documents", [])) else "unchecked"
        after, changes = merge_meet(before, proposal)
        if after.get("catalogConflicts"):
            catalog_conflict_ids.add(mid)
        if before != after:
            writes.append({"path": "knowledge_entries/" + mid, **({"before": before} if before else {}), "after": after})
        if changes:
            conflicts.append({"meetId": mid, "conflicts": changes})
    write_json(root / "participation-index.json", indexes)
    write_json(root / "identity-crosswalk.json", identity_candidates(baseline, indexes))
    write_json(root / "field-conflicts.json", conflicts)
    write_json(root / "parser-exceptions.json", exceptions)
    indexed_ids = {index["meetId"] for index in indexes}
    exception_ids = {exception["meetId"] for exception in exceptions}
    acquired = [{"id": mid, "url": source["url"], "path": str(source["path"]), "sha256": source["sha256"],
        "validationStatus": "held" if mid not in indexed_ids else "indexed_with_exceptions" if mid in exception_ids else "indexed"}
        for mid, source in sorted(source_index.items()) if mid in proposed]
    write_json(root / "acquired-archives.json", acquired)
    batch_paths = bounded_batches(root, writes, args.cutoff)
    summary = {"approvedMeetBaseline": len(approved), "discoveredMeetProposals": len(proposed),
        "archivesIndexed": len(indexes), "participantObservations": sum(len(i["participants"]) for i in indexes),
        "recordedParticipants": sum(p["basis"] == "recorded" for i in indexes for p in i["participants"]),
        "sourceRecordReferences": sum(len(i["references"]) for i in indexes), "writes": len(writes),
        "batches": batch_paths, "conflictedMeets": len(conflicts), "parserExceptionMeets": len(exceptions),
        "catalogConflictMeets": len(catalog_conflict_ids), "archivesAcquired": len(acquired),
        "teamCoverage": dict(Counter(i["participationCoverage"] for i in indexes)),
        "newSwimmerWrites": 0, "staged": False, "published": False}
    write_json(root / "summary.json", summary)
    print(json.dumps(summary))


def identity_candidates(baseline, indexes):
    """Date-specific suggestions for staff; unreviewed mappings are not applied."""
    operational, catalog = {}, {}
    for row in baseline.get("teams", []):
        data = row["data"]
        key = (data.get("lscCode", ""), data.get("clubCode", ""), normalize(data.get("name", "")))
        operational.setdefault(key, []).append(row["id"])
    for row in baseline.get("knowledgeTeams", []):
        data = row["data"]
        lsc = data.get("lscId", "").replace("usa-lsc-", "").upper()
        key = (lsc, data.get("abbreviation", ""), normalize(data.get("title", "")))
        catalog.setdefault(key, []).append(row["id"])
    candidates = []
    for index in indexes:
        for team in index["participants"]:
            key = (team["lscCode"], team["clubCode"], normalize(team["name"]))
            candidates.append({"meetId": index["meetId"], "participantId": team["id"], "clubCode": team["clubCode"],
                "lscCode": team["lscCode"], "sourceNames": [team["name"]], "representation": team["representation"],
                "candidateOperationalTeamIds": operational.get(key, []), "candidateCatalogTeamIds": catalog.get(key, []),
                "reviewed": False, "evidence": team["evidence"]})
    return candidates


def bounded_batches(root, writes, cutoff):
    base = {"division": "knowledge", "scope": "Historical IES meet catalog and evidence-backed team participation",
        "sourceUrl": EVENT_SOURCE, "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "coverage": "partial",
        "evidence": {"method": "Deterministic public archive discovery and checksum-verified HY3 participation indexing.",
            "cutoff": cutoff, "limitations": "Historical completeness is unverified. Identity candidates remain unresolved until reviewed. Indexing does not establish full race-import completion."}}
    def batch(rows, scope):
        return {**base, "scope": base["scope"] + " (" + (scope or "unresolved") + ")",
            "writes": [{"path": row["path"], "after": row["after"]} for row in rows],
            "reads": [{"path": row["path"], "before": row.get("before")} for row in rows]}
    paths, chunk, current_scope = [], [], None
    for write in sorted(writes, key=lambda w: (w["after"].get("catalogScope", "unresolved"), w["path"])):
        scope = write["after"].get("catalogScope", "unresolved")
        candidate = batch(chunk + [write], scope)
        if chunk and (scope != current_scope or len(chunk) == 100 or len(json.dumps(candidate, indent=2, ensure_ascii=False).encode()) > 1_900_000):
            path = root / "batches" / f"{len(paths) + 1:04d}.json"
            write_json(path, batch(chunk, current_scope)); paths.append(str(path)); chunk = []
        current_scope = scope
        chunk.append(write)
        if len(json.dumps(batch(chunk, current_scope), indent=2, ensure_ascii=False).encode()) > 1_900_000:
            raise ValueError("A single meet proposal exceeds the review batch size limit")
    if chunk:
        path = root / "batches" / f"{len(paths) + 1:04d}.json"
        write_json(path, batch(chunk, current_scope)); paths.append(str(path))
    return paths


def assisted(args):
    payload = read_json(args.selected)
    rows = payload.get("meets", payload.get("rows", [])) if isinstance(payload, dict) else payload
    if not rows:
        raise ValueError("Selection export contains no meets")
    selected = []
    for row in rows:
        workflow = row.get("workflow", {})
        if not (row.get("selected") is True or workflow.get("selected") is True):
            raise ValueError("Assisted collection requires every input meet to be explicitly selected")
        catalog = row.get("catalog", row.get("data", row))
        mid = row.get("id") or row.get("meetId")
        if not mid or not catalog.get("sourceUrl"):
            raise ValueError("Selected meet lacks stable identity or source URL")
        selected.append({"id": mid, "data": catalog, "workflow": workflow, "priority": row.get("priority", workflow.get("priority", 50))})
    selected.sort(key=lambda row: (int(row["priority"]), -(dt.date.fromisoformat(row["data"].get("startsOn", "1900-01-01")).toordinal()), row["id"]))
    write_json(args.output / "selected-meets.json", [{"id": r["id"], "data": r["data"]} for r in selected])
    # Reuse the same acquisition/parser/review path; full race preparation must
    # reconcile dates, identity exceptions and visiting swimmers afterward.
    args.discovery = args.output / "selected-meets.json"
    args.download = True
    args.only_selected = True
    prepare(args)
    write_json(args.output / "assisted-run.json", {"selectedMeetIds": [r["id"] for r in selected],
        "archives": read_json(args.output / "acquired-archives.json"),
        "nextStep": "Review participation proposals; prepare full race import for these selected IDs using retained archives, reconcile source/identity exceptions, then stage performance batches separately.",
        "automaticApproval": False, "swimmerWrites": 0})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    collector = commands.add_parser("discover")
    collector.add_argument("--output", type=Path, required=True)
    collector.add_argument("--cutoff", default="2026-10-12")
    collector.add_argument("--attachments-from", default="2025-01-01")
    collector.add_argument("--refresh", action="store_true")
    for name in ("prepare", "assisted"):
        command = commands.add_parser(name)
        command.add_argument("--output", type=Path, required=True)
        command.add_argument("--baseline", type=Path, required=True)
        command.add_argument("--captures", type=Path)
        command.add_argument("--mappings", type=Path)
        command.add_argument("--scopes", type=Path)
        command.add_argument("--cutoff", default="2026-10-12")
        command.add_argument("--refresh", action="store_true")
        if name == "prepare":
            command.add_argument("--discovery", type=Path)
            command.add_argument("--download", action="store_true")
        else:
            command.add_argument("--selected", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "discover":
        collect(args)
    elif args.command == "prepare":
        prepare(args)
    else:
        assisted(args)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
