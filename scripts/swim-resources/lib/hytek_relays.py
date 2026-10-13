"""Conservative readers for paired HY-TEK HY3 / SDIF CL2 result exports.

CL2 field positions follow United States Swimming SDIF v3 (1998), sections
16–18. A public copy is at https://www.cvs.org.au/Resources/Standard%20Data%20Interchange%20Format.pdf.
HY3 split markers have varied between actual exports: they are retained as
evidence, never multiplied by an assumed pool length. Distances come from the
companion CL2's explicit G0 increment, sequence, slot and F0 relay leg.

This module does not claim that the first relay split is an eligible individual
performance. That requires separately reviewed timing and validity evidence.
"""

from __future__ import annotations

import collections
import datetime
import hashlib
import re
import zipfile
from pathlib import Path

COURSES = {"Y": "SCY", "S": "SCM", "L": "LCM"}
STROKES = {"A": "FR", "B": "BK", "C": "BR", "D": "FL", "E": "IM"}
STATUS = {" ": "OK", "S": "OK", "Q": "DQ", "R": "NS", "F": "NS", "D": "DNF"}
CL2_STATUS = {"DQ": "DQ", "NS": "NS", "SCR": "NS", "DNF": "DNF", "DFS": "DFS"}


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:24]


def time_ms(value: str) -> int:
    """Parse integer hundredths, rejecting silent rounding and float error."""
    match = re.fullmatch(r"(?:(\d+):)?(\d+)\.(\d{2})", value.strip())
    if not match:
        raise ValueError(f"Not an exact hundredths time: {value!r}")
    minutes, seconds, hundredths = match.groups()
    if minutes and int(seconds) >= 60:
        raise ValueError("Seconds must be below 60 in a minute time")
    return ((int(minutes or 0) * 60 + int(seconds)) * 100 + int(hundredths)) * 10


