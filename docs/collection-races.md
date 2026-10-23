# Repeatable file-only race preparation

`npm run collection:races -- prepare ... --dry-run` reads retained official
paired HY3/CL2 archives and writes private local proposals. It has no network,
database, subprocess, staging, approval, or deployment operation. Acquisition
and live execution are separate authorized steps. Every swimmer in each supplied
archive is considered, including visiting clubs. Source availability, archive
scope, and result-import completeness remain separate facts.

Use installed Node 24 for npm commands. Python uses only the standard library.
Keep sources, baselines, mapping decisions, checkpoints, and proposals below the
checkout's gitignored `backups/`; never commit source data or credentials. Output
directories are created with mode 0700 and artifact files with mode 0600.

## Inputs

Use **Download private race baseline** in `/tools/review` while signed in as
verified staff. It exports all five canonical collections, private identity
mappings, and **every listed catalog meet**, independently of saved selections.
Pages and closing counts must share the same canonical revision. Any change
aborts the download. The file includes `canonicalRevision`, verified consistency,
exact `collectionCounts`, and `completeCollections`. Keep the file private under
`backups/`; never edit attestations to make an older snapshot appear current.

Old snapshots can still produce offline planning artifacts. They cannot pass
staging or the launch preflight without the consistent export revision.

Generate the campaign scope without collecting any source or importing data:

```sh
npm run collection:races -- catalog-scope \
  --baseline backups/<run>/inputs/baseline.json \
  --output backups/<run>/inputs/sources.json
```

This lists all exported catalog IDs with **pending acquisition** receipts.
Replace each pending receipt only after reviewing the official source and its
all-swimmer coverage; genuine unavailable sources retain an explicit reason.
Whole-catalog preparation and server staging reject omitted catalog meets.
Selected-meet experiments are explicitly labeled pilots and do not fulfill the
whole-catalog campaign.

`project` is the exact hosted Supabase project ref, or
`local:aboutvelocityswimming` for a verified synthetic local snapshot. The source
manifest must name the same project. Prepared batches carry that target;
`stage.mjs` checks it before creating a client. No environment file is read by
the preparer. Staging also refuses these preparer's offline/unattested baselines,
baselines older than 24 hours, and missing input provenance hashes. Never copy a
hosted snapshot's target label to an unrelated DB.
Hosted destinations must be the exact HTTPS project origin; local synthetic
staging is restricted to the documented HTTP localhost API on port 54321.

A source manifest explicitly names every selected meet. Multiple archives for a
meet are allowed. Missing archives require an `available:false` receipt and a
reason; they never disappear from coverage. Synthetic shape:

```json
{
  "version": 1,
  "project": "intended-project-ref",
  "selectedMeetIds": ["catalog-meet-id"],
  "sources": [{
    "id": "stable-capture-id",
    "meetId": "catalog-meet-id",
    "file": "official-results.zip",
    "url": "https://official.example/results.zip",
    "sha256": "<64 lowercase hex characters from retained original bytes>",
    "hy3": "Exact archive member.hy3",
    "cl2": "Exact companion member.cl2",
    "capturedAt": "2026-10-14T12:00:00Z",
    "official": true,
    "officialBasis": "Specific official result listing and capture evidence",
    "sourceScope": {"kind":"unknown","basis":"Meet-wide completeness unverified"},
    "meet": {"name":"Selected meet","startsOn":"2025-06-04","endsOn":"2025-06-04"},
    "meetIdentity": {
      "reviewed": true,
      "basis": "Reviewed catalog/official archive identity crosswalk",
      "fileMeet": {"name":"Exact B1 name","startsOn":"2025-06-04","endsOn":"2025-06-04"}
    }
  }]
}
```

Archive paths resolve relative to the source manifest. No archive is extracted
onto disk. ZIP member lengths are bounded, archive/member hashes retained, and
every HY3 line must pass length/checksum validation. The exact B1 name/date
crosswalk must be reviewed; a mismatched meet is blocked. Narrower exports keep
partial coverage. `sourceScope.kind` is `meet-wide`, `club-filtered`, or `unknown`;
even a meet-wide archive does not establish complete historical discovery.
Source URLs must have encoded spaces and contain no raw whitespace. Preserve a
listing's original literal URL in the retained receipt and optional `originalUrl`
provenance; use its percent-encoded equivalent for the operational source URL.

