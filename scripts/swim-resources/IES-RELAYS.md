# Preparing IES relays and splits

`prepare-ies-relays.py` prepares local review batches from the retained official
HY-TEK ZIP exports. It does not connect to a database, stage batches, or publish
results. Use Python 3.10 or newer; no third-party Python packages are required.

```sh
python3 scripts/swim-resources/prepare-ies-relays.py \
  --archive-dir backups/ies-results/2026-10-10 \
  --baseline backups/ies-relays/2026-10-13/baseline.json \
  --identity-manifest backups/ies-results/2026-10-10/manifest.json \
  --output backups/ies-relays/2026-10-13/prepared \
  --lead-off-verifications backups/ies-relays/2026-10-13/lead-off-verifications.json
```

The optional lead-off verification file can be omitted. Omission retains first
leg candidates for review without creating individual performances.

## Inputs and safety

- The archive directory contains original `captures.json`, `baseline.json`
  approved meet metadata, and the captured ZIP files. Archive SHA-256 and every
  HY3 line checksum are verified before preparation.
- The current baseline must contain `capturedAt` and `athletes`, `swims`, `meets`,
  `teams`, and `relay_results` arrays of `{id,data}`. Export full private current
  records, including raw swim data needed to preserve before/after updates.
- The prior identity manifest contains `identityMappings` with
  `sourceMemberIdHash` and `athleteId`. IDs must still exist in the current
  baseline. A same-name swimmer is never sufficient to establish identity.
- Save output in a private gitignored directory. The source ZIPs and DOB/USAS
  member identities must never enter Git, a web artifact, or a public projection.
  Proposed records include public names and only computed race-day ages; raw
  DOB and registration identifiers remain in source input only.
- Review batches contain full `after` objects and separate `reads` before
  snapshots. The collection endpoint must compare these snapshots before
  staging. Approvals also check the stored snapshots for stale changes.
- The runner refuses to regenerate a directory containing
  `staging-receipts.json`. Preserve receipts and use a new directory for a new
  baseline. Preparation is deterministic for the same inputs and capture time.

## Validation and output

Relay totals are independently matched to companion CL2 `E0` records by team,
squad letter, gender, event, date, round, status, course, and exact hundredths.
Relay IDs also include age category and heat/lane so combined events and multiple
same-letter squads do not collapse. A relay total belongs to the team and is
stored in `relay_results`, never as a swimmer's individual time.

HY3 `F3` order links to the team's local `D1` athlete number and then the
companion CL2 `F0` member identity. Missing or conflicting members remain partial.
Current profiles are linked only through stable source identities. Existing
result source observations can bridge an alternate identity only when the
published event, date, round, status, and total still agree exactly.

Split distances come from CL2 `G0` explicit distance, sequence, slot, and relay
`F0` leg order. HY3 marker units are never guessed. Positive cumulative values
must agree between both exports, increase, stay within the race and leg, and
agree with the exact final boundary whenever present. Zero or empty slots are
missing detail, never zero-duration laps. A gap prevents deriving a lap across
that gap. Contradictions hold the split set while a validated relay total may
still be proposed. Non-OK times never claim complete official split coverage.

Individual split updates preserve the entire existing raw swim. A current
performance must still match its exact source observation; existing conflicting
split detail is held for reconciliation. Repeating against published equivalent
results and splits creates no new writes.

Outputs:

- `manifest.json`: summary, ordered batches, and per-meet coverage.
- `validation-report.json`: all total, lineup, split, and eligibility holds.
- `relay-results.json`: prepared team results for local inspection.
- `batches/*.json`: at most 100 writes and 2 MB per reviewed batch, grouped by
  prerequisites, relay totals, individual split updates, and verified lead-offs.

Approve team/meet/profile prerequisites before relays, then approve linked
lead-offs. The collection stage operation creates review items; approval is a
separate operation. Existing conflicts are preserved for reconciliation.

## Independently verified lead-offs

A verification array item requires these fields:

```json
{
  "relayResultId": "hytek_relay_example",
  "athleteId": "existing_athlete",
  "timeMs": 29270,
  "verified": true,
  "flatStart": true,
  "timingVerified": true,
  "leadOffStatus": "OK",
  "sourceUrl": "https://official.example/final-results.pdf",
  "basis": "Specific reviewed source establishes first-member order, exact boundary time, valid start and official timing."
}
```

The evidence must establish eligibility independently. First-leg position or
paired archive split values alone do not establish timing eligibility. Add
report page/hash and review basis when available. The stored
`leadOffVerification` contains only the five validity/source contract fields;
the full verification remains private in `sourceObservation`. Public results
expose the verified origin and parent relay link, with no raw verification or
source observations.

Only a linked first swimmer and an exact verified first-leg boundary can create
an ordinary `swims` result with `resultOrigin: "relay_leadoff"`. Exact race-day
age must be known from consistent DOB observations bound by identical stable
source member identity; source DOB is never emitted. An existing identical
individual fingerprint is skipped. Later-leg DQ does not cancel a separately
verified valid first leg. Unknown first-leg DQ or timing eligibility remains
held. Second through fourth legs stay relay splits and never become individual
PBs or records.

## Tests

```sh
python3 tests/swim-resources/test_hytek_relays.py
```

The fixtures cover exact hundredths, corruption, freestyle/medley/mixed relays,
prelims/finals, changing HY3 marker units, missing boundaries and members,
ambiguous totals, long-distance sequences, contradictory cumulative times,
non-OK coverage, explicit lead-off verification, later teammate DQ, duplicates,
private-source omission, before snapshots, and repeated preparation.
