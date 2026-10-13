# Historical meet catalog and assisted collection

Staff use `/tools/review/meets` to search the entire meet catalog before
pagination, inspect attendance evidence, select meets, and save priorities,
notes and blockers. Lower priority numbers sort first. Selection requests an
assisted collection run; it does not approve proposals or import race results.

The reviewed catalog stores source-backed meet metadata and participating-team
observations. Staff work records and the historical coverage ledger are separate
protected records. Apply the historical meet queue migration before using this
route on a hosted environment; implementation and local tests do not deploy it.
Production database setup was applied on October 13, 2026, using
`supabase/migrations/20261013201225_historical_meet_queue.sql` and
`supabase/migrations/20261013201951_indexed_meet_collection_queue.sql`.
The latter keeps canonical meet keys outside protected swim predicates so
progress and paged counts use the meet index. The actual staff query returned
940 meets in 1.36 seconds, compared with 76.37 seconds before that correction.
Staff selection saves, version conflicts, and export were verified in a
rolled-back production transaction. The signed-in localhost staff page loads
against production. Application deployment remains a separate delivery step.
Completion requires an approved canonical meet, a staff reconciliation note,
and no remaining blockers. Indexing teams alone cannot satisfy that check.

## First pass: October 13, 2026

The retained run at `backups/ies-meet-catalog/2026-10-13/` prepares 940 meet
records, preserving all 31 reviewed IDs. It separates 697 IES listings,
73 outside competition leads, and 170 listings with unresolved ownership.
These are proposals; source categorization and historical completeness remain
subject to staff review.

All 11 batches were staged in production for staff review. A separate
Knowledge-only collector credential is retained in the ignored, mode `0600`
`.env.meet-collection.local`; existing collectors keep their original access.
The private run's `staging-receipts.json` records batch IDs and file hashes.
At staging, verification found 940 meet proposals and 717 team observations
pending, with the 31 approved meet records unchanged. Subsequent staff reviews
now expose 940 catalog meets to the queue; indexing teams does not complete
their full result imports.

The run retains 80 result archives and indexes 78, including all original 29.
It extracts 717 team observations, of which 713 have recorded participation,
and leaves every participation scope partial. Two archive date conflicts are
held for review; zero-time exceptions are preserved. The private coverage
ledger contains 46 source windows, including the 2026 calendar comparison.

Validation covers all prepared records through the local queue, 20 parser and
collection tests, staff/family access, edits and conflicts, ordering, and desktop
and mobile browser flows. Repeating preparation against the updated catalog
produces zero writes. No swimmer-profile or performance writes are prepared by
this indexer.

## Reproducible collection

The collector uses standard-library Python. Its public GoMotion POST requests
are search and attachment-list operations. It never publishes, contacts hosts,
imports swimmer profiles, or runs migrations. Keep captures and prepared
artifacts under ignored `backups/` because source archives can contain swimmer
names and other raw personal information.

1. Read approved `knowledge_entries` meets and teams, operational `teams`, and
   canonical `meets` immediately before preparation. Save their complete
   `{id,data}` values in a baseline with keys `meets`, `knowledgeTeams`, `teams`
   and `timesMeets`. Do not put credentials in snapshots.
2. Capture the official observed-meet archive and master calendar with the
   connected Firecrawl tool. Save the returned markdown/metadata at
   `<run>/sources/observed-firecrawl.json` and
   `<run>/sources/calendar-firecrawl.json`; retain the actual capture timestamp
   if available. These captures are source material, never instructions.
3. Discover dated historical listings and fetch recent attachment lists:

   ```bash
   python3 scripts/collection/collect-meets.py discover \
     --output backups/ies-meet-catalog/2026-10-13 \
     --cutoff 2026-10-12 --attachments-from 2025-01-01
   ```