`meetId` identifies the selected catalog entry. When that entry corresponds to
an existing canonical meet with a different ID, add an explicit
`meetIdentity.canonicalMeet` object with `id`, `reviewed: true`, `basis`, and
`sourceUrl`. The target must already exist in the complete baseline with exact
known date endpoints. Conflicting legacy flat or nested dates are held. The
crosswalk determines race/dependency identity; source evidence and coverage keep
the catalog ID. Names or matching dates never create a crosswalk automatically.

### Reviewed catalog/source date conflicts

A known catalog date endpoint that differs from `source.meet` holds that source
unless `source.meetIdentity.dateCrosswalk` supplies one reviewed exception.
Version 1 supports **one exact actual meet day**, not a widened interval. The
actual endpoints must equal both `source.meet` and the checksummed HY3 B1
header exactly. A catalog April 26 observation and actual April 27 meet never
become an invented April 26–27 span. The catalog row and acquisition checkpoint
remain unchanged. The exception establishes dates, without inferring a timezone
cause, a rescheduling sequence, complete meet coverage or record eligibility.

The crosswalk has exactly these fields:

```json
{
  "version":1,
  "reviewed":true,
  "basis":"Specific independent official numeric-date evidence; conflicting observation retained",
  "sourceArchiveSha256":"<exact retained source archive SHA-256>",
  "catalogObservation":{
    "meetId":"catalog-meet-id",
    "canonicalRevisionReviewed":"123",
    "dataSha256":"<SHA-256 of race_import.encode(exact catalog data object)>",
    "hashEncoding":"race_import.encode(catalog data): sorted compact UTF-8 JSON, no trailing newline",
    "startsOn":"2025-06-04", "endsOn":"2025-06-04",
    "rawStartValue":"2025-06-04T23:00:00-07:00",
    "rawEndValue":"2025-06-04T23:00:00-07:00",
    "sourceUrl":"https://official.example/events#/team-events/past/1",
    "rawListingSha256":"<retained original official event-array SHA-256>"
  },
  "actualMeet":{"startsOn":"2025-06-05","endsOn":"2025-06-05"},
  "preserveCatalogObservation":true,
  "reschedulingCauseOrSequenceEstablished":false,
  "evidence":[
    {"kind":"official_catalog_listing","sha256":"<listing hash>",
     "receiptSha256":"<listing receipt bytes hash>","sourceUrl":"https://official.example/events/raw"},
    {"kind":"official_sanctioned_announcement","sha256":"<announcement hash>",
     "receiptSha256":"<announcement receipt bytes hash>","sourceUrl":"https://official.example/announcement.pdf",
     "numericDate":"2025-06-05","page":1,"sanction":"OFFICIAL-1"},
    {"kind":"official_paired_result_archive","sha256":"<source archive hash>",
     "receiptSha256":"<archive receipt bytes hash>","sourceUrl":"https://official.example/results.zip",
     "hy3Sha256":"<exact HY3 member hash>","cl2Sha256":"<exact CL2 member hash>",
     "individualRaceDates":{"2025-06-05":12},"relayRaceDates":{}}
  ]
}
```

Hash placeholders denote 64 lowercase hexadecimal characters. The reviewed
revision is a canonical nonnegative decimal string retained as historical
provenance. A newer complete consistent baseline is acceptable only while the
exact catalog data hash, observed endpoints and source URL still match; the
review revision is not silently changed to the current run revision. Current
whole-catalog manifest/baseline revision equality remains separately required.
The raw listing must contain exactly one matching `sourceEventId`, with both
display ISO dates and original raw timestamp strings matching the observation.
Catalog navigation fragments are retained exactly. Download URLs continue to
reject fragments, credentials and raw whitespace.

Each evidence reference has the four common fields shown. Exactly one original
listing and paired archive are required, plus at least one separate sanctioned
announcement or official entry-header authority. Optional
`official_entry_event_headers` adds `numericDate` and a nonempty unique
`memberSha256` list; every retained ZIP member hash is checked before use.
Optional `official_result_pdf` adds `numericDate` and positive `pages`; it is
corroboration and cannot replace independent date authority. Announcement
`page`/`sanction`, PDF `pages`, entry member hashes, and all other fields are
strictly typed. Unknown fields/kinds, duplicate kinds/body hashes and authority
aliasing to the result archive are rejected. Numeric dates must equal the exact
actual day. Human review establishes what an authority document says; hashing
does not independently interpret or certify its prose.

