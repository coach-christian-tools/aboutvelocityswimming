"""Complete private baseline bundles with immutable, integrity-checked chunks.

This module performs local file I/O only. A bundle does not establish database
freshness: the exporter must verify a single current canonical revision, and
staging/approval retain their authoritative revision checks.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import tempfile

FORMAT = "velocity-race-baseline-chunks-v1"
CANONICAL = ("teams", "meets", "athletes", "swims", "relay_results")
CLAIMS = ("athletes", "occurrences", "results")
ROOTS = (*CANONICAL, "catalog", *("identity-" + name for name in CLAIMS))
MAX_CHUNK_BYTES = 4 * 1024 * 1024
MAX_TOTAL_BYTES = 1024 * 1024 * 1024
MAX_MANIFEST_BYTES = 4 * 1024 * 1024


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode() + b"\n"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def counts(baseline):
    required = baseline.get("completeCollections")
    if not isinstance(required, list) or len(required) != len(CANONICAL) or set(required) != set(CANONICAL):
        raise ValueError("Chunked baseline requires every canonical collection")
    canonical = baseline.get("collectionCounts", {})
    identities = baseline.get("identityCounts", {})
    result = {name: canonical.get(name) for name in CANONICAL}
    result["catalog"] = baseline.get("catalogCount")
    result.update({"identity-" + name: identities.get(name) for name in CLAIMS})
    if baseline.get("catalogComplete") is not True or any(type(n) is not int or n < 0 for n in result.values()):
        raise ValueError("Chunked baseline requires complete canonical, catalog, and identity counts")
    proof = baseline.get("consistency", {})
    revision = baseline.get("canonicalRevision")
    if not isinstance(revision, str) or not revision.isascii() or not revision.isdigit() or proof.get("verified") is not True or proof.get("revision") != revision or proof.get("exportVersion") != 1:
        raise ValueError("Chunked baseline requires a consistent canonical revision")
    return result


def load(path):
    path = Path(path).resolve()
    if path.stat().st_size > MAX_TOTAL_BYTES:
        raise ValueError("Baseline exceeds the serialized input budget; no rows were truncated")
    raw = path.read_bytes()
    baseline = json.loads(raw)
    if not isinstance(baseline, dict) or baseline.get("format") != FORMAT:
        return baseline, raw
    if len(raw) > MAX_MANIFEST_BYTES:
        raise ValueError("Baseline chunk manifest is too large")
    expected = counts(baseline)
    chunks = baseline.get("chunks")
    if not isinstance(chunks, dict) or set(chunks) != set(ROOTS):
        raise ValueError("Baseline chunk roots are incomplete or unknown")
    if any(name in baseline for name in (*CANONICAL, "catalog", "identityClaims")):
        raise ValueError("Chunked baseline cannot shadow chunks with inline rows")
    total = 0
    files = set()
    for root in ROOTS:
        if not isinstance(chunks[root], list):
            raise ValueError("Baseline chunk lists are required")
        row_count = 0
        for item in chunks[root]:
            if not isinstance(item, dict) or set(item) != {"file", "sha256", "bytes", "rows"}:
                raise ValueError("Invalid baseline chunk descriptor")
            name, size, rows = item["file"], item["bytes"], item["rows"]
            if not isinstance(name, str) or Path(name).is_absolute() or ".." in Path(name).parts:
                raise ValueError("Baseline chunks must remain inside the bundle directory")
            target = (path.parent / name).resolve()
            if not target.is_relative_to(path.parent) or target == path or target in files:
                raise ValueError("Escaping or repeated baseline chunk")
            files.add(target)
            if type(size) is not int or not 0 < size <= MAX_CHUNK_BYTES or type(rows) is not int or not 1 <= rows <= 500:
                raise ValueError("Baseline chunk exceeds a bounded byte or row budget")
            total += size
            row_count += rows
        if row_count != expected[root]:
            raise ValueError("Baseline chunk row counts do not cover " + root)
    if total > MAX_TOTAL_BYTES:
        raise ValueError("Complete baseline exceeds serialized input budget; no rows were truncated")
    expanded = {key: value for key, value in baseline.items() if key not in ("format", "chunks")}
    expanded["identityClaims"] = {}
    for root in ROOTS:
        rows = []
        ids = set()
        for item in chunks[root]:
            target = (path.parent / item["file"]).resolve()
            if target.stat().st_size != item["bytes"]:
                raise ValueError("Baseline chunk size changed: " + root)
            data = target.read_bytes()
            if digest(data) != item["sha256"]:
                raise ValueError("Baseline chunk digest changed: " + root)
            value = json.loads(data)
            if not isinstance(value, dict) or set(value) != {"version", "collection", "rows"} or value["version"] != 1 or value["collection"] != root or not isinstance(value["rows"], list) or len(value["rows"]) != item["rows"]:
                raise ValueError("Baseline chunk contents disagree with manifest: " + root)
            for row in value["rows"]:
                if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not row["id"] or not isinstance(row.get("data"), dict) or row["id"] in ids:
                    raise ValueError("Invalid or duplicate baseline row: " + root)
                ids.add(row["id"])
            rows.extend(value["rows"])
        if root.startswith("identity-"):
            expanded["identityClaims"][root[9:]] = rows
        else:
            expanded[root] = rows
    return expanded, raw


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists():
        if path.read_bytes() == data:
            return
        raise ValueError("Refusing to replace an existing immutable baseline artifact")
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        stream.write(data)
        temporary = stream.name
    os.replace(temporary, path)


def write(baseline, path):
    """Write all rows, reusing identical content-addressed chunks on disk."""
    path = Path(path).resolve()
    metadata = {key: value for key, value in baseline.items() if key not in (*CANONICAL, "catalog", "identityClaims", "format", "chunks") and not key.startswith("_")}
    identities = baseline.get("identityClaims")
    if not isinstance(identities, dict) or set(identities) != set(CLAIMS) or any(not isinstance(identities[name], list) for name in CLAIMS):
        raise ValueError("Every complete identity claim collection is required")
    observed = {name: len(identities[name]) for name in CLAIMS}
    declared = baseline.get("identityCounts")
    if "identityCounts" in baseline and (not isinstance(declared, dict) or set(declared) != set(CLAIMS) or any(type(declared[name]) is not int or declared[name] != observed[name] for name in CLAIMS)):
        raise ValueError("Declared identity counts disagree with supplied complete claim collections")
    metadata["identityCounts"] = observed
    expected = counts(metadata)
    metadata.update(format=FORMAT, chunks={})
    for root in ROOTS:
        source = baseline.get("identityClaims", {}).get(root[9:]) if root.startswith("identity-") else baseline.get(root)
        if not isinstance(source, list) or len(source) != expected[root]:
            raise ValueError("Cannot write an incomplete baseline: " + root)
        pages = []
        pending = []
        pending_bytes = 0
        header_bytes = len(encoded({"version": 1, "collection": root, "rows": []}))
        def flush():
            if not pending:
                return
            data = encoded({"version": 1, "collection": root, "rows": pending})
            if len(data) > MAX_CHUNK_BYTES:
                raise ValueError("A single baseline row exceeds the chunk budget")
            h = digest(data)
            name = "chunks/" + h + ".json"
            atomic(path.parent / name, data)
            pages.append({"file": name, "sha256": h, "bytes": len(data), "rows": len(pending)})
            pending.clear()
        for row in source:
            row_bytes = len(encoded(row))
            if pending and (len(pending) >= 500 or header_bytes + pending_bytes + row_bytes > MAX_CHUNK_BYTES):
                flush()
                pending_bytes = 0
            pending.append(row)
            pending_bytes += row_bytes
        flush()
        metadata["chunks"][root] = pages
    data = encoded(metadata)
    # Validate every immutable file before publishing the new manifest.
    temporary = path.with_name(path.name + ".verify")
    atomic(temporary, data)
    try:
        load(temporary)
        atomic(path, data)
    finally:
        temporary.unlink(missing_ok=True)
    return metadata


def refresh_additions(prior, proof, closing, expected_paths):
    """Reuse a complete snapshot only after authoritative unchanged-set proof.

    The exporter supplies server hashes/counts excluding exactly the approved
    additions, their current full snapshots, and a complete fresh claim export.
    Updating an existing canonical row requires a different refresh plan.
    """
    old_proof = prior.get("consistency", {})
    if old_proof.get("verified") is not True or old_proof.get("revision") != prior.get("canonicalRevision") or old_proof.get("exportVersion") != 1:
        raise ValueError("Prior baseline is not a verified complete snapshot")
    revision = proof.get("revision")
    if proof.get("project") != prior.get("project") or closing.get("project") != prior.get("project") or not isinstance(revision, str) or closing.get("revision") != revision:
        raise ValueError("Project or canonical revision changed during refresh")
    previous = prior.get("exportProvenance", {}).get("serverSnapshotHashes", {})
    roots = (*CANONICAL, "catalog")
    fingerprints = proof.get("fingerprints", {})
    if set(previous) != set(roots) or set(fingerprints) != set(roots):
        raise ValueError("Authoritative fingerprints must cover every canonical and catalog collection")
    expected_paths = set(expected_paths)
    additions = proof.get("additions")
    if not isinstance(additions, list) or len(additions) != len(expected_paths) or {row.get("path") for row in additions} != expected_paths:
        raise ValueError("Current additions do not exactly match the reviewed approved set")
    result = {key: value for key, value in prior.items() if key not in (*roots, "identityClaims", "identityCounts", "format", "chunks") and not key.startswith("_")}
    for root in roots:
        rows = prior.get(root)
        fingerprint = fingerprints[root]
        old = previous[root]
        fresh = [row for row in additions if row["path"].startswith(root + "/")]
        if type(old.get("count")) is not int or old["count"] < 0 or type(fingerprint.get("unchangedCount")) is not int:
            raise ValueError("Unchanged-set proof requires explicit integer counts: " + root)
        valid_old_hash = old.get("snapshotHash") is None if old["count"] == 0 else re.fullmatch(r"[a-f0-9]{32}", old.get("snapshotHash") or "")
        valid_unchanged_hash = fingerprint.get("unchangedHash") is None if fingerprint["unchangedCount"] == 0 else re.fullmatch(r"[a-f0-9]{32}", fingerprint.get("unchangedHash") or "")
        if not valid_old_hash or not valid_unchanged_hash:
            raise ValueError("Missing or invalid authoritative unchanged-set hash: " + root)
        if not isinstance(rows, list) or len(rows) != old.get("count") or fingerprint.get("unchangedCount") != len(rows) or fingerprint.get("unchangedHash") != old.get("snapshotHash"):
            raise ValueError("Cached baseline changed outside the verified additions: " + root)
        valid_hash = fingerprint.get("snapshotHash") is None if fingerprint.get("count") == 0 else re.fullmatch(r"[a-f0-9]{32}", fingerprint.get("snapshotHash") or "")
        if type(fingerprint.get("count")) is not int or type(closing.get("counts", {}).get(root)) is not int or fingerprint.get("count") != len(rows) + len(fresh) or closing["counts"][root] != fingerprint["count"] or not valid_hash:
            raise ValueError("Current collection count/hash proof is incomplete: " + root)
        ids = {row["id"] for row in rows}
        added = []
        for row in fresh:
            rid = row["path"][len(root) + 1:]
            if not rid or "/" in rid or rid in ids or not isinstance(row.get("data"), dict):
                raise ValueError("Refresh supports verified additions only; export changed rows separately")
            ids.add(rid)
            added.append({"id": rid, "data": row["data"]})
        result[root] = [*rows, *added]
    if any(path.split("/", 1)[0] not in roots for path in expected_paths):
        raise ValueError("Unknown canonical addition root")
    identities = proof.get("identityClaims", {})
    identity_counts = proof.get("identityCounts", {})
    if set(identities) != set(CLAIMS) or set(identity_counts) != set(CLAIMS):
        raise ValueError("Refresh requires every complete identity collection")
    for name in CLAIMS:
        rows = identities[name]
        if not isinstance(rows, list) or type(identity_counts[name]) is not int or len(rows) != identity_counts[name] or closing.get("identityCounts", {}).get(name) != len(rows):
            raise ValueError("Identity export is incomplete: " + name)
        ids = [row.get("id") for row in rows]
        if any(not isinstance(rid, str) or not rid for rid in ids) or len(set(ids)) != len(ids) or any(not isinstance(row.get("data"), dict) for row in rows):
            raise ValueError("Identity export has duplicate or invalid rows")
    result.update(capturedAt=proof["capturedAt"], canonicalRevision=revision,
        consistency={"verified": True, "revision": revision, "exportVersion": 1},
        collectionCounts={root: len(result[root]) for root in CANONICAL}, catalogCount=len(result["catalog"]),
        identityClaims=identities, identityCounts=identity_counts,
        exportProvenance={"method": "Complete verified unchanged-set reuse plus current approved additions and complete current identity export; not a recovery backup",
            "previousCanonicalRevision": prior["canonicalRevision"], "closingCapturedAt": closing["capturedAt"],
            "serverSnapshotHashes": {root: {key: fingerprints[root][key] for key in ("count", "snapshotHash")} for root in roots},
            "unchangedSetProof": fingerprints, "verifiedAdditionPaths": sorted(expected_paths),
            "snapshotFunctionHash": proof["snapshotFunctionHash"], "athleteSnapshotFunctionHash": proof["athleteSnapshotFunctionHash"]})
    counts(result)
    return result