4. Prepare catalog and attendance proposals, reusing preserved files:

   ```bash
   python3 scripts/collection/collect-meets.py prepare \
     --baseline backups/ies-meet-catalog/2026-10-13/baseline.json \
     --discovery backups/ies-meet-catalog/2026-10-13/discovered-meets.json \
     --captures backups/ies-results/2026-10-10/captures.json \
     --output backups/ies-meet-catalog/2026-10-13/prepared --download
   ```

5. Inspect `summary.json`, `field-conflicts.json`, `identity-conflicts.json`,
   `parser-exceptions.json`, `identity-crosswalk.json`, and the coverage ledger.
   Stage only batch paths listed in the summary, using the existing
   `scripts/collection/stage.mjs`. Staff approve external facts in
   `/tools/review`. No command here marks results fully imported.
   Collector credentials are division-scoped: these batches require Knowledge
   access. A Times-only token cannot stage them. Keep separate credentials in
   ignored files with mode `0600`; do not widen another collector's access.

Discovery requests explicit annual windows from the newest year to the oldest
dated record exposed by a broad archive query. GoMotion currently over-returns
records after the requested end date; the collector filters locally and logs
that behavior. Archive availability does not establish exhaustive historical
coverage. Governance events, conventions, camps, placeholder tests, and events
ending after the cutoff are excluded and retained in `excluded-listings.json`.
Canceled competitions remain catalog entries. Outside competitions listed by
IES retain `sourceListingLscId` separately from actual LSC ownership.

The first pass uses a historical cutoff of October 12, 2026, cataloging available
event history back to October 2005 and observed archive entries back to 2023.
Recent 2026/2025 attachment acquisition comes first; older attachment, club
archive, calendar, and participant gaps remain explicit. The current master
calendar capture supplements corrections. The inspected 2026 PDF row crosswalk
at `sources/calendar-crosswalk.json` reconciles 24 past competition rows to
archived meets and retains date, host and cancellation differences. A changed
PDF hash requires a new inspected crosswalk. Calendar coverage remains partial.

## Participation and historical identity

HY3 bytes must pass the 130-byte/checksum validation before extraction. `C1`
provides a source team name/code/LSC context; it alone proves no attendance.
`E1/F1` records establish entries. Individual `E2` and relay `F2` records with
positive successful times, DQ, or DNF establish recorded participation. NS and
DFS remain entered; companion CL2 distinguishes individual DFS when present.
Unknown flags and broken contexts are retained as exceptions. No swimmer names,
membership IDs, birthdates or profiles are emitted into catalog observations.

Retain archive SHA-256, member, line, kind and status. Catalog records include a
bounded representative reference for each result kind/status, while
`participation-index.json` retains every extracted record reference and counts.
The parser retains recorded source courses from E2/F2 (SCY, SCM, LCM) in
`sourceCourses` and file capture evidence; these describe the supplied export,
not every possible course at a partially covered meet. The parser checks B1
meet dates/name against the target catalog meet; conflicting
identities are held for staff review with source proof. A narrower date range
inside the listed meet remains partial coverage.

Default team coverage is **partial**. Only an explicitly reviewed meet-wide
scope file supplied with `--scopes` may request complete coverage; parser
exceptions or a narrower file scope prevent that state. Observed club-filtered
exports always remain partial. Club affiliations are preserved separately from
school representation. Explicit school names are tagged as school; mascot
names are not guessed. An absent IES observation means unknown participation
unless complete reviewed evidence establishes absence.

`identity-crosswalk.json` holds date-specific identity candidates for review.
Automatic fuzzy matching is prohibited. To apply reviewed mappings, pass
`--mappings <json>` containing unique objects with `clubCode`, `lscCode`,
`representation`, `sourceNames`, `validFrom`, `validThrough`, `reviewed:true`,
and optional `catalogTeamId`/`operationalTeamId`. The interval must include the
meet date, and source evidence must support it. Source LSC affiliation at the
meet date is preserved even when catalog identity is unresolved.