Keep the retained file paths in a separate private source field:

```json
{
  "dateEvidenceFiles":[{
    "sha256":"<one evidence body hash>","file":"retained-body.pdf",
    "receiptSha256":"<matching receipt bytes hash>","receiptFile":"retained-body.pdf.receipt.json"
  }]
}
```

There must be exactly one binding for every evidence body, without missing,
duplicate or unreferenced bindings. Relative paths resolve beside the source
manifest. Every preparation and resume rehashes both files and checks receipt
`sha256`, exact `sourceUrl`, integer `httpStatus:200` and timezone-bearing
`capturedAt`. This path map stays in private source artifacts, outside public
result provenance. New entry-authority ZIP reads check unique member names,
at most 1,000 members, 100 MB per member and 200 MB total uncompressed bytes
before reading any member; retained body/receipt files also have a 200 MB cap.

All original HY3 E2/F2 rows and every CL2 individual/relay round count toward the
date evidence, even if identity, status or relay rules later hold those rows.
The declared date counts must agree exactly across both files and account for
every original result row. Malformed or out-of-day dates block the source.
Existing canonical meets, whether the default ID or an explicit crosswalk,
must already have unambiguous known endpoints equal to the actual day; the date
exception never updates or invents canonical dates.

The full reviewed crosswalk appears in each prepared result's
`sourceObservation.dateCrosswalk`, alongside `catalogDateMatch:false` and the
original `knowledgeMeetId`. It also appears in the private run manifest's
`dateCrosswalks` and full source manifest. Source/code/baseline hashes bind the
run; changed declarations or implementation require a new directory, and changed
retained evidence bytes fail resume integrity checks. Identity/team/round/
occurrence/relay/policy holds remain independent. Passing these date checks is
not permission to stage, approve or claim source completeness. Ordinary sources
with no known catalog date conflict retain their existing behavior; absent
catalog dates are not invented or treated as date-authority proof.
Private bounded composers that rebuild `plan()` directly must call
`validate_source_dates(source, parsed, baseline, source_manifest_directory)` for
every available source before computing that plan. The companion private
composer proposal does so and rechecks retained authority bytes even after an
earlier full preparation passed. Its hash remains recorded in bounded evidence.

Historical team mappings use official source codes, names, dates and reviewed
identity evidence, rather than current registration. Mapping-file shape:

```json
{
  "teams": [{
    "clubCode":"ABC", "lscCode":"IE", "sourceNames":["Official source name"],
    "teamId":"canonical-team", "name":"Official source name",
    "validFrom":"2025-06-04", "validThrough":"2025-06-04",
    "reviewed":true, "basis":"Specific dated identity evidence",
    "sourceUrl":"https://official.example/results.zip"
  }],
  "identities": [{
    "sourceMemberIdHash":"<24 hex characters: SHA-256(member)[:24]>",
    "athleteId":"existing-athlete", "reviewed":true,
    "basis":"Independent stable identity evidence; never name alone",
    "sourceUrl":"https://official.example/identity-evidence"
  }],
  "identityHolds": [{
    "sourceMemberIdHash":"bbbbbbbbbbbbbbbbbbbbbbbb",
    "state":"unresolved",
    "basis":"Specific unresolved identity evidence retained from an earlier archive",
    "evidence":[{
      "sourceId":"earlier-official-results", "meetId":"earlier-catalog-meet",
      "archiveSha256":"<64 lowercase hex characters from retained original bytes>",
      "file":"Exact earlier archive member.hy3", "line":42,
      "sourceUrl":"https://official.example/earlier-results.zip"
    }]
  }]
}
```

`identityHolds` is an optional private persistent decision ledger. Omitting it
or supplying an empty list retains normal preparation behavior. Each entry has
exactly the four fields shown: a unique 24-character lowercase member digest,
`state:"unresolved"`, a nonempty basis, and nonempty stable source evidence.
Each evidence reference has exactly the six fields shown, valid stable source
and meet IDs, a lowercase archive SHA-256, a nonempty archive member, a positive
integer source line, and an HTTPS URL. Duplicate digests or references, malformed
entries, and resolved/unknown states are rejected. References may identify an
earlier archive outside the current preparation; carry the ledger into every new
mapping file rather than reconstructing it only from the current source names.
The validator checks the contract; the retained archive and review evidence must
be independently verified before adding a decision.

