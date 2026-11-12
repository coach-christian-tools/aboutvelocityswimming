"""Normalize saved captures into additive Velocity Imports rows."""
from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path
import sys
import zipfile

import meet_catalog
import race_import as races


MAX_CAPTURE_BYTES = 200_000_000
KIND_BY_COLLECTION = {"teams": "team", "venues": "venue", "athletes": "athlete",
                      "meets": "meet", "swims": "swim", "relay_results": "relay"}
DIVISION_BY_KIND = {"catalog_meet": "knowledge", "meet": "times", "swim": "times", "relay": "times"}


def read_capture(path):
    if path.stat().st_size > MAX_CAPTURE_BYTES:
        raise ValueError("Capture exceeds the local file size budget")
    return path.read_bytes()


def load_json(path):
    return json.loads(read_capture(path))


def bounded_text(value, label, maximum):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum or any(ord(c) < 32 for c in value):
        raise ValueError(f"{label} must be nonempty text of at most {maximum} characters")
    return value


def row(kind, record_id, data, locator=None, prerequisites=None, blocker=None):
    races.identifier(record_id)
    if not isinstance(data, dict) or ("id" in data and data["id"] != record_id):
        raise ValueError("Capture row data must be an object with matching record identity")
    result = {"kind": kind, "id": record_id, "data": data}
    if locator is not None:
        result["locator"] = bounded_text(locator, "Source row locator", 300)
    if prerequisites:
        result["prerequisites"] = prerequisites
    if blocker is not None:
        result["blocker"] = bounded_text(blocker, "Import blocker", 500)
    return result


def metadata(capture, artifact_hash):
    coverage = capture["coverage"]
    if coverage not in ("partial", "complete", "unknown"):
        raise ValueError("Coverage must be partial, complete, or unknown")
    source = races.url(bounded_text(capture["sourceUrl"], "Source URL", 2048))
    captured_at = races.timestamp(capture["capturedAt"]).isoformat()
    scope = bounded_text(capture["sourceScope"], "Source scope", 300)
    return {"sourceUrl": source, "capturedAt": captured_at, "coverage": coverage,
            "sha256": artifact_hash, "sourceScope": scope}


def structured_rows(source):
    if not isinstance(source, dict) or not isinstance(source.get("rows"), list):
        raise ValueError("Structured capture requires a rows array")
    for item in source["rows"]:
        if not isinstance(item, dict) or item.get("kind") not in DIVISION_BY_KIND:
            raise ValueError("Structured row must identify a catalog_meet, meet, swim, or relay")
        parents = item.get("prerequisites", [])
        if not isinstance(parents, list) or len(parents) > 10:
            raise ValueError("Structured row supports up to 10 linked prerequisites")
        if any(not isinstance(parent, dict) or parent.get("kind") not in ("athlete", "team", "venue") for parent in parents):
            raise ValueError("Prerequisites must be linked athlete, team, or venue records")
        if parents and item["kind"] == "catalog_meet":
            raise ValueError("Catalog entries use the Knowledge collector scope and cannot create Times prerequisites")
        linked = [row(parent["kind"], parent["id"], parent["data"]) for parent in parents]
        if len({(parent["kind"], parent["id"]) for parent in linked}) != len(linked):
            raise ValueError("Linked prerequisites must be unique within a row")
        yield row(item["kind"], item["id"], item["data"], item.get("locator"), linked, item.get("blocker"))


def catalog_rows(source, cutoff):
    if not isinstance(source, list):
        raise ValueError("IES catalog capture requires the original event array")
    for event in source:
        proposal = meet_catalog.event_proposal(event, cutoff)
        if proposal:
            races.date(proposal["data"]["startsOn"])
            if races.date(proposal["data"]["endsOn"]) < proposal["data"]["startsOn"]:
                raise ValueError("Catalog meet end date precedes the start date")
            yield row("catalog_meet", proposal["id"], proposal["data"], proposal["data"]["sourceEventId"])


def capture_batches(manifest, directory):
    captures = manifest.get("captures")
    if not isinstance(captures, list) or not captures:
        raise ValueError("Capture manifest requires a nonempty captures array")
    for capture in captures:
        source = read_capture(directory / capture["file"])
        artifact_hash = races.sha(source)
        if capture.get("sha256", artifact_hash) != artifact_hash:
            raise ValueError("Saved capture SHA-256 differs from the manifest")
        capture_metadata = metadata(capture, artifact_hash)
        contents = json.loads(source)
        if capture["format"] == "structured":
            rows = structured_rows(contents)
        elif capture["format"] == "ies-catalog":
            rows = catalog_rows(contents, races.date(capture["cutoff"]))
        else:
            raise ValueError("Capture format must be structured or ies-catalog")
        divisions = collections.defaultdict(list)
        for candidate in rows:
            divisions[DIVISION_BY_KIND[candidate["kind"]]].append(candidate)
        for division, candidates in divisions.items():
            yield {**capture_metadata, "division": division, "rows": candidates}


