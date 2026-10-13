"""Evidence-backed meet discovery and participation indexing; never publishes data.

Only standard-library Python is required. HY3 fixed-width checksums are verified
before extracting any facts. Swimmer identities are intentionally not returned.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

BASE = "https://www.gomotionapp.com"
EVENT_SOURCE = BASE + "/team/wzielsc/page/events#/team-events/past"
OBSERVED_SOURCE = BASE + "/team/wzielsc/page/events/ies-observed-meets"
BASIS_RANK = {"planned": 0, "entered": 1, "recorded": 2}
RESULT_FLAGS = {" ": "OK", "S": "OK", "Q": "DQ", "D": "DNF", "R": "NS", "F": "NS"}


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:24]


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def plain(value: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]*>", " ", value)).split())


def read_json(path: Path):
    return json.loads(path.read_text())


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def fetch(url: str, cache: Path, payload=None, refresh=False) -> dict:
    """Cache successful bodies, retry transient failures, retain fetch receipts.

    Read-only GoMotion search/list endpoints use POST; no endpoint performing
    an external mutation is used by this collector.
    """
    receipt_path = cache.with_suffix(cache.suffix + ".receipt.json")
    if cache.exists() and not refresh:
        return read_json(receipt_path) if receipt_path.exists() else {
            "sourceUrl": url, "sha256": hashlib.sha256(cache.read_bytes()).hexdigest(),
            "cached": True, "captureTimeUnknown": True}
    cache.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, data=json.dumps(payload).encode() if payload is not None else None,
                headers={"User-Agent": "VelocitySwimmingHistoricalCatalog/1.0", "Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=45) as response:
                content = response.read()
                receipt = {"sourceUrl": url, "sha256": hashlib.sha256(content).hexdigest(),
                    "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "httpStatus": response.status,
                    "contentType": response.headers.get("Content-Type"), "request": payload}
            cache.write_bytes(content)
            write_json(receipt_path, receipt)
            return receipt
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == 2:
                receipt = {"sourceUrl": url, "error": str(error), "request": payload,
                    "capturedAt": dt.datetime.now(dt.timezone.utc).isoformat()}
                write_json(receipt_path, receipt)
                return receipt
            time.sleep(attempt + 1)


def verify_hy3(raw: bytes) -> list[str]:
    lines = raw.splitlines()
    if not lines or lines[0][:4] not in (b"A107", b"A104"):
        raise ValueError("Unsupported HY3 results export")
    for number, line in enumerate(lines, 1):
        if len(line) != 130:
            raise ValueError(f"HY3 line {number} must be 130 bytes")
        checksum = (2 * sum(line[1:128:2]) + sum(line[:128:2])) // 21 + 205
        if line[128:].decode("ascii") != f"{checksum % 10}{checksum // 10 % 10}":
            raise ValueError(f"HY3 line {number} checksum disagrees")
    return raw.decode("cp1252").splitlines()


def historical_mapping(team: dict, starts_on: str, mappings: list[dict]) -> dict:
    """Mappings are explicit, reviewed and date-ranged; no fuzzy-name mapping."""
    matches = [m for m in mappings if m.get("reviewed") is True
        and m.get("clubCode") == team["clubCode"] and m.get("lscCode", "") == team["lscCode"]
        and m.get("representation", "club") == team["representation"]
        and m.get("validFrom", "0000") <= starts_on <= m.get("validThrough", "9999")
        and (not m.get("sourceNames") or team["name"] in m["sourceNames"])]
    if len(matches) != 1:
        return {}
    return {key: matches[0][key] for key in ("catalogTeamId", "operationalTeamId") if matches[0].get(key)}


def extract_participation(lines: list[str], source: dict, starts_on: str = "", mappings=None, companion_status=None) -> dict:
    """C1 defines context; E2/F2 establish entered versus recorded participation.

    Successful times must be positive. Unknown flags and malformed contexts are
    retained as exceptions and cannot establish recorded attendance. DQ/DNF
    establish actual participation even without a time; no-show does not.
    """
    teams, references, exceptions = {}, [], []
    current = entry_kind = entry = athlete_member = None
    file_meet = {}
    result_courses = set()
    for number, line in enumerate(lines, 1):
        if len(line) < 128:
            raise ValueError(f"HY3 line {number} is truncated")
        code = line[:2]
        if code == "B1":
            file_meet = {"name": line[2:47].strip(), "rawStartsOn": line[92:100], "rawEndsOn": line[100:108]}
        elif code == "C1":
            current = {"clubCode": line[2:7].strip(), "lscCode": line[53:55].strip(), "name": line[7:37].strip()}
            unattached = current["clubCode"] in ("UN", "UNAT") or bool(re.match(r"^unattached\b", current["name"], re.I)) or bool(current["lscCode"] and current["clubCode"] == "UN-" + current["lscCode"])
            current["representation"] = "unattached" if unattached else "school" if re.search(r"\b(?:high school|school|HS)\b", current["name"], re.I) else "club"
            current["id"] = "team-observation-" + digest("|".join(current[k] for k in ("lscCode", "clubCode", "name", "representation")))
            teams.setdefault(current["id"], {**current, "basis": "entered", "evidence": [], "counts": Counter()})
            entry_kind = None
        elif code in ("E1", "F1"):
            entry_kind = code
            entry = line
            if current:
                row = teams[current["id"]]
                row["counts"]["entries"] += 1
                evidence = {**{k: source[k] for k in ("sourceUrl", "sha256", "member") if source.get(k)},
                    "line": number, "kind": "individual_entry" if code == "E1" else "relay_entry", "status": "ENTRY"}
                references.append({"participantId": row["id"], "basis": "entered", **evidence})
                if not any(e["kind"] == evidence["kind"] and e.get("sha256") == evidence.get("sha256") for e in row["evidence"]):
                    row["evidence"].append(evidence)
        elif code == "D1":
            athlete_member = line[69:81].strip()
            entry_kind = entry = None
        elif code in ("E2", "F2"):
            if not current or entry_kind != {"E2": "E1", "F2": "F1"}[code]:
                exceptions.append({"line": number, "reason": "Result lacks matching team/entry context"})
                continue
            row = teams[current["id"]]
            status = RESULT_FLAGS.get(line[12])
            if code == "E2" and companion_status:
                key = (athlete_member, entry[38:42].strip(), line[87:95], line[2])
                if companion_status.get(key) == "DFS":
                    status = "DFS"
            kind = "individual_result" if code == "E2" else "relay_result"
            raw_time = line[4:11].strip()
            positive_time = bool(re.fullmatch(r"(?:\d+:)?\d+\.\d{2}", raw_time)) and float(raw_time.replace(":", "")) > 0
            if status is None or (status == "OK" and not positive_time):
                exceptions.append({"line": number, "reason": "Unknown status or missing positive result time", "flag": line[12]})
                continue
            basis = "recorded" if status in ("OK", "DQ", "DNF") else "entered"
            if basis == "recorded" and line[11] in ("Y", "S", "L"):
                result_courses.add({"Y": "SCY", "S": "SCM", "L": "LCM"}[line[11]])
            if BASIS_RANK[basis] > BASIS_RANK[row["basis"]]:
                row["basis"] = basis
            evidence = {**{k: source[k] for k in ("sourceUrl", "sha256", "member") if source.get(k)},
                "line": number, "kind": kind, "status": status}
            references.append({"participantId": row["id"], "basis": basis, **evidence})
            # Catalog payload stays bounded; every reference remains in the
            # local capture artifact. At least one per kind/status is included.
            if not any(e["kind"] == kind and e["status"] == status and e.get("sha256") == evidence.get("sha256") for e in row["evidence"]):
                row["evidence"].append(evidence)
            row["counts"][kind + ":" + status] += 1
    participants = []
    for row in teams.values():
        if not row["evidence"]:
            # C1 alone is not evidence of entries or attendance.
            continue
        counts = dict(row.pop("counts"))
        row.update(historical_mapping(row, starts_on, mappings or []))
        participants.append(row)
        file_meet.setdefault("participantCounts", {})[row["id"]] = counts
    file_meet["sourceCourses"] = sorted(result_courses)
    return {"participants": sorted(participants, key=lambda p: (p["lscCode"], p["clubCode"], p["name"])),
        "references": references, "exceptions": exceptions, "fileMeet": file_meet}


def index_archive(path: Path, source_url: str, starts_on="", mappings=None, scope="partial") -> dict:
    archive_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    with zipfile.ZipFile(path) as archive:
        members = sorted(n for n in archive.namelist() if n.lower().endswith(".hy3"))
        if len(members) != 1:
            raise ValueError("Archive must contain exactly one HY3 results member")
        member = members[0]
        companion_status = {}
        for companion in (n for n in archive.namelist() if n.lower().endswith(".cl2")):
            for line in archive.read(companion).decode("cp1252").splitlines():
                if line[:2] != "D0" or len(line) != 160:
                    continue
                for round_name, offset in (("P", 97), ("S", 106), ("F", 115)):
                    value = line[offset:offset + 8].strip()
                    if value in ("DQ", "NS", "SCR", "DNF", "DFS"):
                        companion_status[(line[39:51].strip(), line[72:76].strip(), line[80:88], round_name)] = value
        parsed = extract_participation(verify_hy3(archive.read(member)),
            {"sourceUrl": source_url, "sha256": archive_hash, "member": member}, starts_on, mappings, companion_status)
    parsed.update({"sha256": archive_hash, "member": member,
        "participationCoverage": "complete" if scope == "meet-wide" and not parsed["exceptions"] else "partial",
        "participationScope": "All teams with result records in the reviewed meet-wide HY3 export."
            if scope == "meet-wide" else "Teams present in supplied HY3 export; meet-wide team completeness is not established."})
    return parsed


def merge_participants(before: list[dict], proposed: list[dict]) -> list[dict]:
    merged = {row["id"]: dict(row) for row in before}
    for proposal in proposed:
        old = merged.get(proposal["id"], {})
        row = {**proposal, **old}
        row["basis"] = max((old.get("basis", "planned"), proposal["basis"]), key=BASIS_RANK.get)
        evidence = {json.dumps(e, sort_keys=True): e for e in old.get("evidence", []) + proposal.get("evidence", [])}
        row["evidence"] = [evidence[key] for key in sorted(evidence)]
        for key in ("catalogTeamId", "operationalTeamId"):
            if key not in row and proposal.get(key):
                row[key] = proposal[key]
        merged[proposal["id"]] = row
    return [merged[key] for key in sorted(merged)]


def merge_meet(before: dict | None, proposal: dict) -> tuple[dict, list[dict]]:
    """Add new fields, preserve approved fields and report semantic conflicts."""
    before = before or {}
    after, conflicts = dict(before), []
    for key, value in proposal.items():
        if key == "participants":
            after[key] = merge_participants(before.get(key, []), value)
        elif key in ("documents", "sourceAliases", "catalogConflicts"):
            old = before.get(key, [])
            unique = {json.dumps(item, sort_keys=True): item for item in old + value}
            after[key] = [unique[k] for k in sorted(unique)]
        elif key == "evidence" and isinstance(value, dict):
            after[key] = {**value, **before.get(key, {})}
        elif key == "resultAcquisitionState":
            ranks = {"unchecked": 0, "unavailable": 1, "available": 2, "downloaded": 3}
            after[key] = max((before.get(key, "unchecked"), value), key=ranks.get)
        elif key == "participationCoverage":
            ranks = {"unknown": 0, "partial": 1, "complete": 2}
            after[key] = max((before.get(key, "unknown"), value), key=ranks.get)
        elif key not in before or before[key] in (None, "", "unknown"):
            after[key] = value
        elif value in (None, "", "unknown"):
            continue
        elif before[key] != value:
            if key not in ("checkedAt", "coverageNote", "summary", "evidence"):
                conflicts.append({"field": key, "approved": before[key], "proposed": value})
    if conflicts:
        all_conflicts = {json.dumps(c, sort_keys=True): c for c in after.get("catalogConflicts", []) + conflicts}
        after["catalogConflicts"] = [all_conflicts[k] for k in sorted(all_conflicts)]
    return after, conflicts


def document_links(rows: list[dict]) -> list[dict]:
    result = []
    for row in rows:
        name = row.get("fileName") or row.get("name") or ""
        path = row.get("filePath") or row.get("url") or ""
        if not path:
            continue
        url = urllib.parse.urljoin(BASE, path)
        result.append({"name": name, "url": url, "type": "results" if "result" in name.lower() else "meet_document"})
    return result


def event_proposal(event: dict, cutoff: str, documents=None) -> dict | None:
    starts = event["startDate"].get("displayValueISO", "")
    ends = event["endDate"].get("displayValueISO", "") or starts
    title = event["title"]["value"]
    description = plain(event.get("meetDescription", {}).get("value", ""))
    if not starts or ends > cutoff or title.strip().lower() == "test" or re.search(r"\b(HOD|BOD|house of delegates|board of directors|clinic|officials? training|registration|banquet|summit|meeting|awards|workshops?|camp|build-a-pool|conventions?)\b", title, re.I):
        return None
    # Club trips to competitions outside IES remain national-discovery leads.
    own_meet = r"\bthis\s+meet\s+(?:(?:will\s+be|is|was|has\s+been)\s+)(?:an?\s+)?(?:USA\s+Swimming\s+|NCAA\s+)?"
    observed = bool(re.search(r"\bobserved\b|(?:\s|-)OB\b", title, re.I)
        or re.search(r"\b(?:sanction|forms|meet\s+type)\s*:\s*(?:NCAA\s+)?observed\b", description, re.I)
        or re.search(own_meet + r"observed\b", description, re.I))
    approved = bool(re.search(r"\bapproved\b", title, re.I)
        or re.search(r"\b(?:sanction|meet\s+type)\s*:\s*(?:USA\s+Swimming\s+)?approved\b", description, re.I)
        or re.search(own_meet + r"approved\b", description, re.I))
    sanctioned = bool(re.search(r"\bsanctioned\b", title, re.I)
        or re.search(r"\bsanctioned\s+meet\s+announc(?:ement|ements)\b", description, re.I)
        or re.search(own_meet + r"sanctioned\b", description, re.I))
    category = "observed" if observed else "approved" if approved else "sanctioned" if sanctioned else "unknown"
    source_id = str(event["id"]["value"])
    source = EVENT_SOURCE + "/" + source_id
    canceled = bool(re.search(r"\bcancel(?:led|ed|lation)\b", title, re.I)
        or re.search(r"\b(?:this\s+|the\s+)?meet\s+(?:(?:has|have)\s+been\s+|(?:is|was)\s+(?:now\s+)?)?cancel(?:led|ed)\b", description, re.I)
        or re.match(r"^\s*cancel(?:led|ed)\b", description, re.I)
        or re.search(r"\*+\s*cancel(?:led|ed)\s*\*+", description, re.I))
    docs = documents or []
    result = {"id": "usa-meet-ie-" + source_id, "data": {
        "kind": "meet", "title": title, "startsOn": starts, "endsOn": ends,
        "location": event.get("location", {}).get("value", ""), "sourceUrl": source,
        "sourceEventId": source_id, "sourceAliases": [{"sourceUrl": source, "sourceId": source_id, "validFrom": starts, "validThrough": ends}],
        "sourceListingLscId": "usa-lsc-ie", "zoneId": "usa-zone-western", "meetCategory": category,
        "status": "canceled" if canceled else "past", "discipline": "open_water" if re.search(r"open water", title, re.I) else "unknown",
        "documents": docs, "participants": [], "participationCoverage": "unknown",
        "participationScope": "Team attendance has not yet been indexed.",
        "resultsStatus": "published" if any(d["type"] == "results" for d in docs) else "unknown",
        "evidence": {"sourceUrl": source, "eventListingTitle": title, "eventDescription": description,
            "startDate": starts, "endDate": ends},
        "coverageNote": "Official archived event listing. Meet existence is distinct from participation and result-import coverage."}}
    national_title = title.startswith("**") or bool(re.search(r"\b(?:WZ|Western Zone|US OPEN|Nationals?|Husky|Olympic Trials|Sectionals?)\b", title, re.I))
    explicit_ies_sanction = bool(re.search(r"\bsanctioned\s+by\s+Inland Empire Swimming\b", description, re.I))
    if national_title and not explicit_ies_sanction:
        result["data"]["catalogScope"] = "national_lead"
    elif re.search(r"\b(?:IE|IES|Inland Empire Swimming)\b", title + " " + description, re.I):
        result["data"]["lscId"] = "usa-lsc-ie"
        result["data"]["catalogScope"] = "ies"
    else:
        result["data"]["catalogScope"] = "unresolved"
    return result


def numeric_dates(value: str, title: str = "") -> tuple[str, str] | None:
    text = plain(value).replace("<br>", " ")
    year_match = re.search(r"\b(20\d{2}|19\d{2})\b", text) or re.search(r"\b(20\d{2}|19\d{2})\b", title)
    if not year_match:
        return None
    default_year = int(year_match.group())
    pieces = list(re.finditer(r"(\d{1,2})/(\d{1,2})(?:/(\d{4}|\d{2}))?", text))
    if not pieces:
        return None
    dates = []
    for piece in pieces:
        year = int(piece[3]) if piece[3] else default_year
        if year < 100:
            year += 2000
        try:
            dates.append(dt.date(year, int(piece[1]), int(piece[2])).isoformat())
        except ValueError:
            return None
    return min(dates), max(dates)


def observed_proposals(markdown: str, cutoff: str) -> tuple[list[dict], list[dict]]:
    proposals, exceptions = [], []
    for line_number, line in enumerate(markdown.splitlines(), 1):
        if not line.startswith("| "):
            continue
        cells = [c.strip() for c in re.split(r"(?<!\\)\|", line)[1:-1]]
        if len(cells) != 6 or not re.match(r"\d", cells[0]):
            continue
        dates = numeric_dates(cells[0], cells[1])
        if not dates:
            exceptions.append({"line": line_number, "reason": "Ambiguous observed meet dates", "text": line})
            continue
        starts, ends = dates
        if ends > cutoff:
            continue
        name = plain(cells[1]).replace("**", "")
        links = []
        for cell in cells[4:]:
            for label, url in re.findall(r"\[([^\]]+)\]\((https://[^)]+)\)", cell):
                if not any(link["url"] == url for link in links):
                    links.append({"name": html.unescape(label).replace("\\|", "|"), "url": url, "type": "results"})
        source_id = digest("|".join((starts, ends, normalize(name))))
        proposals.append({"id": "usa-observed-ie-" + source_id, "data": {
            "kind": "meet", "title": name, "startsOn": starts, "endsOn": ends,
            "location": plain(cells[2]), "sourceUrl": OBSERVED_SOURCE,
            "sourceAliases": [{"sourceUrl": OBSERVED_SOURCE, "sourceId": source_id, "validFrom": starts, "validThrough": ends}],
            "sourceListingLscId": "usa-lsc-ie", "catalogScope": "ies", "lscId": "usa-lsc-ie", "zoneId": "usa-zone-western", "meetCategory": "observed", "status": "past",
            "discipline": "pool", "documents": links, "participants": [], "participationCoverage": "unknown",
            "participationScope": "Observed school meet; club-filtered results do not establish complete school-team representation.",
            "resultsStatus": "published" if links else "unknown",
            "evidence": {"sourceUrl": OBSERVED_SOURCE, "line": line_number, "sourceDateText": cells[0], "swimsPostingText": plain(cells[3]), "sourceRow": line},
            "coverageNote": "Official observed-meet archive; USA Swimming club affiliation is separate from school representation."}})
        if re.search(r"\bPN\s+Observed\b", name, re.I):
            proposals[-1]["data"].update({"lscId": "usa-lsc-pn", "catalogScope": "national_lead"})
    # Older archive section uses narrative paragraphs rather than tables.
    for line_number, line in enumerate(markdown.splitlines(), 1):
        match = re.match(r"([A-Z][a-z]+) (\d{1,2})(?:\s*-\s*(\d{1,2}))?, (20\d{2})\s*\\?\*\s*(.+)", line)
        if not match:
            continue
        month, day, end_day, year, rest = match.groups()
        try:
            starts = dt.datetime.strptime(f"{month} {day} {year}", "%B %d %Y").date().isoformat()
            ends = dt.datetime.strptime(f"{month} {end_day or day} {year}", "%B %d %Y").date().isoformat()
        except ValueError:
            exceptions.append({"line": line_number, "reason": "Ambiguous narrative observed date", "text": line})
            continue
        if ends > cutoff:
            continue
        name = rest.split(" - ")[0].replace("**", "").replace("\\*", "*").strip()
        source_id = digest("|".join((starts, ends, normalize(name))))
        proposals.append({"id": "usa-observed-ie-" + source_id, "data": {"kind": "meet", "title": name,
            "startsOn": starts, "endsOn": ends, "sourceUrl": OBSERVED_SOURCE,
            "sourceAliases": [{"sourceUrl": OBSERVED_SOURCE, "sourceId": source_id, "validFrom": starts, "validThrough": ends}],
            "sourceListingLscId": "usa-lsc-ie", "catalogScope": "ies", "lscId": "usa-lsc-ie", "zoneId": "usa-zone-western", "meetCategory": "observed", "status": "past", "discipline": "pool",
            "participants": [], "participationCoverage": "unknown", "participationScope": "Narrative archive listing; no participant source located.",
            "documents": [], "resultsStatus": "unknown", "evidence": {"sourceUrl": OBSERVED_SOURCE, "line": line_number, "sourceRow": line}}})
    return proposals, exceptions


def resolve_meet_aliases(proposals: list[dict], approved=None) -> tuple[list[dict], list[dict]]:
    """Merge corroborated source aliases and leave ambiguous identities visible.

    A shared attachment URL plus the same dates, or exact normalized title,
    same dates and compatible venue, is required. Dates or title alone do not
    suffice. Approved stable IDs take precedence over newly discovered IDs.
    """
    approved = approved or {}
    rows = {mid: {"id": mid, "data": dict(data)} for mid, data in approved.items()}
    rows.update({row["id"]: {"id": row["id"], "data": dict(row["data"])} for row in proposals})
    touched = {row["id"] for row in proposals}
    ambiguities = []
    def signature(value):
        return normalize(re.sub(r"\b(?:19\d{2}|20\d{2}|IE|IES)\b", "", value, flags=re.I))
    for mid in list(touched):
        if mid not in rows:
            continue
        data = rows[mid]["data"]
        documents = {d["url"] for d in data.get("documents", [])}
        matches = []
        for other_id, other in rows.items():
            if other_id == mid:
                continue
            other_data = other["data"]
            if (data.get("startsOn"), data.get("endsOn")) != (other_data.get("startsOn"), other_data.get("endsOn")):
                continue
            shared_document = bool(documents & {d["url"] for d in other_data.get("documents", [])})
            venue, other_venue = normalize(data.get("location", "")), normalize(other_data.get("location", ""))
            same_venue = bool(venue and other_venue and (venue in other_venue or other_venue in venue))
            if shared_document or (same_venue and signature(data.get("title", "")) == signature(other_data.get("title", ""))):
                matches.append(other_id)
        if len(matches) > 1:
            ambiguities.append({"meetId": mid, "candidateIds": matches, "reason": "Multiple corroborated identities require staff resolution"})
            continue
        if not matches:
            continue
        other_id = matches[0]
        target = min((mid, other_id), key=lambda key: (key not in approved, key.startswith("usa-observed-"), key))
        alias = other_id if target == mid else mid
        merged, conflicts = merge_meet(rows[target]["data"], rows[alias]["data"])
        merged["sourceAliases"] = merge_meet({}, {"sourceAliases": merged.get("sourceAliases", []) + [{"sourceId": alias,
            "sourceUrl": rows[alias]["data"]["sourceUrl"], "validFrom": data["startsOn"], "validThrough": data["endsOn"]}]})[0]["sourceAliases"]
        rows[target]["data"] = merged
        del rows[alias]
        touched.add(target)
        touched.discard(alias)
        if conflicts:
            ambiguities.append({"meetId": target, "mergedAliasId": alias, "conflicts": conflicts})
    return [rows[key] for key in sorted(touched) if key in rows], ambiguities


def reconcile_calendar(proposals: list[dict], crosswalk: dict) -> dict:
    """Attach a source-checked calendar row crosswalk without shared documents.

    The crosswalk is prepared from an inspected calendar PDF. Keeping its row
    references in evidence/aliases avoids mistaking a shared calendar document
    for the same meet's results and merging simultaneous competitions.
    """
    meets = {p["id"]: p["data"] for p in proposals}
    checked, gaps = [], []
    for row in crosswalk["rows"]:
        data = meets.get(row["meetId"])
        if not data:
            gaps.append("Calendar competition has no archive match: " + row["label"])
            continue
        source = {"sourceUrl": crosswalk["sourceUrl"], "sha256": crosswalk["sha256"],
            "capturedAt": crosswalk.get("capturedAt"), "page": 1, "line": row["line"],
            "sourceId": row["sourceId"], "sourceRow": row["sourceRow"], "calendarDates": row["calendarDates"]}
        data.setdefault("evidence", {})["calendar"] = source
        data.setdefault("sourceAliases", []).append({"sourceUrl": crosswalk["sourceUrl"], "sourceId": row["sourceId"],
            "validFrom": row["calendarDates"]["startsOn"], "validThrough": row["calendarDates"]["endsOn"]})
        differences = []
        dates = {"startsOn": data["startsOn"], "endsOn": data["endsOn"]}
        if row["calendarDates"] != dates:
            differences.append({"field": "calendarDates", "approved": dates, "proposed": row["calendarDates"], **source})
        if data.get("status") == "canceled":
            differences.append({"field": "calendarStatus", "approved": "canceled", "proposed": "scheduled in calendar", **source})
        if row.get("calendarHost") and "Cougar Aquatics" in data.get("evidence", {}).get("eventDescription", ""):
            differences.append({"field": "calendarHost", "approved": "Cougar Aquatics (archive host-change notice)", "proposed": row["calendarHost"], **source})
        if differences:
            data.setdefault("catalogConflicts", []).extend(differences)
            gaps.extend(row["label"] + ": " + difference["field"] + " differs between calendar and archive" for difference in differences)
        checked.append({"meetId": row["meetId"], "calendarLabel": row["label"], "source": source, "differences": differences})
    return {"year": crosswalk["year"], "sourceUrl": crosswalk["sourceUrl"], "sha256": crosswalk["sha256"],
        "capturedAt": crosswalk.get("capturedAt"), "competitionsChecked": len(crosswalk["rows"]),
        "matchedArchivedMeets": len(checked), "status": "partial", "gaps": gaps, "checks": checked}