An unresolved digest holds every matching individual row before canonical
identity selection or team/meet/profile prerequisites, including rows with a
later name variant or an existing private canonical identity claim. A relay
whose HY3 lineup includes a held member is conservatively held as a whole;
the preparer does not drop that member and call the remaining lineup complete.
While any unresolved decisions remain, relay identities must establish exactly
four distinct paired HY3/CL2 members using the original D1 observations. Missing
F3/D1/F0 detail, duplicate original D1 keys, and competing full member IDs behind
a truncated CL2 prefix hold the uncertain total before prerequisites. Original
D1 alternatives are retained before the shared parser's dictionary can overwrite
them. A canonical alias to an athlete bound by a protected digest also holds the
relay. Complete unique relays unrelated to the protected identities retain their
existing behavior, including independently verified team totals without all
current profile links.
The manual-review item retains the current source row and the persistent hold's
digest, basis, and earlier source references. Row accounting still reconciles,
and held rows leave no prerequisite proposals. Holds do not remove or modify
existing canonical records.

Explicit approved identity aliases require unique digests and cannot coexist
with an unresolved hold for the same digest; duplicate/conflicting aliases are
rejected. A positive alias does not resolve a hold implicitly. Resolve the
underlying evidence through the review process, retain that decision, then
remove the unresolved entry and supply any separately justified reviewed alias
in a new mapping file and new preparation directory. This is a file-preparation
guard, not a database permission or an independent source of identity proof.

No fuzzy matching or automatic name/DOB bridging occurs. Existing private member
hashes bind to canonical athletes; explicit reviewed mappings may bridge other
stable IDs. Missing/conflicting IDs, DOBs, or names go to manual review. New
historical profiles have no invented current team/registration or coaching
fields. DOBs and raw member IDs remain in original/private cached source files;
proposals contain hashes, computed race-day ages, and bounded source references.
Reviewed alternate member IDs use one canonical athlete ID in the race key;
changing historical clubs/LSCs cannot create another person or another copy of
the same performance. New team prerequisites also avoid claiming that a historic
source club/LSC is the team's current affiliation. Held rows leave no prerequisite
drafts behind; conflicting clean prerequisite identities hold affected results.

## Preparation, interruption and repeatability

```sh
npm run collection:races -- prepare \
  --sources backups/<run>/inputs/sources.json \
  --baseline backups/<run>/inputs/baseline.json \
  --mappings backups/<run>/inputs/mappings.json \
  --output backups/<run>/prepared --dry-run
```

Add `--resume` only for the identical run. The checkpoint binds source manifest,
baseline, mapping and implementation hashes. Completed source-cache hashes and
original archive bytes are rechecked. Different inputs/code require a new output
directory. Staged runs are never regenerated. The same inputs produce identical
artifact bytes; after approved additions, fresh preparation skips existing exact
facts. Existing differing/ambiguous races are held, never overwritten. Repeated
same-event rounds without a distinct stable source identity are held rather
than collapsed. Canonical IDs are preserved when recognizing existing results.

Outputs include:

- `manifest.json`: exact inputs, hash-identified ordered batches, source-row
  reconciliation, explicit per-meet all-swimmer coverage gaps, and launch blockers.
- `source-manifest.json`: selected IDs, original/member hashes, scope, capture
  time, and verified/blocked source receipts.
- `batches/*.json`: additive Times proposals, at most 100 writes and below
  1.9 MB, including explicit before reads for additions and dependencies.
- `manual-review.json`: blocked source/identity/race evidence and split/lineup
  detail holds, separate from clean proposals. A detail hold may coexist with
  an independently verified total.
- `duplicates.json`: already represented source results.
- `record-audit.json`: every baseline IE team plus reviewed historical IE teams,
  including teams with no verified eligible rows. Individual exact-age and relay
  candidates are separate; missing historical affiliations are counted.
- `checkpoint.json` and `source-cache/`: resumable private source work.