def prepare_archives(manifest, directory, mappings):
    races.validate_sources(manifest)
    if manifest.get("scope") == "whole-catalog":
        raise ValueError("Use an explicit meet selection for this additive upload")
    races.identity_hold_table(mappings)
    references = {"athletes/" + identity["athleteId"]: {} for identity in mappings.get("identities", [])}
    parsed_sources = []
    holds = []
    for source in manifest["sources"]:
        if source.get("available") is False:
            holds.append({"kind": "source_unavailable", "sourceId": source["id"], "reason": source["reason"]})
            continue
        binding = source["meetIdentity"]
        if binding.get("dateCrosswalk"):
            raise ValueError("A reviewed catalog date conflict requires the existing race correction workflow")
        if binding.get("canonicalMeet"):
            path = "meets/" + binding["canonicalMeet"]["id"]
            expected = {key: source["meet"][key] for key in ("startsOn", "endsOn")}
            if path in references and references[path] != expected:
                raise ValueError("Reviewed crosswalks disagree on the same canonical meet dates")
            references[path] = expected
        parsed_sources.append((source, races.read_source(source, directory)))

    # These are explicit reviewed ID references. The database verifies them
    # against current rows when checking a candidate and when approving it.
    clean, dependencies, parsing_holds, duplicates, _ = races.plan(manifest, references, mappings, parsed_sources)
    holds.extend(parsing_holds)
    grouped = collections.defaultdict(list)
    sources_by_id = {source["id"]: source for source, _ in parsed_sources}
    for item in clean.values():
        collection, record_id = item["path"].split("/", 1)
        data = item["after"]
        evidence = data["sourceObservation"]
        source_line = evidence["line"]
        if evidence.get("canonicalMeetCrosswalk"):
            source_meet = sources_by_id[item["sourceId"]]["meet"]
            evidence["canonicalMeetCrosswalk"] = {
                **evidence["canonicalMeetCrosswalk"],
                "startsOn": source_meet["startsOn"],
                "endsOn": source_meet["endsOn"],
            }
        parents = [row(KIND_BY_COLLECTION[path.split("/")[0]], path.split("/", 1)[1], dependencies[path])
                   for path in item["requires"] if path in dependencies and not path.startswith("meets/")]
        grouped[item["sourceId"]].append(row(KIND_BY_COLLECTION[collection], record_id, data,
            str(source_line), parents))

    batches = []
    for source, _ in parsed_sources:
        candidates = grouped[source["id"]]
        if source["meetIdentity"].get("canonicalMeet") is None:
            meet_id = source["meetId"]
            meet_path = "meets/" + meet_id
            body = dependencies.get(meet_path) or {
                "id": meet_id, **source["meet"], "knowledgeEntryId": meet_id,
                "sourceUrl": source["meet"].get("sourceUrl") or source["url"],
            }
            candidates.insert(0, row("meet", meet_id, body, "HY3 B1 header"))
        if candidates:
            capture_metadata = metadata({"sourceUrl": source["url"], "capturedAt": source["capturedAt"],
                "coverage": "partial", "sourceScope": source["sourceScope"]["kind"] + " · " + source["sourceScope"]["basis"]},
                source["sha256"])
            batches.append({**capture_metadata, "division": "times", "rows": candidates})
    return batches, holds, duplicates


def prepare(manifest_path, mappings_path=None):
    manifest = load_json(manifest_path)
    if (not isinstance(manifest, dict) or type(manifest.get("version")) is not int
            or manifest["version"] != 1 or not isinstance(manifest.get("project"), str) or not manifest["project"]):
        raise ValueError("Manifest requires version 1 and an explicit project")
    if ("captures" in manifest) == ("sources" in manifest):
        raise ValueError("Use either a capture manifest or an explicit paired race source manifest")
    if "sources" in manifest:
        if mappings_path is None:
            raise ValueError("Paired race source manifests require the reviewed --mappings file")
        batches, holds, duplicates = prepare_archives(manifest, manifest_path.parent, load_json(mappings_path))
    else:
        if mappings_path is not None:
            raise ValueError("--mappings applies to paired race archives")
        batches = list(capture_batches(manifest, manifest_path.parent))
        holds, duplicates = [], []
    return {"project": manifest["project"], "batches": batches, "holds": holds, "duplicates": duplicates}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--mappings", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    arguments = parser.parse_args()
    try:
        races.save(arguments.output, prepare(arguments.manifest, arguments.mappings))
    except (ValueError, KeyError, TypeError, AttributeError, OSError, zipfile.BadZipFile) as error:
        print(f"Capture preparation failed. {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
