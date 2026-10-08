# Connected teams, people, venues, meets, and documents

All entities remain plain, read-only Firestore viewers. Stable document IDs connect records; labels, embedded venue information, and legacy attachments remain intact. The read-only schema map at `/tools/swim-resources/admin/map` explains these links alongside the other registered collections. No geographic map, specialized editor, or automatic contact/email collector is introduced.

| Collection | Links |
| --- | --- |
| `teams` | `contactPersonIds`, `venueIds`, `documentIds` |
| `people` | owning `teamId`, optional `athleteId`, `documentIds` |
| `venues` | owning `teamId`, `contactPersonIds`, `documentIds`; address, coordinates and pool courses |
| `meets` | owning `teamId`, separate `hostTeamId`, `venueId`, `contactPersonIds`, `documentIds` |
| `documents` | owning `teamId`, optional `meetId`, `venueId`, `personId`, `athleteId`; source `url`, `type`, `publishedAt` |
| `athletes` | owning `teamId`, optional `personId`, `documentIds`; private demographics and contact remain canonical here |
| `swims` | owning `teamId`, existing `athleteId` and embedded `meet.id` |

People can represent coaches, organizers, parents, officials, or other contacts; `role` is plain text. Athlete-linked person records provide a directory identity and point to the athlete's canonical details. The backfill copies only the athlete's name and relationship, never DOB, contact details or coaching notes. Names in a person record are stored facts; later name corrections should be reviewed for both linked records. Other contacts store their own email and phone. Private collections do not change the public athlete projection.

Teams can store published `lscCode`, `clubCode`, `location`, club `email`/`phone` and `mailingAddress`, with evidence on each imported field. `location` preserves the directory's service-area label, including multiple cities. A mailing address or city label never creates a venue or invented pool coordinates. Published coaches are linked people assigned explicitly to their own club; the Velocity ownership default applies only when ownership is missing. Teams can be filtered by LSC or club code in the shared viewer.

Goals, Film Sessions and stored Records are retired from the active model. Ownership backfills and related-data links exclude `goals`, `film_sessions` and `records`; historical archives retain their original records. Team records use swim facts directly, while athlete bests remain an intentional projection.

## Velocity ownership

`velocity-swimming` identifies Velocity Swimming. All legacy team-specific records without ownership resolve to this team in the viewer. Explicit team assignments are preserved. Standards, public projections and import audit/state records are not assigned to a team automatically. A meet being owned by Velocity does not mean Velocity hosts it or owns its pool.

The viewer renders relationship IDs as document links and provides incoming links as ordinary filtered collection queries. Related queries match persisted fields only; they do not perform joins, scan the database, or invent missing records. Broken legacy links display the standard missing-document state. Missing Velocity's team document displays an explanation of the configured default.

## Reviewed writes and backfill

Use Import for new entities and relationship changes. Parent records must exist before dependent rows are previewed, including the stored Velocity team in the fresh database. Explicit links use distinct stable IDs. Applying a selection verifies linked snapshots and the target snapshot transactionally. Import receipts and guarded reversal remain private. A new non-race entity cannot be reversed into deletion.

For existing records:

```sh
node scripts/swim-resources/backfill-entity-links.mjs --project <confirmed-project> --database '(default)' --firebase-cli
```

This defaults to a read-only dry run and prints counts only. Applying requires `--apply`, `--confirm-project <same-project>` and `--confirm-database '(default)'`. This legacy backfill rejects velocity-v2. The initial live backfill was separately authorized and completed on 2026-10-06 against `coach-cutter-ptolemy`.

The backfill creates the Velocity team if missing, adds missing owning team IDs, and creates deterministic athlete-linked people records plus athlete `personId` links. It reads 200 records at a time and processes at most eight records concurrently. Dry runs use the loaded snapshots without write transactions; apply re-reads and updates each athlete/person pair transactionally. It preserves explicit owners and existing person fields, and refuses mismatched person identities. Before each write it records the previous document in a private ignored `backups/entity-links-before-*.jsonl` file. Transaction retries can produce duplicate backup entries. Runs are repeatable; an interrupted run can be resumed, and earlier completed documents remain applied. The script adds links only; it never guesses host teams, venue matches, attachment identities, or parent identities from names.

The new collections require the updated local Firestore rules. Rules deployment and live backfill are separate release actions; public pages remain unchanged.


## Live activation — 2026-10-06

The updated rules were deployed to `coach-cutter-ptolemy`. The backfill assigned Velocity ownership to 2,746 existing records, created the Velocity team and 178 private athlete-linked people records, and linked all 178 athletes. Verification compared 4,367 document fingerprints with the expected result: zero mismatches or unexpected documents. Existing athlete details, public profiles, best times, standards, and import receipts were preserved. Anonymous reads of private collections were denied; the existing verified coach browser session successfully read the new Teams collection. The before-write backups and counts-only verification report are stored in ignored private `backups/` files. No hosted frontend deployment or Git commit was performed.

Fresh `velocity-v2` data uses reviewed population and private evidence/revisions rather than historical backfill; see [the fresh dataset guide](FRESH-DATASET.md).