Source row counts must reconcile exactly to prepared, duplicate, held, or
unparsed rows. DNF remains a hold because the current canonical contract does
not support it. NS/DFS/DQ retain distinct states and never become zero-time PBs.
Course and round stay separate. Companion DFS can resolve ambiguous HY3 flags.
Source round `S` requires a reviewed `roundMappings.S` object with canonical
`round` (`P/F/S/TT`), `reviewed:true`, `basis`, and `sourceUrl`, since semifinals
and swim-offs cannot be conflated. Other round overrides use the same contract.
Numeric HY3 flag `S` requires `numericSFlagReviewed:true` and
`numericSFlagBasis`; otherwise eligibility is held.
Explicit non-OK results may have no time field; that absence is retained in
`sourceTimePresent`, with status semantics and zero timing rather than an
invented performance. NS/DFS never receive imported splits or record eligibility.
Malformed individual event rows do not discard independently valid relay totals.

Relay totals are proposed only as team `relay_results`. Paired lineup and split
validation reuse the checked-in relay readers. Missing/contradictory detail
stays partial/unavailable. No relay leg becomes an individual swim. Independently
verified lead-offs remain a separate workflow in
[`IES-RELAYS.md`](../scripts/swim-resources/IES-RELAYS.md). Audit output contains
partial record candidates, not certified record-book changes; lead-off record
eligibility requires separate audit.

The record file is a **computed local candidate inventory**, not an empty
template and not an official-website comparison. It explicitly records
`officialWebsiteComparison.performed:false` and unverified historical inventory
completeness. The initial 21-team output only represented the teams in the
retained snapshot and dated mappings. It establishes neither all IES teams nor
official record-book accuracy. A later audit must reconcile a reviewed historical
club inventory and each team's authoritative record sources before claiming
completion. This paired-archive adapter does not parse PDF-only results; those
swimmers/relays remain explicit coverage gaps for another reviewed source step.

## Before any live staging

Read the pilot manifest and holds, then obtain a **fresh complete baseline** and
run the file-only preflight for the phase under review:

```sh
npm run collection:races -- check-baseline \
  --prepared backups/<run>/prepared/manifest.json \
  --baseline backups/<run>/fresh-baseline.json --phase prerequisites
```

Preflight checks project, completeness, freshness (maximum 24 hours), artifact
hashes and full expected before-images. Exit 2 means blocked. Use phases
`prerequisites`, `athletes`, then `races`; stage/approve dependencies before
dependent races and refresh the baseline between phases. Expected parent reads
use the approved prerequisite after-images, so a child cannot stage before its
parents exist. Reprepare whenever facts or scope change. Preflight itself does
not stage, sign in, refresh credentials, or alter a database. The server still
rechecks supplied snapshots during staging and approval to reject intervening
changes.
It also compares the entire fresh canonical inventory with the preparation
baseline, allowing only exact already-approved parent additions. New races under
other IDs, new aliases, or other changed facts force preparation again. An old
partial preparation cannot be unlocked by supplying a newer complete snapshot.
The server also stores the canonical revision under the shared write lock and
checks it again inside approval. **After each approved canonical batch, export
and prepare again** before staging the next batch; approving prerequisites also
changes the revision. Remaining files from an earlier revision are intentionally
stale. Do not edit their revision numbers or silently rebase pending decisions.
The migration and recovery notes are in `docs/collection-race-guard.md`.

`baseline-identity-audit.json` reports conflicting stable member identities and
unresolved overlapping canonical occurrences. It makes no repairs. Distinct
repeated starts require explicit `occurrenceMappings` with HY3 line, source round,
canonical occurrence token, reviewed basis, and source URL. Time/status/club are
not occurrence identity keys. S/TT rows without that evidence remain held.

Staging is an actual hosted write and remains separately authorized. Use only
batch files listed in the manifest, with the existing correctly scoped Times
collector. Knowledge catalog proposals use their separate collector. Staff
approve through `/tools/review`; selecting a catalog meet does not import races.
No schedule is created. Public/anonymous access cannot supply the private raw
baseline or staff approval. Never seed a hosted database.

Run `npm test` for the seed/target contracts, synthetic preparation tests, and
existing relay tests. Full verification also requires the local database suite
and browser workflows once authorized local services are accessible.

## Reviewed repeated starts and legacy provenance

Line-specific reviewed occurrence mappings are resolved before repeated-context
holds. Non-`single` tokens participate in canonical and external result IDs;
ordinary single-start IDs remain unchanged. Reordering source rows does not
change a mapped start ID, and time corrections require review instead of creating
a second result. Non-object legacy `sourceObservation` values remain unchanged
and appear as unknown provenance in the identity audit. They never supply an
inferred member/source identity. Verified parent-linked relay lead-offs remain
separate from individual starts in both matching and the audit.