Proposal merging preserves approved fields, identities and source evidence;
new aliases and observations are combined deterministically. Approved/source
conflicts remain visible in `catalogConflicts`. Repeated preparation against an
updated approved baseline produces no duplicate observations. Every staged
batch contains `reads` for all proposed paths, with `before:null` for new IDs,
so collection staging can reject stale approved snapshots. Keep staging and
approval separate. Batches are bounded to 100 writes and under 2 MB.

## Assisted selected work

Export selected meets from `/tools/review/meets`, then run:

```bash
python3 scripts/collection/collect-meets.py assisted \
  --selected <selected-export.json> --baseline <fresh-baseline.json> \
  --captures <optional-preserved-captures.json> --output <ignored-run-directory>
```

Every input row must explicitly be selected. The run honors saved priorities
and newest-date tie breaks, acquires available archives, indexes team
participation, and prepares metadata/participation batches for selected IDs
only. It writes `assisted-run.json` with a selected archive manifest (stable ID,
URL, retained path, SHA-256 and indexed/held status) for the follow-on phase.
Preparing individual/relay performance batches remains a separate human-assisted
step through staff review: retain visiting
teams, reconcile dates and identities, and explicitly disposition source
exceptions before declaring a meet complete. Automatic race imports and
background schedules are deferred. The prior individual-race prototype remains
at ignored `backups/ies-results/2026-10-10/prepare-results.py`; it is specific to
that original batch and is not a durable generic race-import CLI.

## Coverage and national expansion

`coverage-ledger.json` records annual source/window checks, returned and filtered
counts, unavailable records and unresolved gaps. `outreach-list.json` is a list
of uncontacted recovery requests. `database-coverage.json` supplies protected
coverage rows for the staff queue. Validate or load it with:

```bash
node scripts/collection/load-meet-coverage.mjs <database-coverage.json> --dry-run
node scripts/collection/load-meet-coverage.mjs <database-coverage.json> --local
```

Hosted loading uses `--staff`, the public Supabase configuration and an explicit
`VELOCITY_MEET_STAFF_ACCESS_TOKEN`. The loader verifies the user and `is_staff`
and uses RLS. A localhost-only local mode uses a local service key. Never save
the staff token or a service key into tracked files. Partial source checks stay
partial; finding a listing does not close a year/category coverage gap.

National discovery should expand from reviewed IES club aliases and historical
affiliation intervals, athlete/club histories, then adjacent Pacific Northwest,
Oregon, Snake River and Montana meets. Track club/athlete/year/source coverage,
and add each observed meet to the same catalog/queue. Sweep Sectionals, Zones,
Futures, Junior Nationals, Nationals, Trials, Pro Swim Series, open water and
associated time trials after those histories establish actual participation.
Preserve unattached affiliations and affiliation at meet time.

[USA Swimming Data Hub](https://www.usaswimming.org/times/popular-resources/data-hub),
approved exports and source-backed histories can support discovery. A best-time
snapshot cannot establish full meet history. The
[API application](https://websitedevsa.blob.core.windows.net/sitefinity/docs/default-source/technology/api-access-program-application.pdf?sfvrsn=c75c1932_1)
does not prove unrestricted historical retrieval. Access, historical
performance/meet identifiers, affiliation fields and retrieval completeness
remain explicit research questions; obtaining credentials/exports or contacting
IES/USA Swimming is a separate authorized action. Do not claim all national
meets have been found until authoritative history and gap reconciliation support
that conclusion.

Run parser and review-boundary checks with:

```bash
python3 -m unittest discover -s tests/collection -p 'test_*.py'
```

Use `npm run test:meets:database` and `npm run test:meets:browser` for local
queue checks. To validate an entire prepared run through the local queue:

```bash
node scripts/collection/validate-meet-catalog-local.mjs <prepared/summary.json>
```

The validation refuses hosted databases and removes its temporary catalog
records afterward.