def display(value: int) -> str:
    minutes, hundredths = divmod(value // 10, 6000)
    seconds, fraction = divmod(hundredths, 100)
    return f"{minutes}:{seconds:02d}.{fraction:02d}" if minutes else f"{seconds}.{fraction:02d}"


def iso_date(value: str) -> str:
    return datetime.datetime.strptime(value, "%m%d%Y").date().isoformat()


def verify_hy3(raw: bytes) -> list[str]:
    lines = raw.splitlines()
    if not lines or lines[0][:4] not in (b"A107", b"A104"):
        raise ValueError("Unsupported HY3 export kind")
    for number, line in enumerate(lines, 1):
        if len(line) != 130:
            raise ValueError(f"HY3 line {number} is not 130 bytes")
        checksum = (2 * sum(line[1:128:2]) + sum(line[:128:2])) // 21 + 205
        if line[128:].decode("ascii") != f"{checksum % 10}{checksum // 10 % 10}":
            raise ValueError(f"HY3 line {number} checksum disagrees")
    return raw.decode("cp1252").splitlines()


def parse_hy3(lines: list[str]) -> dict:
    athletes = {}
    relays, individuals = [], []
    team = athlete = entry = result = None
    for number, line in enumerate(lines, 1):
        code = line[:2]
        if code == "C1":
            team = {"clubCode": line[2:7].strip(), "lscCode": line[53:55].strip(), "name": line[7:37].strip()}
            athlete = entry = result = None
        elif code == "D1":
            athlete = {"number": line[3:8].strip(), "member": line[69:83].strip(),
                       "first": line[28:48].strip(), "preferred": line[48:68].strip(),
                       "last": line[8:28].strip(), "gender": line[2], "team": team,
                       "birthDate": line[88:96].strip()}
            athletes[(team["lscCode"], team["clubCode"], athlete["number"], athlete["gender"])] = athlete
            entry = result = None
        elif code in ("E1", "F1"):
            entry = {"raw": line, "team": team, "athlete": athlete if code == "E1" else None,
                     "distance": int(line[15:21]), "stroke": STROKES.get(line[21]),
                     "eventNumber": line[38:42].strip(), "line": number}
            if code == "F1":
                entry.update({"relayName": line[7].strip(), "gender": line[12],
                              "ageMinimum": int(line[22:25].strip() or 0),
                              "ageMaximum": int(line[25:28].strip() or 0)})
            result = None
        elif code in ("E2", "F2"):
            if entry is None or (code == "E2" and entry["athlete"] is None):
                raise ValueError(f"HY3 {code} line {number} lacks entry context")
            date_slice = line[87:95] if code == "E2" else line[102:110]
            result = {**entry, "round": line[2], "course": COURSES.get(line[11]),
                      "status": STATUS.get(line[12]), "sourceFlag": line[12],
                      "sourceTimeMs": time_ms(line[4:11]), "rawDate": date_slice,
                      "line": number, "hy3Splits": [], "hy3Members": [], "dqReasons": []}
            try:
                result["date"] = iso_date(date_slice)
            except ValueError:
                result["date"] = None
            result["timeMs"] = result["sourceTimeMs"] if result["status"] == "OK" else 0
            (relays if code == "F2" else individuals).append(result)
        elif code == "G1" and result is not None:
            # Eleven round / marker / time groups. Preserve zero slots as missing.
            for start in range(2, 123, 11):
                part = line[start:start + 11]
                if not part.strip():
                    continue
                try:
                    marker, value = int(part[1:3]), time_ms(part[3:11])
                except ValueError:
                    result.setdefault("splitParseErrors", []).append(f"Malformed G1 at line {number}")
                    continue
                if part[0] == result["round"]:
                    result["hy3Splits"].append({"marker": marker, "timeMs": value, "line": number})
        elif code == "F3" and result is not None:
            for start in range(2, 119, 13):
                part = line[start:start + 13]
                if not part.strip() or not part[1:6].strip():
                    continue
                if part[11] == result["round"] and part[12] in "1234":
                    result["hy3Members"].append({"number": part[1:6].strip(), "gender": part[0],
                                                  "namePrefix": part[6:11].strip(), "leg": int(part[12])})
        elif code in ("H1", "H2") and result is not None:
            result["dqReasons"].append(line[2:128].strip())
    return {"athletes": athletes, "relays": relays, "individuals": individuals}


def _cl2_result(value: str) -> tuple[int, str]:
    value = value.strip()
    return (0, CL2_STATUS[value]) if value in CL2_STATUS else (time_ms(value), "OK")


def parse_cl2(lines: list[str]) -> dict:
    """Keep E0 / D0 contexts and attach each F0 / G0 without name heuristics."""
    relays, individuals = [], []
    context = member = None
    for number, line in enumerate(lines, 1):
        if len(line) != 160:
            raise ValueError(f"CL2 line {number} is not 160 characters")
        code = line[:2]
        if code in ("D0", "E0"):
            relay = code == "E0"
            context = {"line": number, "isRelay": relay, "members": [], "splitRecords": [], "results": {}}
            if relay:
                context.update({"relayName": line[11], "teamCode": line[12:18].strip(),
                                "gender": line[20], "distance": int(line[21:25]),
                                "stroke": {"6": "FR", "7": "IM"}.get(line[25]),
                                "eventNumber": line[26:30].strip(), "ageCode": line[30:34],
                                "rawDate": line[37:45]})
                offsets = [("P", 54), ("S", 63), ("F", 72)]
            else:
                context.update({"member": line[39:51].strip(), "gender": line[65],
                                "distance": int(line[67:71].strip() or 0),
                                "stroke": {str(i + 1): stroke for i, stroke in enumerate(STROKES.values())}.get(line[71]),
                                "eventNumber": line[72:76].strip(), "rawDate": line[80:88]})
                offsets = [("P", 97), ("S", 106), ("F", 115)]
            for round_name, offset in offsets:
                value = line[offset:offset + 8].strip()
                if value:
                    milliseconds, status = _cl2_result(value)
                    context["results"][round_name] = {"timeMs": milliseconds, "status": status,
                                                       "course": COURSES.get(line[offset + 8])}
                    if relay:
                        heat_offset = 81 if round_name == "P" else 85
                        context["results"][round_name].update({"heat": line[heat_offset:heat_offset + 2].strip(),
                                                               "lane": line[heat_offset + 2:heat_offset + 4].strip()})
            (relays if relay else individuals).append(context)
            member = None
        elif code == "F0" and context is not None and context["isRelay"]:
            member = {"member": line[50:62].strip(), "name": line[22:50].strip(),
                      "gender": line[75], "orders": {"P": line[76], "S": line[77], "F": line[78]},
                      "line": number}
            context["members"].append(member)
        elif code == "G0" and context is not None:
            values, errors = [], []
            for start in range(63, 143, 8):
                raw_time = line[start:start + 8].strip()
                try:
                    values.append(time_ms(raw_time) if raw_time else 0)
                except ValueError:
                    values.append(0)
                    errors.append(f"CL2 line {number} has a split without exact hundredths")
            context["splitRecords"].append({"sequence": int(line[55]),
                "count": int(line[56:58]), "increment": int(line[58:62]), "type": line[62],
                "round": line[143], "member": member,
                "values": values, "errors": errors, "line": number})
        elif code in ("C1", "Z0"):
            context = member = None
    return {"relays": relays, "individuals": individuals}


def result_key(result: dict, relay: bool) -> tuple:
    team = result.get("team", {})
    owner = ((team.get("lscCode", "") + team.get("clubCode", ""), result["relayName"], result["gender"])
             if relay else result["athlete"]["member"][:12])
    return owner, result["distance"], result["stroke"], result["eventNumber"], result["rawDate"], result["round"]


def cl2_index(parsed: dict, relay: bool) -> dict:
    indexed = collections.defaultdict(list)
    for row in parsed["relays" if relay else "individuals"]:
        owner = (row["teamCode"], row["relayName"], row["gender"]) if relay else row["member"]
        for round_name, result in row["results"].items():
            indexed[(owner, row["distance"], row["stroke"], row["eventNumber"], row["rawDate"], round_name)].append((row, result))
    return indexed


def match_companion(result: dict, indexed: dict, relay: bool) -> tuple[dict | None, str | None]:
    matches = [(row, other) for row, other in indexed.get(result_key(result, relay), [])
               if other["timeMs"] == result["timeMs"] and other["status"] == result["status"]
               and other["course"] == result["course"]]
    if len(matches) != 1:
        return None, "Companion CL2 total missing, conflicting or ambiguous"
    return matches[0][0], None


def verified_splits(result: dict, companion: dict, relay: bool) -> tuple[list[dict], str, list[str]]:
    """Use exact paired values and explicit CL2 distances; fail closed on contradictions."""
    errors = list(result.get("splitParseErrors", []))
    positive = [s["timeMs"] for s in result["hy3Splits"] if s["timeMs"] > 0]
    if errors:
        return [], "unavailable", errors
    if not positive:
        return [], "unavailable", []
    points = {}
    increments = set()
    leg_distance = result["distance"] // 4 if relay and result["distance"] % 4 == 0 else None
    for record in companion["splitRecords"]:
        if record["round"] != result["round"]:
            continue
        errors.extend(record.get("errors", []))
        increment = record["increment"]
        increments.add(increment)
        if increment <= 0 or record["sequence"] < 1 or record["type"] != "C":
            errors.append("CL2 split increment, sequence or cumulative type unsupported")
            continue
        base = 0
        if relay:
            member = record["member"]
            order = member["orders"].get(result["round"]) if member else None
            if not leg_distance or order not in ("1", "2", "3", "4"):
                errors.append("Relay CL2 split lacks an explicit F0 leg boundary")
                continue
            base = (int(order) - 1) * leg_distance
        for slot, value in enumerate(record["values"]):
            if value <= 0:
                continue
            local = ((record["sequence"] - 1) * 10 + slot + 1) * increment
            distance = base + local
            if distance > result["distance"] or (relay and local > leg_distance):
                errors.append("CL2 split falls outside its event or relay leg")
            elif distance in points and points[distance] != value:
                errors.append("Conflicting CL2 split at the same distance")
            else:
                points[distance] = value
    if len(increments) != 1:
        errors.append("CL2 split increments are missing or inconsistent")
    ordered = sorted(points.items())
    if [value for _, value in ordered] != positive:
        errors.append("HY3 / CL2 positive cumulative split values disagree")
    previous = 0
    for distance, value in ordered:
        if value <= previous:
            errors.append("Non-increasing cumulative split times")
        if result["sourceTimeMs"] and (value > result["sourceTimeMs"] or (value == result["sourceTimeMs"] and distance != result["distance"])):
            errors.append("A cumulative total contradicts its explicit CL2 distance")
        if distance == result["distance"] and value != result["sourceTimeMs"]:
            errors.append("Last cumulative split disagrees with relay or swim total")
        previous = value
    if errors:
        return [], "unavailable", sorted(set(errors))
    increment = next(iter(increments))
    splits = []
    previous_distance = previous_value = 0
    for distance, value in ordered:
        point = {"distance": distance, "cumulativeMs": value}
        # A difference across missing intermediate marks is not a lap time.
        if distance - previous_distance == increment:
            point["lapMs"] = value - previous_value
        splits.append(point)
        previous_distance, previous_value = distance, value
    expected = list(range(increment, result["distance"] + 1, increment))
    coverage = "complete" if [d for d, _ in ordered] == expected and expected[-1] == result["distance"] else "partial"
    # DQ and other non-OK records have no official total. Their observed split
    # detail is evidence, so it cannot claim complete coverage of an official time.
    if result.get("status", "OK") != "OK":
        coverage = "partial"
    return splits, coverage, []


def read_archive(path: Path, hy3_name: str | None = None) -> tuple[dict, dict, str]:
    with zipfile.ZipFile(path) as archive:
        hy3_name = hy3_name or next(name for name in archive.namelist() if name.lower().endswith(".hy3"))
        cl2_name = next(name for name in archive.namelist() if name.lower().endswith(".cl2"))
        return (parse_hy3(verify_hy3(archive.read(hy3_name))),
                parse_cl2(archive.read(cl2_name).decode("cp1252").splitlines()), cl2_name)
